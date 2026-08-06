import { world, player, game, inventory, hotbar, reactBridge } from './state.js';
import { getBlock, setBlock, spawnBreakBurst } from './world.js';
import { BLOCKS, ITEMS, thingName } from './config.js';

// ---- Redstone Global State ----
export const redstonePowerMap = new Map(); // key "x,y,z" -> power (0-15)
export const leverStates = new Set();      // set of "x,y,z" keys for active Levers
export const buttonStates = new Map();     // key "x,y,z" -> expire timestamp (ms)
export const repeaterDelays = new Map();   // key "x,y,z" -> delay setting (1-4 ticks)
export const comparatorModes = new Map();  // key "x,y,z" -> mode 0 (compare) or 1 (subtract)
export const pistonExtended = new Map();   // key "x,y,z" -> facing direction object {dx,dy,dz}

// Helper coordinate string format
export function posKey(x, y, z) {
  return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
}

export function parsePosKey(key) {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}

// Direction vectors
export const CARDINAL_DIRECTIONS = [
  { dx: 1, dy: 0, dz: 0 },
  { dx: -1, dy: 0, dz: 0 },
  { dx: 0, dy: 1, dz: 0 },
  { dx: 0, dy: -1, dz: 0 },
  { dx: 0, dy: 0, dz: 1 },
  { dx: 0, dy: 0, dz: -1 }
];

export const HORIZONTAL_DIRECTIONS = [
  { dx: 1, dy: 0, dz: 0 },
  { dx: -1, dy: 0, dz: 0 },
  { dx: 0, dy: 0, dz: 1 },
  { dx: 0, dy: 0, dz: -1 }
];

// ---- Power Queries ----
export function getRedstonePower(x, y, z) {
  return redstonePowerMap.get(posKey(x, y, z)) || 0;
}

export function setRedstonePower(x, y, z, power) {
  const key = posKey(x, y, z);
  const clamped = Math.max(0, Math.min(15, Math.floor(power)));
  if (clamped > 0) {
    redstonePowerMap.set(key, clamped);
  } else {
    redstonePowerMap.delete(key);
  }
}

// Calculate Container Capacity Fill for Comparators (0 to 15)
export function getContainerPowerLevel(x, y, z) {
  const key = posKey(x, y, z);
  world.chests = world.chests || {};
  world.furnaces = world.furnaces || {};

  if (world.chests[key] && Array.isArray(world.chests[key])) {
    const slots = world.chests[key];
    let totalItems = 0;
    let maxItems = slots.length * 64;
    for (const slot of slots) {
      if (slot && slot.id > 0) totalItems += (slot.count || 1);
    }
    if (totalItems === 0) return 0;
    return Math.max(1, Math.min(15, Math.floor((totalItems / maxItems) * 15)));
  }

  if (world.furnaces[key]) {
    const f = world.furnaces[key];
    let items = (f.inputCount || 0) + (f.fuelCount || 0) + (f.outputCount || 0);
    if (items === 0) return 0;
    return Math.max(1, Math.min(15, Math.floor((items / 192) * 15)));
  }

  return 0;
}

