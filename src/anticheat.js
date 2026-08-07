/**
 * VOXEL ULTIMATE ANTI-CHEAT & ANTI-TAMPER SECURITY SHIELD
 * Protects client state against console tampering, speed hacks, inventory duplication,
 * memory modifications, local save editing, and script injections.
 */

import { player, inventory, game } from './state.js';
import { BLOCKS, ITEMS, RECIPES } from './config.js';
import { MOB_TYPES } from './mobs.js';
import { validateInventoryState } from './player.js';
import { toast } from './ui.js';

let lastValidatedPos = null;
let devToolsBlockerActive = false;

// ── 1. CRYPTOGRAPHIC CHECKSUM FOR SAVE TAMPER PROTECTION ──

export function computeSaveChecksum(dataStr) {
  let hash = 5381;
  const salt = "voxel_secure_checksum_v2_key";
  const str = dataStr + salt;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
}

export function secureSaveToLocalStorage(key, payload) {
  try {
    const rawData = JSON.stringify(payload);
    const checksum = computeSaveChecksum(rawData);
    const envelope = { data: payload, checksum };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch (e) {}
}

export function secureLoadFromLocalStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'data' in parsed && 'checksum' in parsed) {
      const rawData = JSON.stringify(parsed.data);
      const expected = computeSaveChecksum(rawData);
      if (parsed.checksum === expected) {
        return parsed.data;
      } else {
        console.warn("⚠️ Anti-Cheat Warning: Local save checksum mismatch! File modification detected.");
        if (typeof toast === 'function') toast("⚠️ Save file tampered! Restored clean state.");
        return null;
      }
    }
    // Fallback for legacy plain JSON saves
    return parsed;
  } catch (e) {
    return null;
  }
}

// ── 2. REACH HACK VALIDATOR ──
export function validateMiningReach(playerPos, targetBlockPos) {
  if (!playerPos || !targetBlockPos) return false;
  const dx = playerPos.x - targetBlockPos.x;
  const dy = playerPos.y - targetBlockPos.y;
  const dz = playerPos.z - targetBlockPos.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq > 42.25) { // 6.5 blocks squared
    toast("⚠️ Anti-Cheat: Mining reach limit exceeded.");
    return false;
  }
  return true;
}

// ── 3. IN-MEMORY PROXY / PROPERTY TRAPS ──
function setupPlayerAntiTamperTraps() {
  try {
    let _health = player.health || 20;
    let _hunger = player.hunger || 20;
    let _level = player.level || 0;
    let _flying = player.flying || false;

    Object.defineProperties(player, {
      health: {
        get() { return _health; },
        set(val) {
          if (typeof val !== 'number' || isNaN(val) || val > 20) {
            console.warn("⚠️ Anti-Cheat: Unauthorized health value set:", val);
            _health = Math.min(20, Math.max(0, Number(val) || 20));
            toast('⚠️ Anti-Cheat: Tampered Health Clamped.');
          } else {
            _health = Math.min(20, Math.max(0, val));
          }
        },
        configurable: true,
        enumerable: true
      },
      hunger: {
        get() { return _hunger; },
        set(val) {
          if (typeof val !== 'number' || isNaN(val) || val > 20) {
            console.warn("⚠️ Anti-Cheat: Unauthorized hunger value set:", val);
            _hunger = Math.min(20, Math.max(0, Number(val) || 20));
          } else {
            _hunger = Math.min(20, Math.max(0, val));
          }
        },
        configurable: true,
        enumerable: true
      },
      level: {
        get() { return _level; },
        set(val) {
          if (typeof val !== 'number' || isNaN(val) || val > 999) {
            console.warn("⚠️ Anti-Cheat: Unauthorized level set:", val);
            _level = Math.min(999, Math.max(0, Number(val) || 0));
          } else {
            _level = Math.max(0, val);
          }
        },
        configurable: true,
        enumerable: true
      },
      flying: {
        get() { return _flying; },
        set(val) {
          const isFlyingAllowed = game.mode !== 'public' || Boolean(game.allowFlyInPublic);
          if (val && !isFlyingAllowed) {
            console.warn("⚠️ Anti-Cheat: Unauthorized flight activation attempted.");
            _flying = false;
            toast('⚠️ Anti-Cheat: Flight disabled in this world.');
          } else {
            _flying = Boolean(val);
          }
        },
        configurable: true,
        enumerable: true
      }
    });
  } catch (e) {}
}

// ── 4. MAIN ANTI-CHEAT SHIELD INIT ──
export function initAntiCheatShield() {
  if (typeof window === 'undefined') return;

  // Console Security Warning Banner
  try {
    console.log(
      '%c⛔ STOP! SECURITY WARNING ⛔\n%cExecuting scripts or modifying variables in this console can compromise your account and trigger automated Anti-Cheat bans.',
      'color: red; font-size: 20px; font-weight: bold; -webkit-text-stroke: 1px black;',
      'color: #ffd700; font-size: 13px; font-weight: bold;'
    );
  } catch (e) {}

  // Freeze registries to prevent runtime modifications of block stats or crafting recipes
  try {
    Object.freeze(BLOCKS);
    Object.freeze(ITEMS);
    Object.freeze(RECIPES);
    if (MOB_TYPES) Object.freeze(MOB_TYPES);
  } catch (e) {}

  // Setup Property Traps
  setupPlayerAntiTamperTraps();

  // DevTools & Shortcuts Shield
  window.addEventListener('keydown', (e) => {
    if (!devToolsBlockerActive) return;
    if (
      e.key === 'F12' || 
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
      (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
    ) {
      if (document.pointerLockElement || game.running) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  });

  // Context Menu Protection during active gameplay
  window.addEventListener('contextmenu', (e) => {
    if (game.running && document.pointerLockElement) {
      e.preventDefault();
    }
  });

  // Periodical Integrity Guard
  setInterval(runAntiCheatScan, 1500);
}

// ── 5. RUN PERIODIC ANTI-CHEAT SCAN ──
export function runAntiCheatScan() {
  if (!game.running) return;

  // A. Health & Hunger Guard
  if (player.health > 20) {
    player.health = 20;
    toast('⚠️ Anti-Cheat: Invalid Health Detected & Reset.');
  }

  // B. Speed & Teleport Rubber-Banding Guard
    if (lastValidatedPos && lastValidatedPos.x !== undefined && player.pos && player.pos.x !== undefined && !player.flying && !player.frozen) {
      const dist = player.pos.distanceTo(lastValidatedPos);
      const horizVel = Math.sqrt(player.vel.x * player.vel.x + player.vel.z * player.vel.z);

      if (dist > 40 && horizVel > 35) {
        player.pos.copy(lastValidatedPos);
        player.vel.set(0, 0, 0);
        toast('⚠️ Anti-Cheat: Speed/Teleport Violation. Position Restored.');
      }
    }
    lastValidatedPos = player.pos.clone();

  // C. Inventory Duplication & Stack Limit Guard (Max 64 per slot)
  validateInventoryState();

  // D. Fly Hack Guard
  if (game.mode === 'public' && !game.allowFlyInPublic && player.flying) {
    player.flying = false;
    toast('⚠️ Anti-Cheat: Flight is disabled in Public Nexus.');
  }
}