// Calculate Power Source Output at (x,y,z)
export function getSourcePowerOutput(x, y, z) {
  const id = getBlock(x, y, z);
  const key = posKey(x, y, z);

  // Redstone Block (ID 62)
  if (id === 62) return 15;

  // Redstone Torch (ID 61) - Inverts power from block below
  if (id === 61) {
    const belowPower = getRedstonePower(x, y - 1, z);
    return belowPower > 0 ? 0 : 15;
  }

  // Lever (ID 66)
  if (id === 66 && leverStates.has(key)) return 15;

  // Stone Button (ID 67)
  if (id === 67 && buttonStates.has(key)) {
    if (Date.now() < buttonStates.get(key)) return 15;
  }

  // Pressure Plates (Wooden 68 / Stone 69)
  if (id === 68 || id === 69) {
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    const isPlayerOn = Math.abs(px - (x + 0.5)) < 0.6 && Math.abs(py - y) < 0.8 && Math.abs(pz - (z + 0.5)) < 0.6;
    if (isPlayerOn) return 15;
  }

  // Daylight Sensor (ID 74)
  if (id === 74) {
    const tod = game.timeOfDay || 0;
    // Highest power at solar noon (tod = 0.5), lowest at night
    const sunFactor = Math.max(0, Math.sin(tod * Math.PI * 2));
    return Math.floor(sunFactor * 15);
  }

  // Tripwire Hook (ID 75)
  if (id === 75 && leverStates.has(key)) return 15;

  // Redstone Repeater (ID 70)
  if (id === 70) {
    const maxBackSignal = Math.max(
      getRedstonePower(x + 1, y, z),
      getRedstonePower(x - 1, y, z),
      getRedstonePower(x, y, z + 1),
      getRedstonePower(x, y, z - 1)
    );
    return maxBackSignal > 0 ? 15 : 0;
  }

  // Redstone Comparator (ID 71)
  if (id === 71) {
    let containerP = 0;
    for (const dir of HORIZONTAL_DIRECTIONS) {
      containerP = Math.max(containerP, getContainerPowerLevel(x + dir.dx, y, z + dir.dz));
    }
    const maxSideP = Math.max(
      getRedstonePower(x + 1, y, z),
      getRedstonePower(x - 1, y, z),
      getRedstonePower(x, y, z + 1),
      getRedstonePower(x, y, z - 1)
    );
    const mode = comparatorModes.get(key) || 0;
    const baseP = Math.max(containerP, maxSideP);
    if (mode === 1) { // Subtract mode
      return Math.max(0, baseP - maxSideP);
    }
    return baseP >= maxSideP ? baseP : 0;
  }

  return 0;
}

// ---- Redstone Propagation & Network Update ----
export function updateRedstoneNetworkAround(centerX, centerY, centerZ, radius = 16) {
  const visited = new Set();
  const queue = [];

  const startX = Math.floor(centerX) - radius;
  const endX = Math.floor(centerX) + radius;
  const startY = Math.max(0, Math.floor(centerY) - 8);
  const endY = Math.min(255, Math.floor(centerY) + 8);
  const startZ = Math.floor(centerZ) - radius;
  const endZ = Math.floor(centerZ) + radius;

  // 1. Identify all direct power sources in radius
  for (let x = startX; x <= endX; x++) {
    for (let y = startY; y <= endY; y++) {
      for (let z = startZ; z <= endZ; z++) {
        const key = posKey(x, y, z);
        const sourceP = getSourcePowerOutput(x, y, z);
        if (sourceP > 0) {
          redstonePowerMap.set(key, sourceP);
          queue.push({ x, y, z, power: sourceP });
          visited.add(key);
        } else {
          redstonePowerMap.delete(key);
        }
      }
    }
  }

  // 2. Propagate power across Redstone Wires (ID 60)
  while (queue.length > 0) {
    const { x, y, z, power } = queue.shift();
    if (power <= 1) continue;

    for (const dir of CARDINAL_DIRECTIONS) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      const nz = z + dir.dz;
      const nKey = posKey(nx, ny, nz);
      const targetId = getBlock(nx, ny, nz);

      // Redstone Wire receives power decaying by 1 per block
      if (targetId === 60 || targetId === 61 || targetId === 63 || targetId === 64 || targetId === 70 || targetId === 71 || targetId === 56 || targetId === 72 || targetId === 73) {
        const nextPower = power - 1;
        const currentP = redstonePowerMap.get(nKey) || 0;
        if (nextPower > currentP) {
          redstonePowerMap.set(nKey, nextPower);
          visited.add(nKey);
          queue.push({ x: nx, y: ny, z: nz, power: nextPower });
        }
      }
    }
  }

  // 3. Trigger mechanical components based on updated redstone power
  for (let x = startX; x <= endX; x++) {
    for (let y = startY; y <= endY; y++) {
      for (let z = startZ; z <= endZ; z++) {
        const id = getBlock(x, y, z);
        const p = getRedstonePower(x, y, z);

        // TNT (ID 56) ignition
        if (id === 56 && p > 0) {
          setBlock(x, y, z, 0, false);
          if (typeof window !== 'undefined' && typeof window.__spawnPrimedTnt === 'function') {
            window.__spawnPrimedTnt(x, y, z);
          }
        }

        // Piston (ID 63) and Sticky Piston (ID 64)
        if (id === 63 || id === 64) {
          handlePistonUpdate(x, y, z, id, p);
        }

        // Dispenser (ID 72) and Dropper (ID 73)
        if ((id === 72 || id === 73) && p > 0) {
          handleDispenserDropperTrigger(x, y, z, id);
        }
      }
    }
  }
}

// ---- Mechanical Piston Engine ----
function handlePistonUpdate(x, y, z, pistonId, power) {
  const key = posKey(x, y, z);
  const isCurrentlyExtended = pistonExtended.has(key);
  const shouldExtend = power > 0;

  if (shouldExtend && !isCurrentlyExtended) {
    // Determine push direction (up by default, or facing adjacent air)
    let pushDir = { dx: 0, dy: 1, dz: 0 };
    for (const dir of CARDINAL_DIRECTIONS) {
      const neighborId = getBlock(x + dir.dx, y + dir.dy, z + dir.dz);
      if (neighborId === 0 || neighborId === 65) {
        pushDir = dir;
        break;
      }
    }

    const headX = x + pushDir.dx;
    const headY = y + pushDir.dy;
    const headZ = z + pushDir.dz;
    const headBlock = getBlock(headX, headY, headZ);

    // Push block chain up to 12 blocks ahead if space exists
    let pushableChain = [];
    let currentX = headX, currentY = headY, currentZ = headZ;
    let canPush = true;

    for (let i = 0; i < 12; i++) {
      const bId = getBlock(currentX, currentY, currentZ);
      if (bId === 0 || bId === 8 || bId === 9) break; // Air or fluid line end
      if (bId === 30 || bId === 62 || currentY < 1 || currentY >= 127) { canPush = false; break; } // Obsidian / immovable / world boundary
      pushableChain.push({ x: currentX, y: currentY, z: currentZ, id: bId });
      currentX += pushDir.dx;
      currentY += pushDir.dy;
      currentZ += pushDir.dz;
    }

    // Strict 12-block push limit: if 12th block is solid and has no open space behind it, cancel push
    if (pushableChain.length === 12) {
      const tailId = getBlock(currentX, currentY, currentZ);
      if (tailId !== 0 && tailId !== 8 && tailId !== 9) {
        canPush = false;
      }
    }

    if (canPush) {
      // Push chain from back to front
      for (let i = pushableChain.length - 1; i >= 0; i--) {
        const item = pushableChain[i];
        setBlock(item.x + pushDir.dx, item.y + pushDir.dy, item.z + pushDir.dz, item.id, false);
      }

      // Place Piston Head (ID 65)
      setBlock(headX, headY, headZ, 65, false);
      pistonExtended.set(key, pushDir);
    }
  } else if (!shouldExtend && isCurrentlyExtended) {
    // Retract piston
    const pushDir = pistonExtended.get(key) || { dx: 0, dy: 1, dz: 0 };
    const headX = x + pushDir.dx;
    const headY = y + pushDir.dy;
    const headZ = z + pushDir.dz;

    if (getBlock(headX, headY, headZ) === 65) {
      setBlock(headX, headY, headZ, 0, false);
    }

    // Sticky Piston (ID 64) pulls attached block back
    if (pistonId === 64) {
      const pulledX = headX + pushDir.dx;
      const pulledY = headY + pushDir.dy;
      const pulledZ = headZ + pushDir.dz;
      const pulledId = getBlock(pulledX, pulledY, pulledZ);
      if (pulledId > 0 && pulledId !== 30 && pulledId !== 65) {
        setBlock(headX, headY, headZ, pulledId, false);
        setBlock(pulledX, pulledY, pulledZ, 0, false);
      }
    }

    pistonExtended.delete(key);
  }
}

// ---- Dispenser & Dropper Ejection Engine ----
const triggeredDevices = new Set();

function handleDispenserDropperTrigger(x, y, z, blockId) {
  const key = posKey(x, y, z);
  if (triggeredDevices.has(key)) return;
  triggeredDevices.add(key);

  setTimeout(() => triggeredDevices.delete(key), 800);

  // Eject front coordinates
  const frontX = x;
  const frontY = y + 1;
  const frontZ = z;

  if (blockId === 72) { // Dispenser
    // Check if player has arrows or water buckets
    if (inventory[147] && inventory[147] > 0) { // Arrow
      inventory[147]--;
      if (inventory[147] <= 0) delete inventory[147];
      if (typeof window !== 'undefined' && typeof window.__spawnProjectile === 'function') {
        window.__spawnProjectile(frontX, frontY, frontZ, { x: 0, y: 1, z: 0 }, 20, true);
      }
    } else if (inventory[145] && inventory[145] > 0) { // Water Bucket
      inventory[145]--;
      inventory[144] = (inventory[144] || 0) + 1; // Empty bucket returned
      setBlock(frontX, frontY, frontZ, 8, false);
    } else {
      // Eject generic item drop
      if (typeof window !== 'undefined' && typeof window.__spawnItemDrop === 'function') {
        window.__spawnItemDrop(101, 1, frontX, frontY, frontZ);
      }
    }
  } else if (blockId === 73) { // Dropper
    // Deposit item into adjacent chest if present, else spawn item drop
    const chestKey = posKey(frontX, frontY, frontZ);
    world.chests = world.chests || {};
    if (world.chests[chestKey] && Array.isArray(world.chests[chestKey])) {
      const chestSlots = world.chests[chestKey];
      const emptySlot = chestSlots.find(s => s && s.id === 0);
      if (emptySlot) {
        emptySlot.id = 101; // Eject Coal or item
        emptySlot.count = 1;
      }
    } else {
      if (typeof window !== 'undefined' && typeof window.__spawnItemDrop === 'function') {
        window.__spawnItemDrop(101, 1, frontX, frontY, frontZ);
      }
    }
  }
}

// ---- Interactivity Handlers ----
export function toggleLever(x, y, z) {
  const key = posKey(x, y, z);
  if (leverStates.has(key)) {
    leverStates.delete(key);
  } else {
    leverStates.add(key);
  }
  updateRedstoneNetworkAround(x, y, z, 16);
  if (reactBridge.updateUI) reactBridge.updateUI();
}

export function pressButton(x, y, z) {
  const key = posKey(x, y, z);
  buttonStates.set(key, Date.now() + 1000); // 1.0 second active pulse
  updateRedstoneNetworkAround(x, y, z, 16);
  if (reactBridge.updateUI) reactBridge.updateUI();
}

export function cycleRepeaterDelay(x, y, z) {
  const key = posKey(x, y, z);
  const current = repeaterDelays.get(key) || 1;
  const next = (current % 4) + 1;
  repeaterDelays.set(key, next);
  updateRedstoneNetworkAround(x, y, z, 16);
  if (reactBridge.updateUI) reactBridge.updateUI();
}

export function toggleComparatorMode(x, y, z) {
  const key = posKey(x, y, z);
  const current = comparatorModes.get(key) || 0;
  const next = current === 0 ? 1 : 0;
  comparatorModes.set(key, next);
  updateRedstoneNetworkAround(x, y, z, 16);
  if (reactBridge.updateUI) reactBridge.updateUI();
}

// ---- Main Game Loop Tick Update ----
export function tickRedstone(dt) {
  if (!player || !player.pos) return;

  // Clean expired button states
  const now = Date.now();
  for (const [key, expireTime] of buttonStates.entries()) {
    if (now >= expireTime) {
      buttonStates.delete(key);
      const { x, y, z } = parsePosKey(key);
      updateRedstoneNetworkAround(x, y, z, 8);
    }
  }

  // Periodic redstone network refresh around player
  updateRedstoneNetworkAround(player.pos.x, player.pos.y, player.pos.z, 16);
}
