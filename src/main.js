import * as THREE from 'three';
import { keys, touch, player, inventory, hotbar, game, webgl, avatarCallbacks, world, reactBridge, toolDurability, crops, achievements } from './state.js';
import { 
  CHUNK, HEIGHT, RENDER_DIST, SEA, SEED, BLOCKS, ITEMS, parentTiles, 
  tileFor, tileUV, isSolid, isPlaceable, thingName, resolveRecipe, thingColor, surfaceHeight
} from './config.js';
import { 
  Chunk, getChunk, generateChunk, getBlock, setBlock, getLightGlobal, 
  computeChunkLight, relightAround, updateChunkMesh, disposeMesh, 
  updateChunkLoading, processGenBudget, buildAtlas, buildCrackTexture, 
  showCrack, hideCrack, spawnBreakBurst, updateParticles, initParticles,
  disturbWater, tickWater, wkey, setWater, WATER_TICK, queueWater, genQueue,
  createWaterMaterial, getTileDataURL, triggerWorldExplosion
} from './world.js';
import { 
  spawnPlayer, collidesAt, moveAxis, updatePlayer, hurtPlayer, healPlayer, 
  feedPlayer, eatSelected, updateSurvival, playerDie, respawnPlayer, 
  invCount, addItem, removeItem, heldTool, heldItem, unstick, eyePos, lookDir,
  getIntersectingColliders, getSupportingSurface
} from './player.js';
import { updatePlayerPresenceInRoom } from './firebase.js';
import { initAntiCheatShield, validateMiningReach } from './anticheat.js';
import { 
  MOB_TYPES, makeMobMesh, spawnMob, trySpawnMobs, updateMobs, removeMob, attackMob, tryFeedAnimal, emitSoundEvent 
} from './mobs.js';
import { 
  tickRedstone, toggleLever, pressButton, cycleRepeaterDelay, toggleComparatorMode 
} from './redstone.js';
import { openTradePrompt } from './villagers/villagerTrading.js';
import { getTradesByProfession, TRADE_CATALOGUE } from './villagers/villagerTradeCatalog.js';
import { 
  initUI, toast, updateHUD, updateClock, updateStatsHUD, flashDamage, 
  showDeathScreen, hideDeathScreen, buildHotbar, selectSlot, refreshCounts, 
  openCraft, closeCraft, closeChest, closeFurnace, craft, saveWorld, scheduleSave, loadWorld, getCraftOpen,
  openChest, openFurnace, isMenuOpen, tickFurnaces, uiState,
  setChestOpen, setFurnaceOpen, setActiveChestCoords, setActiveFurnaceCoords,
  unlockAchievement
} from './ui.js';
import { playPlaceSound, playMineSound, playHitSound, playHissSound, playExplodeSound } from './audio.js';
import { activeNavigation, findPath, updatePathTrail, tickPathTrail, clearActiveNavigation } from './pathfinder.js';

export const itemDrops = [];
if (typeof window !== 'undefined') window.itemDrops = itemDrops;

// Helper: Voxel terrain collision check for item entity bounding box (half-width hw, height hh)
function itemCollides(px, py, pz, hw = 0.12, hh = 0.24) {
  const minX = Math.floor(px - hw);
  const maxX = Math.floor(px + hw);
  const minY = Math.floor(py);
  const maxY = Math.floor(py + hh);
  const minZ = Math.floor(pz - hw);
  const maxZ = Math.floor(pz + hw);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (isSolid(getBlock(x, y, z))) {
          return true;
        }
      }
    }
  }
  return false;
}

export function spawnItemDrop(id, count, x, y, z) {
  if (typeof id !== 'number' || isNaN(id) || (!BLOCKS[id] && !ITEMS[id])) return;
  if (typeof count !== 'number' || isNaN(count) || count <= 0) return;
  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;

  // Max active entity cap protection (100 max active 3D drops) to prevent memory DoS attacks
  if (itemDrops.length >= 100) {
    const oldest = itemDrops.shift();
    if (oldest && oldest.mesh) {
      if (webgl.scene) webgl.scene.remove(oldest.mesh);
      if (oldest.mesh.geometry) oldest.mesh.geometry.dispose();
      if (oldest.mesh.material) oldest.mesh.material.dispose();
    }
  }

  const safeCount = Math.min(64, Math.floor(count));
  if (typeof window !== 'undefined') {
    window.__spawnItemDrop = spawnItemDrop;
    window.__spawnPrimedTnt = spawnPrimedTnt;
    window.__detonateRemoteTnt = detonateRemoteTnt;
    window.__spawnProjectile = spawnProjectile;
  }
  const col = thingColor(id);
  const placeable = isPlaceable(id);
  
  let mesh;
  if (webgl.atlasTex) {
    const isBlock = placeable && BLOCKS[id];
    const geo = isBlock 
      ? new THREE.BoxGeometry(0.24, 0.24, 0.24) 
      : new THREE.BoxGeometry(0.20, 0.20, 0.05);
    const faceMap = [4, 5, 0, 1, 2, 3];
    const uvAttr = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const faceIdx = faceMap[f];
      const tile = tileFor(id, faceIdx);
      const uv = tileUV(tile);
      const baseIdx = f * 4;
      uvAttr.setXY(baseIdx + 0, uv.u0, uv.v1);
      uvAttr.setXY(baseIdx + 1, uv.u1, uv.v1);
      uvAttr.setXY(baseIdx + 2, uv.u0, uv.v0);
      uvAttr.setXY(baseIdx + 3, uv.u1, uv.v0);
    }
    uvAttr.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: webgl.atlasTex, transparent: true, alphaTest: 0.1 });
    mesh = new THREE.Mesh(geo, mat);
  } else {
    const geo = new THREE.BoxGeometry(0.20, 0.20, 0.05);
    const mat = new THREE.MeshLambertMaterial({ color: col });
    mesh = new THREE.Mesh(geo, mat);
  }

  mesh.position.set(x, y + 0.1, z);
  if (webgl.scene) webgl.scene.add(mesh);

  const drop = {
    id, count: safeCount, mesh,
    pos: new THREE.Vector3(x, y + 0.1, z),
    vel: new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      2.0 + Math.random() * 0.5,
      (Math.random() - 0.5) * 1.5
    ),
    spawnTime: performance.now(),
    onGround: false,
    collidedHoriz: false,
    collidedVert: false,
    state: 'falling' // 'falling', 'resting', 'attracting'
  };
  itemDrops.push(drop);
}

export function updateItemDrops(dt) {
  if (!webgl.scene || itemDrops.length === 0) return;
  const now = performance.now();
  const playerTarget = player.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
  const safeDt = Math.min(dt, 0.05);

  const hw = 0.12;
  const hh = 0.24;
  const gravityAccel = -22.0;

  for (let i = itemDrops.length - 1; i >= 0; i--) {
    const d = itemDrops[i];
    d.mesh.rotation.y += safeDt * 3.5;

    const dist = d.pos.distanceTo(playerTarget);
    const isPickupEligible = (dist < 2.5 && now - d.spawnTime > 150 && !player.dead);

    d.collidedHoriz = false;
    d.collidedVert = false;

    if (isPickupEligible) {
      d.state = 'attracting';
      d.onGround = false;

      // Blend magnetic attraction force with existing velocity & physics (no freezing)
      const dir = playerTarget.clone().sub(d.pos).normalize();
      const magnetStrength = 26.0;
      d.vel.addScaledVector(dir, magnetStrength * safeDt);

      // Apply light gravity & air damping during attraction pull
      d.vel.y += -8.0 * safeDt;
      d.vel.multiplyScalar(Math.pow(0.88, safeDt * 60));

      // Update position with physics velocity
      d.pos.addScaledVector(d.vel, safeDt);
      d.mesh.position.copy(d.pos);

      // Collect item when within 1.2 block radius
      if (dist < 1.2) {
        if (d.id === 150) {
          const healAmt = 4 * d.count;
          player.health = Math.min(20, player.health + healAmt);
          toast(`❤️ Collected Heart Pickup! Restored +${healAmt} HP (+${healAmt / 2} Hearts)!`);
          webgl.scene.remove(d.mesh);
          if (d.mesh.geometry) d.mesh.geometry.dispose();
          if (d.mesh.material) d.mesh.material.dispose();
          itemDrops.splice(i, 1);
          if (reactBridge.updateUI) reactBridge.updateUI();
          continue;
        } else {
          const added = addItem(d.id, d.count);
          if (added > 0) {
            d.count -= added;
            toast(`Picked up +${added} ${thingName(d.id)}`);
            if (reactBridge.updateUI) reactBridge.updateUI();
          }
          if (d.count <= 0) {
            webgl.scene.remove(d.mesh);
            if (d.mesh.geometry) d.mesh.geometry.dispose();
            if (d.mesh.material) d.mesh.material.dispose();
            itemDrops.splice(i, 1);
            continue;
          } else {
            // Inventory is full for this item! Push drop back slightly with 1.2s cooldown
            d.state = 'resting';
            d.spawnTime = now + 1200; // 1.2s pickup cooldown
            d.onGround = false;
            d.vel.set((Math.random() - 0.5) * 2.0, 2.5, (Math.random() - 0.5) * 2.0);
          }
        }
      }
    } else {
      // Standard Voxel Terrain Physics & Gravity
      if (!d.onGround) {
        d.vel.y += gravityAccel * safeDt;
        d.vel.x *= Math.pow(0.98, safeDt * 60);
        d.vel.z *= Math.pow(0.98, safeDt * 60);
      } else {
        // Ground friction
        d.vel.x *= Math.pow(0.5, safeDt * 60);
        d.vel.z *= Math.pow(0.5, safeDt * 60);
        if (Math.hypot(d.vel.x, d.vel.z) < 0.01) {
          d.vel.x = 0;
          d.vel.z = 0;
        }
      }

      // Axis 1: Move X
      const newX = d.pos.x + d.vel.x * safeDt;
      if (itemCollides(newX, d.pos.y, d.pos.z, hw, hh)) {
        d.vel.x = -d.vel.x * 0.3;
        d.collidedHoriz = true;
      } else {
        d.pos.x = newX;
      }

      // Axis 2: Move Z
      const newZ = d.pos.z + d.vel.z * safeDt;
      if (itemCollides(d.pos.x, d.pos.y, newZ, hw, hh)) {
        d.vel.z = -d.vel.z * 0.3;
        d.collidedHoriz = true;
      } else {
        d.pos.z = newZ;
      }

      // Axis 3: Move Y
      const newY = d.pos.y + d.vel.y * safeDt;
      if (itemCollides(d.pos.x, newY, d.pos.z, hw, hh)) {
        d.collidedVert = true;
        if (d.vel.y < 0) {
          // Landing on top of solid block
          d.onGround = true;
          d.vel.y = 0;
          const landingY = Math.floor(newY);
          d.pos.y = landingY + 1.0;
        } else {
          // Hitting ceiling
          d.vel.y = 0;
        }
      } else {
        d.pos.y = newY;
        // Check if block underneath was removed/mined
        const isSupported = itemCollides(d.pos.x, d.pos.y - 0.05, d.pos.z, hw, 0.05);
        if (!isSupported) {
          d.onGround = false;
        }
      }

      d.state = d.onGround ? 'resting' : 'falling';
      d.mesh.position.copy(d.pos);
    }
  }
}

// ---- XP Orbs System ----
const xpOrbGeo = new THREE.SphereGeometry(0.12, 6, 6);
const xpOrbMat = new THREE.MeshBasicMaterial({ color: 0x80ff20 });

export function spawnXpOrbs(x, y, z, count = 3) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(xpOrbGeo, xpOrbMat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, y + 0.2, z + (Math.random() - 0.5) * 0.5);
    if (webgl.scene) webgl.scene.add(mesh);
    game.xpOrbs.push({
      mesh,
      pos: mesh.position.clone(),
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 2),
      spawnTime: performance.now(),
    });
  }
}

export function updateXpOrbs(dt) {
  if (!webgl.scene || game.xpOrbs.length === 0) return;
  const pTarget = player.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
  const now = performance.now();

  for (let i = game.xpOrbs.length - 1; i >= 0; i--) {
    const orb = game.xpOrbs[i];
    orb.mesh.rotation.y += dt * 5.0;

    const dist = orb.pos.distanceTo(pTarget);
    if (dist < 4.5 && now - orb.spawnTime > 150 && !player.dead) {
      orb.pos.lerp(pTarget, dt * 10.0);
      orb.mesh.position.copy(orb.pos);
      if (dist < 1.0) {
        player.xp = (player.xp || 0) + 1;
        if (player.xp >= (player.level + 1) * 10) {
          player.xp = 0;
          player.level = (player.level || 0) + 1;
          toast(`Level Up! Level ${player.level}`);
        }
        webgl.scene.remove(orb.mesh);
        game.xpOrbs.splice(i, 1);
        if (reactBridge.updateUI) reactBridge.updateUI();
        continue;
      }
    } else {
      orb.vel.y += -18 * dt;
      orb.pos.addScaledVector(orb.vel, dt);
      const bx = Math.floor(orb.pos.x), by = Math.floor(orb.pos.y), bz = Math.floor(orb.pos.z);
      if (isSolid(getBlock(bx, by, bz))) {
        orb.pos.y = by + 1.05;
        orb.vel.set(0, 0, 0);
      }
      orb.mesh.position.copy(orb.pos);
    }
  }
}

// ---- Projectile System (Arrows) ----
const arrowGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.65);
arrowGeo.rotateX(Math.PI / 2);
const arrowMat = new THREE.MeshLambertMaterial({ color: 0x9a7b4a });

export function spawnProjectile(x, y, z, dir, speed = 22, isPlayer = true) {
  const mesh = new THREE.Mesh(arrowGeo, arrowMat);
  mesh.position.set(x, y, z);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  if (webgl.scene) webgl.scene.add(mesh);

  game.projectiles.push({
    mesh,
    pos: new THREE.Vector3(x, y, z),
    vel: dir.clone().multiplyScalar(speed),
    isPlayer,
    stuck: false,
    life: 0,
  });
}

export function updateProjectiles(dt) {
  if (!webgl.scene || game.projectiles.length === 0) return;

  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const proj = game.projectiles[i];
    proj.life += dt;
    if (proj.life > 10) {
      webgl.scene.remove(proj.mesh);
      game.projectiles.splice(i, 1);
      continue;
    }

    if (proj.stuck) continue;

    proj.vel.y += -12 * dt; // Gravity
    const step = proj.vel.clone().multiplyScalar(dt);
    const nextPos = proj.pos.clone().add(step);

    // Collision check against blocks
    const bx = Math.floor(nextPos.x), by = Math.floor(nextPos.y), bz = Math.floor(nextPos.z);
    if (isSolid(getBlock(bx, by, bz))) {
      proj.stuck = true;
      proj.pos.copy(nextPos);
      proj.mesh.position.copy(proj.pos);
      continue;
    }

    // Collision check against entities
    if (proj.isPlayer) {
      for (const m of game.mobs) {
        if (m.pos.distanceTo(nextPos) < m.def.w + 0.5) {
          m.hp -= 5;
          m.hurtFlash = 0.2;
          playHitSound();
          if (m.hp <= 0) {
            if (m.def.drop && game.survival) {
              spawnItemDrop(m.def.drop, m.def.dropN || 1, m.pos.x, m.pos.y + 0.5, m.pos.z);
              spawnXpOrbs(m.pos.x, m.pos.y + 0.5, m.pos.z, 4);
              toast(`${m.def.name} shot down!`);
            }
            const idx = game.mobs.indexOf(m);
            if (idx >= 0) removeMob(idx);
          }
          webgl.scene.remove(proj.mesh);
          game.projectiles.splice(i, 1);
          break;
        }
      }
    } else { // Hostile arrow from Skeleton
      if (player.pos.distanceTo(nextPos) < 1.4 && !player.dead) {
        hurtPlayer(3, "skeleton");
        webgl.scene.remove(proj.mesh);
        game.projectiles.splice(i, 1);
        continue;
      }
    }

    proj.pos.copy(nextPos);
    proj.mesh.position.copy(proj.pos);
    proj.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), proj.vel.clone().normalize());
  }
}

// ---- Primed TNT & Remote Detonator System ----
const tntGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);

export function spawnPrimedTnt(x, y, z, blockId = 56) {
  let mesh;
  const radius = blockId === 119 ? 30.0 : (blockId === 118 ? 10.0 : (blockId === 117 ? 4.0 : 2.0));
  const colorHex = blockId === 119 ? 0xffd700 : (blockId === 118 ? 0xa000ff : (blockId === 117 ? 0xff8800 : 0xd83030));

  if (webgl.atlasTex) {
    const geo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const faceMap = [4, 5, 0, 1, 2, 3];
    const uvAttr = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const faceIdx = faceMap[f];
      const tile = tileFor(blockId, faceIdx);
      const uv = tileUV(tile);
      const baseIdx = f * 4;
      uvAttr.setXY(baseIdx + 0, uv.u0, uv.v1);
      uvAttr.setXY(baseIdx + 1, uv.u1, uv.v1);
      uvAttr.setXY(baseIdx + 2, uv.u0, uv.v0);
      uvAttr.setXY(baseIdx + 3, uv.u1, uv.v0);
    }
    uvAttr.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: webgl.atlasTex, transparent: true, alphaTest: 0.1 });
    mesh = new THREE.Mesh(geo, mat);
  } else {
    const tntMat = new THREE.MeshLambertMaterial({ color: colorHex });
    mesh = new THREE.Mesh(tntGeo, tntMat);
  }
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  if (webgl.scene) webgl.scene.add(mesh);

  game.primedTnt.push({
    mesh,
    pos: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
    fuse: 999999, // Standby mode: waits for user to press 1 / R / Red Button
    radius,
    blockId,
    colorHex,
  });
}

export function detonateRemoteTnt() {
  let count = 0;
  // 1. Instantly detonate any primed TNTs in game.primedTnt
  if (game.primedTnt && game.primedTnt.length > 0) {
    for (let i = 0; i < game.primedTnt.length; i++) {
      game.primedTnt[i].fuse = 0;
      count++;
    }
  }

  // 2. Scan nearby terrain for placed TNT blocks (56, 117, 118, 119) and detonate them
  const px = Math.floor(player.pos.x);
  const py = Math.floor(player.pos.y);
  const pz = Math.floor(player.pos.z);
  const R = 64;

  for (let dx = -R; dx <= R; dx++) {
    for (let dy = -32; dy <= 32; dy++) {
      for (let dz = -R; dz <= R; dz++) {
        const bx = px + dx, by = py + dy, bz = pz + dz;
        const bid = getBlock(bx, by, bz);
        if (bid === 56 || bid === 117 || bid === 118 || bid === 119) {
          setBlock(bx, by, bz, 0, false, scheduleSave);
          spawnPrimedTnt(bx, by, bz, bid);
          const last = game.primedTnt[game.primedTnt.length - 1];
          if (last) last.fuse = 0;
          count++;
        }
      }
    }
  }

  if (count > 0) {
    playExplodeSound();
    toast(`💥 TNT REMOTE: ${count} TNT(s) DETONATED!`);
  } else {
    toast("📡 TNT Remote: No TNT active or nearby.");
  }
}

export function updatePrimedTnt(dt) {
  if (!webgl.scene || game.primedTnt.length === 0) return;
  const now = performance.now();

  for (let i = game.primedTnt.length - 1; i >= 0; i--) {
    const tnt = game.primedTnt[i];

    // Standby mode: waits for user remote trigger
    if (tnt.fuse > 9000) {
      const pulse = 1.0 + Math.sin(now * 0.008) * 0.08;
      tnt.mesh.scale.setScalar(pulse);
      const hexColor = tnt.colorHex || 0xd83030;
      if (Math.floor(now / 150) % 2 === 0) {
        tnt.mesh.material.color.setHex(0xffffff);
      } else {
        tnt.mesh.material.color.setHex(hexColor);
      }
      continue;
    }

    tnt.fuse -= dt;

    // Pulsing scale & flashing white effect
    const pulse = 1.0 + Math.sin(tnt.fuse * 14) * 0.08;
    tnt.mesh.scale.setScalar(pulse);
    
    const hexColor = tnt.colorHex || 0xd83030;
    if (Math.floor(now / 100) % 2 === 0) {
      tnt.mesh.material.color.setHex(0xffffff);
    } else {
      tnt.mesh.material.color.setHex(hexColor);
    }

    if (tnt.fuse <= 0) {
      const radius = tnt.radius || 2.0;
      triggerWorldExplosion(tnt.pos.x, tnt.pos.y, tnt.pos.z, radius, scheduleSave);
      playExplodeSound();
      const maxDamageDist = radius + 1.0;
      const pDist = tnt.pos.distanceTo(player.pos);
      if (pDist < maxDamageDist) {
        const tntDmg = Math.max(1, Math.ceil(30 * (1 - pDist / maxDamageDist)));
        hurtPlayer(tntDmg, "tnt");
      }
      for (const m of game.mobs) {
        const mDist = tnt.pos.distanceTo(m.pos);
        if (mDist < maxDamageDist) {
          m.hp -= Math.max(1, Math.ceil(40 * (1 - mDist / maxDamageDist)));
          m.hurtFlash = 0.3;
        }
      }
      webgl.scene.remove(tnt.mesh);
      if (tnt.mesh.material) tnt.mesh.material.dispose();
      game.primedTnt.splice(i, 1);
    }
  }
}

// ---- Procedural Clouds ----
export function createClouds() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82 });
  const geo = new THREE.BoxGeometry(20, 4, 20);

  for (let x = -12; x <= 12; x++) {
    for (let z = -12; z <= 12; z++) {
      if ((Math.sin(x * 12.3 + z * 4.5) + 1) / 2 > 0.35) {
        const cloud = new THREE.Mesh(geo, mat);
        cloud.position.set(x * 28, 72, z * 28);
        group.add(cloud);
      }
    }
  }
  webgl.scene.add(group);
  webgl.cloudMesh = group;
}

// ---- Break progress state ----
export const mining = { held: false, x: 0, y: 0, z: 0, id: 0, progress: 0, active: false };

// ---- Day / night cycle setup ----
const DAY_LENGTH = 600; // seconds for a full cycle (10 min)

const SKY = {
  night:  new THREE.Color(0x0b1026),
  dawn:   new THREE.Color(0xf2a86b),
  day:    new THREE.Color(0x8fc3e8),
  dusk:   new THREE.Color(0xe8825b),
};

const _c = new THREE.Color();
function mixColor(a, b, t){ return _c.copy(a).lerp(b, t); }

function skyState(t){
  let sky, sunI, moonI, ambI;
  if(t<0.22){ sky=SKY.night.clone(); sunI=0; moonI=0.40; ambI=0.22; }
  else if(t<0.30){ const k=(t-0.22)/0.08; sky=mixColor(SKY.night,SKY.dawn,k).clone(); sunI=k*0.9; moonI=0.40*(1-k); ambI=0.22+k*0.48; }
  else if(t<0.36){ const k=(t-0.30)/0.06; sky=mixColor(SKY.dawn,SKY.day,k).clone(); sunI=0.9+k*0.1; moonI=0; ambI=0.70+k*0.05; }
  else if(t<0.64){ sky=SKY.day.clone(); sunI=1.0; moonI=0; ambI=0.75; }
  else if(t<0.72){ const k=(t-0.64)/0.08; sky=mixColor(SKY.day,SKY.dusk,k).clone(); sunI=1.0-k*0.1; moonI=0; ambI=0.75-k*0.05; }
  else if(t<0.80){ const k=(t-0.72)/0.08; sky=mixColor(SKY.dusk,SKY.night,k).clone(); sunI=0.9*(1-k); moonI=0.40*k; ambI=0.70-k*0.48; }
  else { sky=SKY.night.clone(); sunI=0; moonI=0.40; ambI=0.22; }
  return {sky, sunI, moonI, ambI};
}

const dayColor = new THREE.Color(0xfff0d8), nightColor = new THREE.Color(0x9fb6e0);

function updateDayNight(dt){
  if (!game.timeFrozen && !game.paused) {
    const speedMult = game.timeSpeedMultiplier || 1;
    game.timeOfDay = (game.timeOfDay + (dt * speedMult)/DAY_LENGTH) % 1;
  }
  const s = skyState(game.timeOfDay);

  webgl.renderer.setClearColor(s.sky);
  webgl.scene.fog.color.copy(s.sky);

  const ang = (game.timeOfDay-0.25)*Math.PI*2;
  const sx = Math.cos(ang), sy = Math.sin(ang);
  
  webgl.dirLight.position.set(sx*100, sy*120, 60).add(webgl.camera.position);
  webgl.dirLight.intensity = s.sunI;
  webgl.dirLight.color.copy(dayColor);
  
  webgl.moonLight.position.set(-sx*100, -sy*120, -60).add(webgl.camera.position);
  webgl.moonLight.intensity = s.moonI;
  webgl.moonLight.color.copy(nightColor);
  
  webgl.ambientLight.intensity = s.ambI;
  webgl.ambientLight.color.copy(nightColor).lerp(new THREE.Color(0xb8c4d0), s.sunI);

  if (webgl.sunMesh) {
    webgl.sunMesh.position.set(sx*140, sy*140, 60).add(webgl.camera.position);
    webgl.sunMesh.rotation.y = ang;
  }
  if (webgl.moonMesh) {
    webgl.moonMesh.position.set(-sx*140, -sy*140, -60).add(webgl.camera.position);
    webgl.moonMesh.rotation.y = ang;
  }

  // Night Survivor achievement tracking
  if (game.timeOfDay >= 0.75 && game.timeOfDay < 0.76) {
    player.diedTonight = false;
  }
  if (game.timeOfDay >= 0.25 && game.timeOfDay < 0.26) {
    if (player.diedTonight === false) {
      unlockAchievement(10, "Night Survivor", "Survived a full night cycle without dying.");
    }
  }

  updateClock();
}

// ---- Raycast helper ----
function raycastVoxel(maxDist, includeWater = false){
  const o = eyePos(), d = lookDir();
  const dirX = Math.abs(d.x) < 1e-6 ? (d.x < 0 ? -1e-6 : 1e-6) : d.x;
  const dirY = Math.abs(d.y) < 1e-6 ? (d.y < 0 ? -1e-6 : 1e-6) : d.y;
  const dirZ = Math.abs(d.z) < 1e-6 ? (d.z < 0 ? -1e-6 : 1e-6) : d.z;
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const stepX = Math.sign(dirX)||1, stepY = Math.sign(dirY)||1, stepZ = Math.sign(dirZ)||1;
  const tDX = Math.abs(1/dirX), tDY = Math.abs(1/dirY), tDZ = Math.abs(1/dirZ);
  let tMX = ((stepX>0 ? (x+1-o.x) : (o.x-x)))*tDX;
  let tMY = ((stepY>0 ? (y+1-o.y) : (o.y-y)))*tDY;
  let tMZ = ((stepZ>0 ? (z+1-o.z) : (o.z-z)))*tDZ;
  let px = x, py = y, pz = z, t = 0;
  
  const startX = x, startY = y, startZ = z;
  for(let i=0; i<128; i++){
    const b = getBlock(x, y, z);
    const isStartVoxel = (x === startX && y === startY && z === startZ);
    if(b !== 0 && BLOCKS[b] && (!isStartVoxel || (b !== 8 && b !== 9)) && (includeWater || (b !== 8 && b !== 9))){
      return { hit: [x,y,z], prev: [px,py,pz] };
    }
    px = x; py = y; pz = z;
    if(tMX < tMY && tMX < tMZ){ x += stepX; t = tMX; tMX += tDX; }
    else if(tMY < tMZ){ y += stepY; t = tMY; tMY += tDY; }
    else { z += stepZ; t = tMZ; tMZ += tDZ; }
    if(t > maxDist) break;
  }
  return null;
}

// ---- Mining Speed Calculation ----
function miningSpeed(blockId){
  const tool = heldTool();
  const b = BLOCKS[blockId]; if(!b) return 1;
  const name = b.name.toLowerCase();
  
  const isStone = b.ore || /stone|cobble|brick|granite|andesite|diorite|sandstone|obsidian|terracotta|glowstone|furnace|ore/.test(name);
  const isWood  = /wood|plank|log|bookshelf|chest|crafting|fence|gate|trapdoor|ladder/.test(name);
  const isSoft  = /dirt|grass|sand|gravel|snow|clay/.test(name);
  
  let good = false;
  if(tool && tool.tool === "pickaxe" && isStone) good = true;
  if(tool && tool.tool === "axe"     && isWood)  good = true;
  if(tool && tool.tool === "shovel"  && isSoft)  good = true;
  
  let speed = 1;
  if(good && tool) {
    speed = [1, 2, 3.5, 5, 7][tool.tier] || 2;
  }
  if (player.inWater) {
    speed *= 0.65;
  }
  return Math.max(0.5, speed);
}

function updateMining(dt){
  if(!mining.held){
    if(mining.active){ mining.active = false; hideCrack(); }
    mining.progress = 0;
    return;
  }
  if (typeof window !== 'undefined' && window.__worldSettings && window.__worldSettings.lockdown && !(window.__userRole === 'admin' || window.__userRole === 'master')) {
    mining.active = false; mining.progress = 0; hideCrack();
    toast("⚠️ Build Lockdown Active: World edits restricted by Admin.");
    return;
  }
  const r = raycastVoxel(6);
  if(!r){
    mining.active = false; mining.progress = 0; hideCrack();
    return;
  }
  const [x, y, z] = r.hit;
  if (!validateMiningReach(player.pos, { x: x + 0.5, y: y + 0.5, z: z + 0.5 })) {
    mining.active = false; mining.progress = 0; hideCrack();
    return;
  }
  const id = getBlock(x, y, z);
  if(id === 0 || BLOCKS[id]?.name === "Water" || y === 0 || id === 30 || BLOCKS[id]?.unbreakable){
    if (y === 0 || id === 30) toast("Bedrock is unbreakable!");
    mining.active = false; mining.progress = 0; hideCrack();
    return;
  }

  if(!mining.active || x !== mining.x || y !== mining.y || z !== mining.z){
    mining.active = true; mining.x = x; mining.y = y; mining.z = z; mining.id = id; mining.progress = 0;
    mining.soundTimer = 0;
  }
  
  const hardness = BLOCKS[id].hardness !== undefined ? BLOCKS[id].hardness : 1;
  mining.progress += dt * miningSpeed(id);
  
  mining.soundTimer = (mining.soundTimer || 0) + dt;
  if(mining.soundTimer >= 0.22){
    playMineSound(id);
    mining.soundTimer = 0;
  }
  
  const frac = Math.min(1, mining.progress/hardness);
  const stage = Math.min(8 - 1, Math.floor(frac * 8)); // CRACK_STAGES = 8
  showCrack(x, y, z, stage);
  
  if(Math.random() < dt*4) spawnDust(x, y, z, id);

  if(frac >= 1){ completeMine(x, y, z, id); }
}

function completeMine(x, y, z, id){
  emitSoundEvent(x, y, z, 10);
  spawnBreakBurst(x, y, z, id);
  setBlock(x, y, z, 0, false, scheduleSave);
  mining.active = false; mining.progress = 0; hideCrack();

  // ── Immediate underwater fill ─────────────────────────────────────────────
  // If any of the 6 neighbours is water, fill this voxel with water immediately
  // so there is never a single frame where air sits inside a water body
  // (which would show bright-blue water side-faces as an artifact).
  const waterNeighbours = [
    [x+1,y,z],[x-1,y,z],[x,y+1,z],[x,y-1,z],[x,y,z+1],[x,y,z-1]
  ];
  const isUnderwater = waterNeighbours.some(([nx,ny,nz]) => getBlock(nx,ny,nz) === 8);
  if (isUnderwater) {
    setWater(x, y, z, 1); // flowing water fills the void immediately
  }

  disturbWater(x, y, z);
  playPlaceSound(id); // break audio

  // Tool durability check (tracked per hotbar slot index)
  const slotIdx = Math.max(0, Math.min(8, game.selected || 0));
  const heldId = hotbar[slotIdx];
  if (heldId > 0 && ITEMS[heldId] && ITEMS[heldId].tool) {
    const maxDur = [30, 60, 150, 500][ITEMS[heldId].tier - 1] || 30;
    const durKey = `slot_${slotIdx}`;
    if (toolDurability[durKey] === undefined) {
      toolDurability[durKey] = toolDurability[heldId] !== undefined ? toolDurability[heldId] : maxDur;
    }
    toolDurability[durKey]--;
    toolDurability[heldId] = toolDurability[durKey];
    
    if (toolDurability[durKey] <= 0) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "triangle";
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.35);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
        osc.start(now); osc.stop(now + 0.4);
      } catch(e){}
      
      removeItem(heldId, 1);
      delete toolDurability[durKey];
      delete toolDurability[heldId];
      toast("Your tool broke!");
      if (reactBridge.updateUI) reactBridge.updateUI();
    } else {
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
    }
  }

  // Trigger leaf decay if log or leaf block broken
  if (id === 5 || id === 6) {
    checkLeafDecayAround(x, y, z);
  }

  // Crop harvesting logic
  if (id === 90 || id === 91 || id === 92) {
    const key = `${x},${y},${z}`;
    delete crops[key];
    if (id === 92) {
      if (game.survival) {
        spawnItemDrop(136, 1, x + 0.5, y + 0.5, z + 0.5); // Wheat
        spawnItemDrop(138, Math.floor(Math.random() * 3) + 1, x + 0.5, y + 0.5, z + 0.5); // Seeds
      }
      unlockAchievement(8, "Bountiful Harvest", "Harvest fully grown ripe wheat.");
    } else {
      if (game.survival) {
        spawnItemDrop(138, 1, x + 0.5, y + 0.5, z + 0.5); // return seed
      }
    }
    updateAfterEdit(x, y, z);
    return;
  }
  
  if(id === 6){ // Leaves
    const r = Math.random();
    if(r < 0.10) spawnItemDrop(130, 1, x + 0.5, y + 0.5, z + 0.5);
    else if(r < 0.18) spawnItemDrop(131, 1, x + 0.5, y + 0.5, z + 0.5);
    else if(r < 0.30) spawnItemDrop(100, 1, x + 0.5, y + 0.5, z + 0.5);
    else if(r < 0.40) spawnItemDrop(138, 1, x + 0.5, y + 0.5, z + 0.5); // Leaves drop seeds too!
    updateAfterEdit(x, y, z);
    return;
  }

  // Woodcutter achievement (log IDs: 5, 22, 23)
  if (id === 5 || id === 22 || id === 23) {
    player.minedWoodCount = (player.minedWoodCount || 0) + 1;
    if (player.minedWoodCount >= 5) {
      unlockAchievement(2, "Timber!", "Mine at least 5 wood log blocks.");
    }
  }

  // Ore Miner achievement (ore IDs: 11, 12, 13, 14)
  if (id === 11 || id === 12 || id === 13 || id === 14) {
    player.minedOresCount = (player.minedOresCount || 0) + 1;
    if (player.minedOresCount >= 5) {
      unlockAchievement(3, "Subterranean Miner", "Mine at least 5 ore blocks.");
    }
  }

  // Diamond Ore achievement (ID: 14)
  if (id === 14) {
    unlockAchievement(9, "Diamonds!", "Find and mine a rare Diamond Ore.");
  }
  
  // Ore mining XP Orbs drop
  if (id === 11 || id === 12 || id === 13 || id === 14) {
    spawnXpOrbs(x + 0.5, y + 0.5, z + 0.5, Math.floor(Math.random() * 3) + 2);
  }

  if(game.survival) spawnItemDrop(id, 1, x + 0.5, y + 0.5, z + 0.5);
}

function checkLeafDecayAround(x, y, z) {
  const radius = 3;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const lx = x + dx, ly = y + dy, lz = z + dz;
        const leafId = getBlock(lx, ly, lz);
        if (leafId === 6) { // Oak Leaves
          let hasLog = false;
          for (let bx = -3; bx <= 3 && !hasLog; bx++) {
            for (let by = -3; by <= 3 && !hasLog; by++) {
              for (let bz = -3; bz <= 3 && !hasLog; bz++) {
                const checkId = getBlock(lx + bx, ly + by, lz + bz);
                if (checkId === 5) { // Oak Log
                  hasLog = true;
                }
              }
            }
          }
          if (!hasLog) {
            setBlock(lx, ly, lz, 0, false, scheduleSave);
            spawnBreakBurst(lx, ly, lz, 6);
            if (Math.random() < 0.12) {
              spawnItemDrop(Math.random() < 0.5 ? 130 : 138, 1, lx + 0.5, ly + 0.5, lz + 0.5); // Apple or Sapling
            }
          }
        }
      }
    }
  }
}

function tickCrops(dt) {
  game.cropTimer = (game.cropTimer || 0) + dt;
  if (game.cropTimer < 3.0) return;
  game.cropTimer = 0;

  const cropKeys = Object.keys(crops || {});
  if (cropKeys.length === 0) return;
  
  let changed = false;
  cropKeys.forEach(key => {
    const [cx, cy, cz] = key.split(',').map(Number);
    const id = getBlock(cx, cy, cz);
    
    // Safety check: if the block is no longer a crop, remove it from map
    if (id !== 90 && id !== 91 && id !== 92) {
      delete crops[key];
      return;
    }
    
    // Farmland hydration check: check if the block directly below is Farmland (89)
    const belowId = getBlock(cx, cy - 1, cz);
    if (belowId !== 89) {
      delete crops[key];
      setBlock(cx, cy, cz, 0, false, scheduleSave);
      updateAfterEdit(cx, cy, cz);
      changed = true;
      return;
    }
    
    // Calculate hydration status (is water block within 4 blocks?)
    let hydrated = false;
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -4; dz <= 4; dz++) {
          if (getBlock(cx + dx, cy - 1 + dy, cz + dz) === 8) { // Water
            hydrated = true;
            break;
          }
        }
        if (hydrated) break;
      }
      if (hydrated) break;
    }
    
    // Grow timer speed multiplier: 2x if hydrated
    const speed = hydrated ? 2.0 : 1.0;
    const crop = crops[key];
    crop.timer = (crop.timer || 0) + speed;
    
    // Seeded (90) -> Growing (91) -> Ripe (92)
    // Stage 1 -> 2: needs 15 growth points
    // Stage 2 -> 3: needs 30 growth points
    if (id === 90 && crop.timer >= 15) {
      setBlock(cx, cy, cz, 91, false, scheduleSave);
      updateAfterEdit(cx, cy, cz);
      crop.timer = 0;
      changed = true;
    } else if (id === 91 && crop.timer >= 30) {
      setBlock(cx, cy, cz, 92, false, scheduleSave);
      updateAfterEdit(cx, cy, cz);
      crop.timer = 0;
      changed = true;
    }
  });
  
  if (changed) {
    if (reactBridge.updateUI) reactBridge.updateUI();
  }
}

function spawnDust(x, y, z, id){
  const base = blockColor(id);
  let n = 0;
  for(const p of game.particles){
    if(p.mesh.visible) continue;
    const j = 0.75 + Math.random()*0.5;
    p.mesh.material.color.setRGB(((base>>16&255)*j/255), ((base>>8&255)*j/255), ((base&255)*j/255));
    p.mesh.material.opacity = 1;
    p.mesh.scale.setScalar(0.4 + Math.random()*0.4);
    p.mesh.position.set(x+0.2+Math.random()*0.6, y+0.2+Math.random()*0.6, z+0.2+Math.random()*0.6);
    p.vel.set((Math.random()-0.5)*2, 1+Math.random()*2, (Math.random()-0.5)*2);
    p.spin.set(Math.random()*6-3, Math.random()*6-3, Math.random()*6-3);
    p.life = 0; p.max = 0.3 + Math.random()*0.3; p.mesh.visible = true;
    if(++n >= 2) break;
  }
}

function blockColor(id){
  const b = BLOCKS[id]; if(!b) return 0x888888;
  return b.all !== undefined ? b.all : (b.top !== undefined ? b.top : b.side);
}

export function tryTradeWithVillager() {
  const o = eyePos(), d = lookDir();
  let best = null, bestT = 4.0;
  if (Array.isArray(game.mobs)) {
    for (const m of game.mobs) {
      if (!m || m.dead || m.type !== 'villager') continue;
      const cx = m.pos.x, cy = m.pos.y + (m.def?.h || 1.8) / 2, cz = m.pos.z;
      const toM = new THREE.Vector3(cx - o.x, cy - o.y, cz - o.z);
      const t = toM.dot(d);
      if (t < 0 || t > bestT) continue;
      const closest = new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
      const distHoriz = Math.hypot(closest.x - cx, closest.z - cz);
      const distVert = Math.abs(closest.y - cy);
      if (distHoriz < 0.8 && distVert < 1.0) {
        best = m;
        bestT = t;
      }
    }
  }
  if (!best) return false;

  if (document.pointerLockElement) document.exitPointerLock();
  const trades = getTradesByProfession(best.profession || 'farmer');
  if (trades && trades.length > 0) {
    openTradePrompt(trades[0]);
  }
  return true;
}

export function placeBlock(){
  if (tryTradeWithVillager()) return;
  if (tryFeedAnimal()) return;
  if (typeof window !== 'undefined' && window.__worldSettings && window.__worldSettings.lockdown && !(window.__userRole === 'admin' || window.__userRole === 'master')) {
    toast("⚠️ Build Lockdown Active: World edits restricted by Admin.");
    return;
  }
  emitSoundEvent(player.pos.x, player.pos.y, player.pos.z, 8);
  const heldId = hotbar[game.selected];
  const isBucket = (heldId === 144 || heldId === 145);
  const isLilyPad = (heldId === 139);
  // ONLY Buckets and LilyPads target water surfaces directly.
  // ALL OTHER BLOCKS raycast THROUGH liquids to target the solid underwater floor/wall your crosshair points at!
  const includeWater = isBucket || isLilyPad;
  const r = raycastVoxel(6, includeWater);
  if(!r) {
    toast("No target in range (max 6 blocks)");
    return;
  }
  
  // Intercept right click container interaction
  const hitBlockId = getBlock(r.hit[0], r.hit[1], r.hit[2]);
  if(hitBlockId === 95){ // Market Showcase Stand
    if(document.pointerLockElement) document.exitPointerLock();
    openTradePrompt(TRADE_CATALOGUE[0]);
    return;
  }
  if(hitBlockId === 43){ // Chest
    if(document.pointerLockElement) document.exitPointerLock();
    openChest(r.hit[0], r.hit[1], r.hit[2]);
    return;
  }
  if(hitBlockId === 42){ // Furnace
    if(document.pointerLockElement) document.exitPointerLock();
    openFurnace(r.hit[0], r.hit[1], r.hit[2]);
    return;
  }
  if(hitBlockId === 66){ // Lever toggle
    toggleLever(r.hit[0], r.hit[1], r.hit[2]);
    playPlaceSound(15);
    toast("Lever Toggled!");
    return;
  }
  if(hitBlockId === 67){ // Stone Button press
    pressButton(r.hit[0], r.hit[1], r.hit[2]);
    playPlaceSound(3);
    toast("Button Pressed!");
    return;
  }
  if(hitBlockId === 70){ // Redstone Repeater delay cycle
    cycleRepeaterDelay(r.hit[0], r.hit[1], r.hit[2]);
    playPlaceSound(3);
    toast("Repeater Delay Adjusted!");
    return;
  }
  if(hitBlockId === 71){ // Redstone Comparator mode toggle
    toggleComparatorMode(r.hit[0], r.hit[1], r.hit[2]);
    playPlaceSound(3);
    toast("Comparator Mode Toggled!");
    return;
  }
  if(hitBlockId === 56 || hitBlockId === 117 || hitBlockId === 118 || hitBlockId === 119){ // TNT Block right-click ignite
    spawnPrimedTnt(r.hit[0], r.hit[1], r.hit[2], hitBlockId);
    setBlock(r.hit[0], r.hit[1], r.hit[2], 0, false, scheduleSave);
    updateAfterEdit(r.hit[0], r.hit[1], r.hit[2]);
    playHissSound();
    const name = thingName(hitBlockId) || "TNT";
    toast(`${name} Primed! Use Remote (Key 1 / Red Button) to Detonate!`);
    return;
  }
  if(hitBlockId === 57){ // Bed right-click sleep
    const isNightTime = game.timeOfDay < 0.22 || game.timeOfDay > 0.78;
    if (isNightTime) {
      game.timeOfDay = 0.30; // Dawn
      player.health = Math.min(20, player.health + 6);
      player.hunger = Math.min(20, player.hunger + 6);
      player.spawnPoint = new THREE.Vector3(r.hit[0] + 0.5, r.hit[1] + 1.1, r.hit[2] + 0.5);
      toast("Passed the night — Respawn point set!");
      updateStatsHUD();
    } else {
      toast("You can only sleep at night");
    }
    return;
  }

  // Ranged Bow Firing
  if (heldId === 146) {
    if (invCount(147) > 0 || !game.survival) {
      if (game.survival) removeItem(147, 1);
      const eyeP = eyePos();
      const lookD = lookDir();
      spawnProjectile(eyeP.x, eyeP.y, eyeP.z, lookD, 24, true);
      toast("Arrow Fired!");
      if (reactBridge.updateUI) reactBridge.updateUI();
    } else {
      toast("Out of Arrows!");
    }
    return;
  }
  
  // 1. Hoe Interaction (Tilling dirt/grass to farmland)
  if (heldId > 0 && ITEMS[heldId] && ITEMS[heldId].tool === "hoe") {
    if (hitBlockId === 1 || hitBlockId === 2) {
      const [hx, hy, hz] = r.hit;
      setBlock(hx, hy, hz, 89, false, scheduleSave);
      playPlaceSound(2); // dirt sound
      updateAfterEdit(hx, hy, hz);
      
      const maxDur = [30, 60, 150][ITEMS[heldId].tier - 1] || 30;
      if (toolDurability[heldId] === undefined) toolDurability[heldId] = maxDur;
      toolDurability[heldId]--;
      
      if (toolDurability[heldId] <= 0) {
        removeItem(heldId, 1);
        delete toolDurability[heldId];
        toast("Your Hoe broke!");
      } else {
        scheduleSave();
      }
      
      unlockAchievement(6, "Humble Farmer", "Till grass or dirt into farmland using a Hoe.");
      if (reactBridge.updateUI) reactBridge.updateUI();
      return;
    }
  }

  // 2. Seeds Interaction (Planting wheat seeds on farmland)
  if (heldId === 138) {
    if (hitBlockId === 89) {
      const [hx, hy, hz] = r.hit;
      const plantY = hy + 1;
      if (getBlock(hx, plantY, hz) === 0) {
        setBlock(hx, plantY, hz, 90, false, scheduleSave);
        playPlaceSound(1); // grass-like sound
        updateAfterEdit(hx, plantY, hz);
        
        const key = `${hx},${plantY},${hz}`;
        crops[key] = { stage: 1, timer: 0 };
        
        if (game.survival) {
          removeItem(138, 1);
        }
        
        unlockAchievement(7, "Green Thumb", "Sow wheat seeds on farmland.");
        scheduleSave();
        if (reactBridge.updateUI) reactBridge.updateUI();
        return;
      }
    }
  }

  // ─── Bucket special case: intercept before isPlaceable check ───
  if (heldId === 144 || heldId === 145) {
    if (heldId === 145) {
      // Water Bucket: place water source at prev (air) cell
      const [bx, by, bz] = r.prev;
      const cur = getBlock(bx, by, bz);
      if (cur === 0 || cur === 9) {
        setBlock(bx, by, bz, 8, false, scheduleSave);
        setWater(bx, by, bz, 0); // source water
        if (game.survival) {
          removeItem(145, 1);     // consume water bucket
          addItem(144, 1);        // return empty bucket
        }
        playPlaceSound(8);
        updateAfterEdit(bx, by, bz);
        disturbWater(bx, by, bz);
        if (reactBridge.updateUI) reactBridge.updateUI();
      } else {
        toast("Can\'t place water here");
      }
    } else {
      // Empty Bucket: pick up water source at hit cell
      const [hx, hy, hz] = r.hit;
      const hitId = getBlock(hx, hy, hz);
      if (hitId === 8) {
        setBlock(hx, hy, hz, 0, false, scheduleSave);
        if (game.survival) {
          removeItem(144, 1);     // consume empty bucket
          addItem(145, 1);        // get water bucket
        }
        playPlaceSound(8);
        updateAfterEdit(hx, hy, hz);
        disturbWater(hx, hy, hz);
        if (reactBridge.updateUI) reactBridge.updateUI();
      } else {
        toast("No water source here");
      }
    }
    return;
  }

  // Target placement coordinates:
  // If r.hit is water (from Shift-clicking or Buckets), place at r.hit.
  // Otherwise, place at r.prev (the cell adjacent to the solid underwater floor/wall that you aimed at).
  const hitId = getBlock(r.hit[0], r.hit[1], r.hit[2]);
  let x, y, z;
  if ((hitId === 8 || hitId === 9) && includeWater) {
    x = r.hit[0];
    y = r.hit[1];
    z = r.hit[2];
  } else {
    x = r.prev[0];
    y = r.prev[1];
    z = r.prev[2];
  }
  const id = heldId;
  
  if(!isPlaceable(heldId)){ toast(`${thingName(heldId)} can't be placed`); return; }
  if(game.survival && invCount(heldId) <= 0){ toast(`out of ${thingName(heldId)}`); return; }
  
  // Allow placing into air (0) or replacing water (8 or 9)
  const currentVoxel = getBlock(x, y, z);
  if(currentVoxel !== 0 && currentVoxel !== 8 && currentVoxel !== 9) return;
  
  // Collide check
  const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
  const hw = 0.6/2;
  const intersects = (x+1 > px-hw && x < px+hw && y+1 > py && y < py+1.8 && z+1 > pz-hw && z < pz+hw);
  if(intersects){ toast("too close — step back"); return; }
  
  if(id === 8){ // Water block id
    setBlock(x, y, z, 8, false, scheduleSave);
    setWater(x, y, z, undefined); // source
    playPlaceSound(id);
    updateAfterEdit(x, y, z);
    disturbWater(x, y, z);
    return;
  }
  
  setBlock(x, y, z, id, false, scheduleSave);
  if(game.survival){ removeItem(id, 1); }
  playPlaceSound(id);
  updateAfterEdit(x, y, z);
  disturbWater(x, y, z);
  toast(`Placed ${thingName(id)}!`);

  // Architect placement achievement (Chest block ID: 43)
  if (id === 43) {
    unlockAchievement(5, "Safe Storage", "Place a Chest to store your belongings.");
  }
}

function updateAfterEdit(x, y, z){
  const cx = Math.floor(x/16), cz = Math.floor(z/16);
  relightAround(cx, cz);
  const ch = getChunk(cx, cz); if(ch) updateChunkMesh(ch);
  [[cx-1,cz],[cx+1,cz],[cx,cz-1],[cx,cz+1]].forEach(([nx,nz])=>{
    const nc = getChunk(nx,nz); if(nc && nc.generated) updateChunkMesh(nc);
  });
}

// ---- Main Render Animation Loop -------------------------------------------
function loop(now){
  requestAnimationFrame(loop);
  let dt = (now - game.lastTime)/1000; 
  game.lastTime = now;
  if(dt > 0.1) dt = 0.1;

  if(game.running && !game.paused){
    updatePlayer(dt);
    updateMining(dt);
    updateSurvival(dt);
    updateMobs(dt);
    tickFurnaces(dt);
    tickCrops(dt);
    tickRedstone(dt);
    updateItemDrops(dt);
    updateXpOrbs(dt);
    updateProjectiles(dt);
    updatePrimedTnt(dt);
  }
  
  // Environment simulation (sky, day/night, chunks, particles, water) runs whenever game is running
  if (game.running) {
    updateChunkLoading();
    processGenBudget();
    updateParticles(dt);
    updateDayNight(dt);
    game.waterTimer += dt;
    if(game.waterTimer >= WATER_TICK){ game.waterTimer = 0; tickWater(); }
  }

  // Update Water Shader Uniforms
  if (webgl.waterMat && webgl.waterMat.uniforms) {
    webgl.waterMat.uniforms.uTime.value = now * 0.001;
    if (webgl.camera) webgl.waterMat.uniforms.uCameraPos.value.copy(webgl.camera.position);
    if (webgl.dirLight) {
      webgl.waterMat.uniforms.uSunDir.value.copy(webgl.dirLight.position).normalize();
      if (webgl.dirLight.color) webgl.waterMat.uniforms.uSunColor.value.copy(webgl.dirLight.color);
    }
    if (webgl.scene && webgl.scene.fog) webgl.waterMat.uniforms.uSkyColor.value.copy(webgl.scene.fog.color);
    if (typeof game.timeOfDay === 'number') webgl.waterMat.uniforms.uTimeOfDay.value = game.timeOfDay;
    // Debug face-type coloring: toggle via window.__waterDebug = true in console
    // Green=top(exposed), Cyan=side(waterfall/wall), Orange=bottom
    // Any internal planes will appear as cyan inside a body of water
    webgl.waterMat.uniforms.uDebugFaces.value = Boolean(window.__waterDebug);
  }

  // Dynamic Sprinting FOV Stretch interpolation (only update projection matrix when FOV changes)
  if (webgl.camera) {
    const targetFov = (!game.paused && player.sprinting) ? 84 : 72;
    if (Math.abs(targetFov - webgl.camera.fov) > 0.01) {
      webgl.camera.fov += (targetFov - webgl.camera.fov) * Math.min(1, dt * 8.0);
      webgl.camera.updateProjectionMatrix();
    }
  }

  // Drifting clouds animation
  if (webgl.cloudMesh) {
    webgl.cloudMesh.position.x += dt * 1.5;
    if (webgl.cloudMesh.position.x > 336) webgl.cloudMesh.position.x = -336;
  }

  // Ambient torch/furnace particles (skip while paused)
  if (Math.random() < 0.20 && game.running && !game.paused) {
    const px = Math.floor(player.pos.x) + (Math.floor(Math.random() * 16) - 8);
    const py = Math.floor(player.pos.y) + (Math.floor(Math.random() * 10) - 5);
    const pz = Math.floor(player.pos.z) + (Math.floor(Math.random() * 16) - 8);
    const b = getBlock(px, py, pz);
    if (b === 20 || b === 42 || b === 21) {
      spawnDust(px, py + 0.4, pz, b);
    }
  }

  // Underwater screen overlay & fog adjustment (cached DOM query & conditional mutation)
  const headY = Math.floor(player.pos.y + player.eye);
  const headBlock = getBlock(Math.floor(player.pos.x), headY, Math.floor(player.pos.z));
  const isUnderwater = (headBlock === 8);

  if (!webgl.underwaterOverlayEl && typeof document !== "undefined") {
    let uEl = document.getElementById("underwaterOverlay");
    if (!uEl) {
      uEl = document.createElement("div");
      uEl.id = "underwaterOverlay";
      uEl.style.cssText = "position:fixed;inset:0;z-index:7;pointer-events:none;background:rgba(20,80,180,0.36);display:none;opacity:0;transition:opacity 0.2s;";
      document.body.appendChild(uEl);
    }
    webgl.underwaterOverlayEl = uEl;
  }
  if (webgl.underwaterOverlayEl && webgl.lastUnderwaterState !== isUnderwater) {
    webgl.lastUnderwaterState = isUnderwater;
    webgl.underwaterOverlayEl.style.display = isUnderwater ? "block" : "none";
    webgl.underwaterOverlayEl.style.opacity = isUnderwater ? "1" : "0";
  }
  if (isUnderwater) {
    webgl.scene.fog.color.setHex(0x103060);
    webgl.scene.fog.near = 1;
    webgl.scene.fog.far = 14;
  } else {
    const s = skyState(game.timeOfDay);
    webgl.scene.fog.color.copy(s.sky);
    webgl.scene.fog.near = RENDER_DIST*16*0.55;
    webgl.scene.fog.far = RENDER_DIST*16*0.95;
  }

  // Camera tracking with F5 modes, View Bobbing, and block collision safety
  const dir = lookDir();
  
  if (player.cameraMode === 0) {
    // First-Person with View Bobbing
    const speed2D = Math.hypot(player.vel.x, player.vel.z);
    const bobFreq = player.sprinting ? 14 : 9;
    const bobAmp = player.sprinting ? 0.06 : 0.03;
    const bobY = (player.onGround && speed2D > 0.5 && !player.flying)
      ? Math.sin(performance.now() * 0.001 * bobFreq) * bobAmp
      : 0;

    webgl.camera.position.set(player.pos.x, player.pos.y + 1.6 + bobY, player.pos.z);
    webgl.camera.lookAt(webgl.camera.position.x + dir.x, webgl.camera.position.y + dir.y, webgl.camera.position.z + dir.z);
    if (webgl.playerMesh) webgl.playerMesh.visible = false;
    if (webgl.heldGroup) webgl.heldGroup.visible = true;
  } else {
    // Third-Person (1 = Back, 2 = Front)
    if (webgl.playerMesh) webgl.playerMesh.visible = true;
    if (webgl.heldGroup) webgl.heldGroup.visible = false;
    
    const sign = (player.cameraMode === 1) ? -1 : 1;
    
    // Raycast camera collision test to prevent clipping
    let maxDist = 3.5;
    let finalDist = maxDist;
    const step = 0.25;
    for (let t = step; t <= maxDist; t += step) {
      const tx = player.pos.x + dir.x * t * sign;
      const ty = player.pos.y + 1.5 + dir.y * t * sign * 0.3;
      const tz = player.pos.z + dir.z * t * sign;
      if (isSolid(getBlock(Math.floor(tx), Math.floor(ty), Math.floor(tz)))) {
        finalDist = Math.max(0.5, t - 0.2);
        break;
      }
    }
    
    const camX = player.pos.x + dir.x * finalDist * sign;
    const camY = player.pos.y + 1.5 + dir.y * finalDist * sign * 0.3 + 0.3;
    const camZ = player.pos.z + dir.z * finalDist * sign;
    
    webgl.camera.position.set(camX, camY, camZ);
    webgl.camera.lookAt(player.pos.x, player.pos.y + 1.3, player.pos.z);
  }

  // First person swinging animation ticking
  if(player.swingProgress > 0){
    player.swingProgress += dt * 5.0;
    if(player.swingProgress >= 1.0){
      player.swingProgress = 0;
    }
  }
  
  if(webgl.heldGroup){
    if(player.swingProgress > 0){
      const phase = player.swingProgress;
      const rotX = Math.sin(phase * Math.PI) * -0.7;
      const rotY = Math.sin(phase * Math.PI) * 0.4;
      webgl.heldGroup.rotation.set(rotX, rotY, rotX * 0.5);
      webgl.heldGroup.position.set(0.24 - Math.sin(phase * Math.PI)*0.08, -0.2 - Math.sin(phase * Math.PI)*0.06, -0.35);
    } else {
      webgl.heldGroup.rotation.set(0, 0, 0);
      webgl.heldGroup.position.set(0.24, -0.2, -0.35);
    }
  }

  // Update in-game player 3D avatar position, rotations, and limb swings
  if (webgl.playerMesh && webgl.playerMesh.visible) {
    webgl.playerMesh.position.copy(player.pos);
    webgl.playerMesh.rotation.y = player.yaw;
    
    if (webgl.playerMesh.head) {
      webgl.playerMesh.head.rotation.x = -player.pitch;
    }
    
    const speed2D = Math.hypot(player.vel.x, player.vel.z);
    const moving = speed2D > 0.1 && !player.flying;
    if (moving) {
      const freq = speed2D > 6.0 ? 0.016 : 0.012;
      const amp = speed2D > 6.0 ? 0.8 : 0.55;
      const swing = Math.sin(performance.now() * freq) * amp;
      
      if (webgl.playerMesh.leftLeg) webgl.playerMesh.leftLeg.rotation.x = swing;
      if (webgl.playerMesh.rightLeg) webgl.playerMesh.rightLeg.rotation.x = -swing;
      if (webgl.playerMesh.leftArm) webgl.playerMesh.leftArm.rotation.x = -swing;
      if (player.swingProgress === 0 && webgl.playerMesh.rightArm) {
        webgl.playerMesh.rightArm.rotation.x = swing;
      }
    } else {
      if (webgl.playerMesh.leftLeg) webgl.playerMesh.leftLeg.rotation.x = 0;
      if (webgl.playerMesh.rightLeg) webgl.playerMesh.rightLeg.rotation.x = 0;
      if (webgl.playerMesh.leftArm) webgl.playerMesh.leftArm.rotation.x = 0;
      if (player.swingProgress === 0 && webgl.playerMesh.rightArm) {
        webgl.playerMesh.rightArm.rotation.x = 0;
      }
    }
    
    if (player.swingProgress > 0 && webgl.playerMesh.rightArm) {
      const phase = player.swingProgress;
      const swingAngle = Math.sin(phase * Math.PI) * -1.3;
      webgl.playerMesh.rightArm.rotation.x = swingAngle;
      webgl.playerMesh.rightArm.rotation.z = Math.sin(phase * Math.PI) * -0.3;
    } else if (webgl.playerMesh.rightArm) {
      webgl.playerMesh.rightArm.rotation.z = 0;
    }
  }

  // ── Multiplayer Real-Time Presence & 3D Avatar Rendering ──
  if (game.running && game.mode !== 'singleplayer' && game.activeRoomId) {
    if (!webgl.presenceTimer) webgl.presenceTimer = 0;
    webgl.presenceTimer += dt;
    if (webgl.presenceTimer >= 0.10) { // Publish every 100ms
      webgl.presenceTimer = 0;
      updatePlayerPresenceInRoom(game.activeRoomId, {
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        yaw: player.yaw,
        pitch: player.pitch,
        avatar: player.avatar || {},
        heldItem: game.selected
      });
    }
    updateOtherPlayers3D(dt);
  }

  // ── Pathfinder Real-Time Trail Recalculation ──
  tickPathTrail(dt);

  if (game.running && !game.paused) {
    let targetInfo = null;

    // 1. Check if looking at or close to a mob
    let closestMob = null;
    let closestMobDistSq = 3.5 * 3.5;
    if (Array.isArray(game.mobs)) {
      for (const m of game.mobs) {
        if (m.dead) continue;
        const dSq = m.pos.distanceToSquared(player.pos);
        if (dSq < closestMobDistSq) {
          closestMobDistSq = dSq;
          closestMob = m;
        }
      }
    }

    // 2. Check if close to a dropped item entity
    let closestDrop = null;
    let closestDropDistSq = 2.8 * 2.8;
    for (const d of itemDrops) {
      const dSq = d.pos.distanceToSquared(player.pos);
      if (dSq < closestDropDistSq) {
        closestDropDistSq = dSq;
        closestDrop = d;
      }
    }

    // 3. Voxel block raycast
    const r = raycastVoxel(6);
    if (r) { 
      webgl.highlight.visible = true; 
      webgl.highlight.position.set(r.hit[0]+0.5, r.hit[1]+0.5, r.hit[2]+0.5); 
      const bid = getBlock(r.hit[0], r.hit[1], r.hit[2]);
      window.__targetBlockId = bid;
      if (bid > 0) {
        targetInfo = {
          type: 'block',
          name: thingName(bid),
          action: '⛏️ Left Click to Mine • 📦 Right Click to Place'
        };
      }
    } else {
      webgl.highlight.visible = false;
      window.__targetBlockId = 0;
    }

    if (closestMob && closestMobDistSq < (3.2 * 3.2)) {
      targetInfo = {
        type: 'mob',
        name: `${closestMob.def?.name || 'Mob'} (${closestMob.hp}/${closestMob.def?.maxHp || 10} HP)`,
        action: '⚔️ Left Click to Attack'
      };
    } else if (closestDrop && closestDropDistSq < (2.8 * 2.8) && !targetInfo) {
      targetInfo = {
        type: 'item',
        name: `${thingName(closestDrop.id)} ×${closestDrop.count}`,
        action: '🧲 Walk near to magnet-collect'
      };
    }

    window.__hudTargetInfo = targetInfo;

    // 4. Project saved Waypoints (Base 🏡, Farm 🌾, Online Teammates 👤) to 2D Screen Space (Reusing static Vector3)
    if (webgl.camera && typeof window !== 'undefined') {
      if (!webgl.tempWpVec) webgl.tempWpVec = new THREE.Vector3();
      const waypoints = typeof window.__getWaypoints === 'function' ? window.__getWaypoints() : [];
      const projectedWaypoints = [];

      const waypointsList = waypoints;
      if (Array.isArray(game.otherPlayersList) && game.otherPlayersList.length > 0) {
        for (const op of game.otherPlayersList) {
          if (!op || !op.pos || typeof op.pos.x !== 'number') continue;
          const shortEmail = op.email ? op.email.split('@')[0] : 'Player';
          waypointsList.push({
            id: `player_${op.uid}`,
            name: shortEmail,
            icon: '👤',
            x: op.pos.x,
            y: op.pos.y,
            z: op.pos.z
          });
        }
      }

      for (let w = 0; w < waypointsList.length; w++) {
        const wp = waypointsList[w];
        if (!wp || typeof wp.x !== 'number') continue;
        webgl.tempWpVec.set(wp.x + 0.5, wp.y + 1.2, wp.z + 0.5);
        const dist = Math.round(webgl.tempWpVec.distanceTo(player.pos));
        
        // Project 3D pos to normalized device coordinates
        webgl.tempWpVec.project(webgl.camera);
        // Check if in front of camera
        if (webgl.tempWpVec.z < 1.0) {
          const screenX = (webgl.tempWpVec.x * 0.5 + 0.5) * window.innerWidth;
          const screenY = (-(webgl.tempWpVec.y * 0.5) + 0.5) * window.innerHeight;
          // Check within screen bounds
          if (screenX >= 25 && screenX <= window.innerWidth - 25 && screenY >= 25 && screenY <= window.innerHeight - 25) {
            projectedWaypoints.push({
              id: wp.id || wp.name,
              name: wp.name,
              icon: wp.icon || '📍',
              dist,
              x: Math.round(screenX),
              y: Math.round(screenY)
            });
          }
        }
      }
      window.__projectedWaypoints = projectedWaypoints;
    }
  }

  // ── Physics Debug Overlay System (High-Performance Reused Object Pool) ──
  if (typeof window !== 'undefined' && window.__physicsDebug) {
    if (!webgl.debugGroup) {
      webgl.debugGroup = new THREE.Group();
      webgl.scene.add(webgl.debugGroup);
      
      // Shared Geometries & Materials
      webgl.debugBoxGeo = new THREE.BoxGeometry(1, 1, 1);
      webgl.debugPlaneGeo = new THREE.PlaneGeometry(1, 1);
      webgl.debugSphereGeo = new THREE.SphereGeometry(0.04, 8, 8);

      webgl.debugMatPlayer = new THREE.MeshBasicMaterial({ color: 0xff3333, wireframe: true });
      webgl.debugMatTerrain = new THREE.MeshBasicMaterial({ color: 0x33ff33, wireframe: true });
      webgl.debugMatWater = new THREE.MeshBasicMaterial({ color: 0x3388ff, wireframe: true });
      webgl.debugMatSupport = new THREE.MeshBasicMaterial({ color: 0xffea00, side: THREE.DoubleSide });
      webgl.debugMatContact = new THREE.MeshBasicMaterial({ color: 0xff6600 });

      // Player Box Mesh
      webgl.debugPlayerBox = new THREE.Mesh(webgl.debugBoxGeo, webgl.debugMatPlayer);
      webgl.debugPlayerBox.scale.set(0.6, 1.8, 0.6);
      webgl.debugGroup.add(webgl.debugPlayerBox);

      // Single Support Plane Mesh
      webgl.debugSupportMesh = new THREE.Mesh(webgl.debugPlaneGeo, webgl.debugMatSupport);
      webgl.debugSupportMesh.rotation.x = Math.PI / 2;
      webgl.debugGroup.add(webgl.debugSupportMesh);

      // Object Pools
      webgl.debugTerrainPool = [];
      webgl.debugWaterPool = [];
      webgl.debugContactPool = [];
    }
    webgl.debugGroup.visible = true;

    // Position Player Box
    webgl.debugPlayerBox.position.set(player.pos.x, player.pos.y + 0.9, player.pos.z);

    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;

    // Reset active pool counters
    let tIdx = 0, wIdx = 0, cIdx = 0;

    // 1. Terrain (Green) & Water (Blue) Wireframes
    const searchRad = 2;
    for (let dx = -searchRad; dx <= searchRad; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -searchRad; dz <= searchRad; dz++) {
          const vx = Math.floor(px) + dx;
          const vy = Math.floor(py) + dy;
          const vz = Math.floor(pz) + dz;
          const bid = getBlock(vx, vy, vz);

          if (bid === 8) {
            let m = webgl.debugWaterPool[wIdx];
            if (!m) {
              m = new THREE.Mesh(webgl.debugBoxGeo, webgl.debugMatWater);
              webgl.debugWaterPool.push(m);
              webgl.debugGroup.add(m);
            }
            m.visible = true;
            m.scale.set(1.001, 1.001, 1.001);
            m.position.set(vx + 0.5, vy + 0.5, vz + 0.5);
            wIdx++;
          } else if (bid > 0 && isSolid(bid)) {
            const aabbs = getBlockAABBs(vx, vy, vz);
            for (const b of aabbs) {
              let m = webgl.debugTerrainPool[tIdx];
              if (!m) {
                m = new THREE.Mesh(webgl.debugBoxGeo, webgl.debugMatTerrain);
                webgl.debugTerrainPool.push(m);
                webgl.debugGroup.add(m);
              }
              m.visible = true;
              const bw = b.maxX - b.minX;
              const bh = b.maxY - b.minY;
              const bd = b.maxZ - b.minZ;
              m.scale.set(bw, bh, bd);
              m.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
              tIdx++;
            }
          }
        }
      }
    }

    // Hide unused pool meshes
    for (let i = tIdx; i < webgl.debugTerrainPool.length; i++) webgl.debugTerrainPool[i].visible = false;
    for (let i = wIdx; i < webgl.debugWaterPool.length; i++) webgl.debugWaterPool[i].visible = false;

    // 2. Supporting Surface (Yellow Quad)
    const support = getSupportingSurface(px, py, pz);
    if (support) {
      webgl.debugSupportMesh.visible = true;
      const sBox = support.aabb;
      const bw = sBox.maxX - sBox.minX;
      const bd = sBox.maxZ - sBox.minZ;
      webgl.debugSupportMesh.scale.set(bw, bd, 1);
      webgl.debugSupportMesh.position.set((sBox.minX + sBox.maxX) / 2, sBox.maxY + 0.005, (sBox.minZ + sBox.maxZ) / 2);
    } else {
      webgl.debugSupportMesh.visible = false;
    }

    // 3. Contact Points (Orange Spheres)
    const colliders = getIntersectingColliders(px, py, pz);
    for (const col of colliders) {
      for (const b of col.aabbs) {
        let m = webgl.debugContactPool[cIdx];
        if (!m) {
          m = new THREE.Mesh(webgl.debugSphereGeo, webgl.debugMatContact);
          webgl.debugContactPool.push(m);
          webgl.debugGroup.add(m);
        }
        m.visible = true;
        const cx = Math.max(b.minX, Math.min(b.maxX, px));
        const cy = Math.max(b.minY, Math.min(b.maxY, py));
        const cz = Math.max(b.minZ, Math.min(b.maxZ, pz));
        m.position.set(cx, cy, cz);
        cIdx++;
      }
    }
    for (let i = cIdx; i < webgl.debugContactPool.length; i++) webgl.debugContactPool[i].visible = false;

    // Telemetry data
    const feetB = getBlock(Math.floor(px), Math.floor(py), Math.floor(pz));
    const headB = getBlock(Math.floor(px), Math.floor(py + player.eye), Math.floor(pz));
    const inWater = (feetB === 8 || headB === 8);
    const cameraSync = (Math.abs(webgl.camera.position.x - player.pos.x) < 0.05 && Math.abs(webgl.camera.position.z - player.pos.z) < 0.05) ? "SYNC OK" : "DRIFT WARNING";

    // Count dirty chunks for sync debug
    let dirtyChunkCount = 0;
    const dirtyCxCz = [];
    for (const ch of world.chunks.values()) {
      if (ch.generated && ch.dirty) {
        dirtyChunkCount++;
        dirtyCxCz.push(`(${ch.cx},${ch.cz})`);
      }
    }

    window.__physicsTelemetry = {
      grounded: player.onGround,
      velY: player.vel.y.toFixed(2),
      posX: player.pos.x.toFixed(2),
      posY: player.pos.y.toFixed(2),
      posZ: player.pos.z.toFixed(2),
      inWater,
      flying: player.flying,
      supportCollider: support ? `${support.name} [${support.x}, ${support.y}, ${support.z}] (topY: ${support.topY.toFixed(2)})` : "None (In Air)",
      supportChunk: support ? `Chunk (${support.cx}, ${support.cz})` : "N/A",
      collidersCount: colliders.length,
      collidersList: colliders.map(c => `${c.name} [${c.x},${c.y},${c.z}]`).join(", ") || "None",
      cameraSync,
      // Dropped Item Entities Telemetry
      droppedItemsCount: itemDrops.length,
      droppedItemsList: itemDrops.map((d, idx) => ({
        id: d.id,
        name: thingName(d.id),
        count: d.count,
        posX: d.pos.x.toFixed(2),
        posY: d.pos.y.toFixed(2),
        posZ: d.pos.z.toFixed(2),
        velX: d.vel.x.toFixed(2),
        velY: d.vel.y.toFixed(2),
        velZ: d.vel.z.toFixed(2),
        gravityState: !d.onGround ? 'ACTIVE' : 'INACTIVE',
        collidedHoriz: d.collidedHoriz ? 'YES' : 'NO',
        collidedVert: d.collidedVert ? 'YES' : 'NO',
        mode: d.state ? d.state.toUpperCase() : 'FALLING'
      })),
      // Chunk pipeline sync
      dirtyChunks: dirtyChunkCount,
      dirtyCxCz: dirtyCxCz.slice(0, 6).join(" ") || "None",
      lastWaterTick: window.__lastWaterTick ? `Δ${window.__lastWaterTick.changed} blocks, ${window.__lastWaterTick.dirtyChunks} chunks` : "n/a",
      lastMeshRebuild: window.__lastMeshRebuild ? `(${window.__lastMeshRebuild.cx},${window.__lastMeshRebuild.cz}) ${(performance.now() - window.__lastMeshRebuild.t).toFixed(0)}ms ago` : "n/a",
    };
  } else if (webgl.debugGroup) {
    webgl.debugGroup.visible = false;
  }

  webgl.renderer.render(webgl.scene, webgl.camera);

  // FPS ticker — update via reactBridge instead of direct DOM
  loop.fpsCnt = (loop.fpsCnt || 0) + 1;
  loop.fpsTimer = (loop.fpsTimer || 0) + dt;
  if(loop.fpsTimer >= 0.5){
    game.fps = Math.round(loop.fpsCnt/loop.fpsTimer);
    loop.fpsCnt = 0; loop.fpsTimer = 0;
    updateHUD();
  }
}

// ---- Game Bootloader --------------------------------------------------------
export function bootGame() {
  if (webgl.renderer) return;
  let canvas = document.getElementById("game");
  if (!canvas && typeof document !== 'undefined') {
    canvas = document.querySelector('canvas') || document.createElement("canvas");
    canvas.id = "game";
    if (!canvas.parentNode) document.body.insertBefore(canvas, document.body.firstChild);
  }
  if (canvas) {
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      console.warn("WebGL Context Lost. Waiting for restoration...");
    });
    canvas.addEventListener("webglcontextrestored", () => {
      console.log("WebGL Context Restored. Rebuilding scene resources...");
      if (typeof buildAtlas === "function") webgl.atlasTex = buildAtlas();
    });
  }
  webgl.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  webgl.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
  webgl.renderer.setSize(window.innerWidth, window.innerHeight);
  webgl.renderer.setClearColor(0x8fc3e8);

  webgl.atlasTex = buildAtlas();
  webgl.waterMat = createWaterMaterial();
  webgl.scene = new THREE.Scene();
  webgl.scene.fog = new THREE.Fog(0x8fc3e8, RENDER_DIST*16*0.55, RENDER_DIST*16*0.95);

  webgl.camera = new THREE.PerspectiveCamera(72, window.innerWidth/window.innerHeight, 0.1, 1000);
  
  // First person held tool camera group
  webgl.heldGroup = new THREE.Group();
  webgl.camera.add(webgl.heldGroup);
  webgl.scene.add(webgl.camera);

  webgl.dirLight = new THREE.DirectionalLight(0xfff0d8, 0.9);
  webgl.dirLight.position.set(0.5, 1, 0.3);
  webgl.scene.add(webgl.dirLight);

  webgl.moonLight = new THREE.DirectionalLight(0x9fb6e0, 0.0);
  webgl.moonLight.position.set(-0.5, 1, -0.3);
  webgl.scene.add(webgl.moonLight);

  webgl.ambientLight = new THREE.AmbientLight(0x8090a0, 0.75);
  webgl.scene.add(webgl.ambientLight);

  // Sun visual box
  const sunGeo = new THREE.BoxGeometry(10, 10, 10);
  const sunMat = new THREE.MeshBasicMaterial({color: 0xffe060});
  webgl.sunMesh = new THREE.Mesh(sunGeo, sunMat);
  webgl.scene.add(webgl.sunMesh);

  // Moon visual box
  const moonGeo = new THREE.BoxGeometry(8, 8, 8);
  const moonMat = new THREE.MeshBasicMaterial({color: 0xe0e8ff});
  webgl.moonMesh = new THREE.Mesh(moonGeo, moonMat);
  webgl.scene.add(webgl.moonMesh);

  // Procedural Clouds
  createClouds();

  // Highlight Box wireframe setup
  const hlGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  const hlEdges = new THREE.EdgesGeometry(hlGeo);
  webgl.highlight = new THREE.LineSegments(hlEdges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 }));
  webgl.highlight.visible = false;
  webgl.scene.add(webgl.highlight);

  // Player 3D avatar setup
  createPlayerMesh();
  avatarCallbacks.update = updatePlayerMeshMaterials;

  // Crack texture overlay setup
  webgl.crackTex = buildCrackTexture();
  const crackGeo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
  const uv = crackGeo.attributes.uv;
  for(let i=0; i<uv.count; i++){
    uv.setX(i, uv.getX(i)/8); // CRACK_STAGES = 8
  }
  uv.needsUpdate = true;
  webgl.crackTex.wrapS = THREE.RepeatWrapping;
  
  webgl.crackMat = new THREE.MeshBasicMaterial({
    map: webgl.crackTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  webgl.crackMesh = new THREE.Mesh(crackGeo, webgl.crackMat);
  webgl.crackMesh.visible = false;
  webgl.scene.add(webgl.crackMesh);

  initParticles();

  // Mark all existing chunks dirty so they are guaranteed to rebuild into webgl.scene
  for (const ch of world.chunks.values()) {
    ch.dirty = true;
  }

  // Resize handler
  window.addEventListener("resize", () => {
    webgl.camera.aspect = window.innerWidth/window.innerHeight;
    webgl.camera.updateProjectionMatrix();
    webgl.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Mouse camera orientation listeners
  document.addEventListener("mousemove", (e) => {
    if(document.pointerLockElement === webgl.renderer.domElement){
      const s = 0.0022;
      player.yaw -= e.movementX * s;
      player.pitch -= e.movementY * s;
      const lim = Math.PI/2 - 0.01;
      player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
    }
  });

  let justCancelledPathfindingAt = 0;

  document.addEventListener("pointerlockchange", () => {
    game.pointerLocked = (document.pointerLockElement === webgl.renderer.domElement);
    if (game.pointerLocked) {
      game.paused = false; // Lock regained - resume
    }
    if (reactBridge.updateUI) reactBridge.updateUI();
  });

  document.addEventListener("pointerlockerror", () => {
    if (reactBridge.updateUI) reactBridge.updateUI();
  });

  // Prevent right-click browser context menu only during active pointer-locked gameplay
  document.addEventListener("contextmenu", (e) => {
    if (document.pointerLockElement) e.preventDefault();
  });

  // Clear mining on pointer lock loss
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement) {
      mining.held = false;
      mining.active = false;
      hideCrack();
    }
  });

  // Action listeners (left/right click)
  window.addEventListener("mousedown", (e) => {
    // CRITICAL: Ignore mousedown when game is paused, dead, not running, menu open, or target is UI element!
    if (player.dead || !game.running || game.paused || isMenuOpen()) return;

    const isLocked = Boolean(document.pointerLockElement);
    const isCanvas = (e.target === webgl.renderer?.domElement || e.target.id === 'game' || e.target.tagName === 'CANVAS' || e.target === document.body);
    if (!isLocked && !isCanvas) return;

    if(document.pointerLockElement !== webgl.renderer.domElement){
      // Click on canvas when pointer not locked: re-acquire lock
      if(!touch.isTouch) {
        game.paused = false;
        try {
          const promise = document.getElementById('game')?.requestPointerLock();
          if (promise && typeof promise.catch === 'function') promise.catch(() => {});
        } catch(err){}
      }
    }

    if(e.button === 0){ // Left Click: mine / attack
      if(player.swingProgress === 0) player.swingProgress = 0.01;
      if(!attackMob()){
        mining.held = true;
      }
    } else if(e.button === 2){ // Right Click: place block / interact
      e.preventDefault();
      placeBlock();
    }
  });

  window.addEventListener("mouseup", (e) => {
    if(e.button === 0) mining.held = false;
  });

  // Keyboard binding updates
  window.addEventListener("keydown", (e) => {
    // CRITICAL: Ignore key shortcuts when typing in input, textarea, or contentEditable elements!
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      return;
    }

    // Ignore keyboard auto-repeat for menu toggle keys
    if (e.repeat && (e.code === "KeyE" || e.code === "Escape" || e.key === "e" || e.key === "E")) {
      return;
    }

    // If a menu is open, handle key shortcuts
    if(isMenuOpen()){
      if (uiState.chatOpen) {
        // While chatting, ONLY Escape key closes chat mode!
        if (e.code === "Escape" || e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          uiState.chatOpen = false;
          if (window.__closeChatSidePanel) window.__closeChatSidePanel();
          if (game.running) {
            game.paused = false;
          }
          if (reactBridge.updateUI) reactBridge.updateUI();
        }
        return;
      }

      if(e.code === "KeyE" || e.code === "Escape" || e.code === "KeyG" || e.code === "KeyV" || e.key === "e" || e.key === "E" || e.key === "g" || e.key === "G" || e.key === "v" || e.key === "V"){
        e.preventDefault();
        e.stopPropagation();
        if (uiState.craftOpen) closeCraft();
        if (uiState.chestOpen) closeChest();
        if (uiState.furnaceOpen) closeFurnace();
        if (uiState.wayfinderOpen) {
          uiState.wayfinderOpen = false;
          if (window.__closeWayfinder) window.__closeWayfinder();
        }
        if (uiState.onboardingOpen) {
          uiState.onboardingOpen = false;
          if (window.__closeOnboarding) window.__closeOnboarding();
        }
        if (game.running) {
          game.paused = false;
        }
        if (reactBridge.updateUI) reactBridge.updateUI();
      }
      return;
    }


    // ── Navigation mode: Escape cancels pathfinding and returns to normal gameplay mode ──
    if (e.code === 'Escape' && activeNavigation) {
      e.preventDefault();
      e.stopPropagation();
      justCancelledPathfindingAt = Date.now();
      Object.keys(keys).forEach(k => keys[k] = false);
      clearActiveNavigation();
      game.paused = false; // Ensure game stays in normal active mode
      toast('🛑 Pathfinding cancelled. Returned to normal mode.');
      if (reactBridge.updateUI) reactBridge.updateUI();
      return;
    }

    // Escape key handling:
    // First press: open pause screen. Second press while paused: exit to Home Screen.
    if(e.code === "Escape") {
      e.preventDefault();
      Object.keys(keys).forEach(k => keys[k] = false);
      if (game.paused) {
        // Second Escape press while paused: return to Home Screen / Main Menu
        game.running = false;
        game.paused = false;
        if (document.pointerLockElement) document.exitPointerLock();
        if (reactBridge.updateUI) reactBridge.updateUI();
      } else {
        // First Escape press: pause game
        game.paused = true;
        if (document.pointerLockElement) document.exitPointerLock();
        if (reactBridge.updateUI) reactBridge.updateUI();
      }
      return;
    }

    if(player.dead || !game.running) return;

    // Open Chat Mode with 'KeyT' or 'KeyC'
    if (e.code === "KeyC" || e.code === "KeyT" || e.key === "c" || e.key === "C" || e.key === "t" || e.key === "T") {
      e.preventDefault();
      if (!uiState.chatOpen) {
        if (document.pointerLockElement) document.exitPointerLock();
        if (window.__openChatSidePanel) window.__openChatSidePanel();
      }
      return;
    }

    // Toggle/Open Crafting with 'KeyE' — works in-game or while paused
    if(e.code === "KeyE" || e.key === "e" || e.key === "E"){
      e.preventDefault();
      if (game.paused) game.paused = false;
      openCraft();
      return;
    }

    // Toggle Wayfinder & Pathfinder Modal on 'KeyG', 'KeyV', or 'KeyB'
    if (e.code === "KeyG" || e.code === "KeyV" || e.code === "KeyB" || e.key === "g" || e.key === "G" || e.key === "v" || e.key === "V" || e.key === "b" || e.key === "B") {
      e.preventDefault();
      if (document.pointerLockElement) document.exitPointerLock();
      if (window.__toggleWayfinder) window.__toggleWayfinder();
      return;
    }

    // Toggle Auto-Pilot Mode on 'KeyP' or 'p'
    if (e.code === "KeyP" || e.key === "p" || e.key === "P") {
      e.preventDefault();
      if (!activeNavigation) {
        toast("📍 No active GPS navigation — open Wayfinder (G) to select a destination first!");
      } else {
        player.autoPilot = !player.autoPilot;
        if (activeNavigation) activeNavigation.autoPilot = player.autoPilot;
        toast(player.autoPilot ? "🤖 Auto-Pilot ENABLED — Auto-navigating to target..." : "🛑 Auto-Pilot DISABLED");
      }
      return;
    }

    // Don't process other game controls (movement, flying, etc.) while paused and not locked
    if(game.paused && !document.pointerLockElement) return;
    
    // Toggle Physics Debug Overlay on F3
    if(e.code === "F3"){
      e.preventDefault();
      window.__physicsDebug = !window.__physicsDebug;
      toast(`Physics Debug: ${window.__physicsDebug ? "ON" : "OFF"}`);
      if (reactBridge.updateUI) reactBridge.updateUI();
    }

    // Toggle In-Game Error Console & Stack Inspector on F9 or Backquote (~)
    if (e.code === "F9" || e.code === "Backquote") {
      e.preventDefault();
      if (document.pointerLockElement) document.exitPointerLock();
      if (window.__toggleErrorConsole) window.__toggleErrorConsole();
      return;
    }

    // Cycle camera modes on F5 / KeyH press
    if(e.code === "F5" || e.code === "KeyH"){
      e.preventDefault();
      player.cameraMode = (player.cameraMode + 1) % 3;
      toast(`Camera Mode: ${player.cameraMode === 0 ? "First-Person" : (player.cameraMode === 1 ? "Third-Person Back" : "Third-Person Front")}`);
      updateHeldItemMesh();
    }
    keys[e.code] = true;
    if(e.code === "KeyF"){
      // If airborne in survival, F activates slow fall / parachute (handled in updatePlayerPhysics)
      if (!game.survival || player.onGround) {
        player.flying = !player.flying;
        toast(player.flying ? "flying enabled" : "flying disabled");
        updateHUD();
      }
    }
    if(e.code === "KeyQ"){
      const heldId = hotbar[game.selected];
      if(heldId > 0 && invCount(heldId) > 0){
        removeItem(heldId, 1);
        const eyeP = eyePos();
        const lDir = lookDir();
        spawnItemDrop(heldId, 1, eyeP.x + lDir.x * 0.8, eyeP.y + lDir.y * 0.8, eyeP.z + lDir.z * 0.8);
        toast(`Dropped 1 ${thingName(heldId)}`);
        updateHeldItemMesh();
      }
    }
    // Key 1 (Digit1) or Key R triggers remote TNT detonation if holding TNT remote or TNT is active
    if (e.code === "KeyR" || (e.code === "Digit1" && (hotbar[game.selected] === 180 || (game.primedTnt && game.primedTnt.length > 0)))) {
      detonateRemoteTnt();
    }
    // hotbar numbers 1..8
    if(e.code.startsWith("Digit")){
      const n = Number(e.code.replace("Digit","")) - 1;
      if(n >= 0 && n < 8) selectSlot(n);
    }
  });

  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  // Scroll wheel to change selected slot (blocked while paused or menu open)
  window.addEventListener("wheel", (e) => {
    if(document.pointerLockElement !== webgl.renderer.domElement || isMenuOpen() || game.paused) return;
    let s = game.selected + Math.sign(e.deltaY);
    if(s < 0) s = 7;
    if(s > 7) s = 0;
    selectSlot(s);
  });

  // Boot UI & Anti-Cheat Security Shield
  initUI(placeBlock, mining);
  initAntiCheatShield();

  // Load world
  const loaded = loadWorld();
  if(!loaded){
    spawnPlayer();
    if(!game.survival) {
      Object.keys(BLOCKS).forEach(id => inventory[id] = 999);
    } else {
      // Starting items
      inventory[15] = 32; inventory[16] = 16; inventory[7] = 16; 
      inventory[20] = 8; inventory[5] = 8; inventory[9] = 8; 
      inventory[21] = 2; inventory[45] = 4; inventory[8] = 8; 
      inventory[130] = 3; inventory[135] = 2;
    }
  }

  buildHotbar();
  updateHUD();
  updateStatsHUD();

  // pre-generate spawn area
  updateChunkLoading();
  if (Array.isArray(genQueue)) {
    for(let i=0; i<40 && genQueue.length; i++){
      const ch = genQueue.shift();
      if(ch && !ch.generated) generateChunk(ch);
    }
  }
  for(const ch of world.chunks.values()){
    if(ch.generated){ computeChunkLight(ch); updateChunkMesh(ch); }
  }

  // Adjust spawn location
  if(!loaded){
    const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
    let topY = surfaceHeight(px, pz) + 1;
    for(let y = HEIGHT-1; y>=0; y--){ if(isSolid(getBlock(px, y, pz))){ topY = y + 1; break; } }
    player.pos.set(px+0.5, topY+0.5, pz+0.5);
  }

  unstick();
  updateHeldItemMesh();
  requestAnimationFrame(loop);
}

const blockTextureCache = new Map();

function getBlockFaceTexture(tileName) {
  if (typeof document === 'undefined' || !tileName) return null;
  if (blockTextureCache.has(tileName)) return blockTextureCache.get(tileName);

  const dataUrl = getTileDataURL(tileName);
  if (!dataUrl) return null;

  const img = new Image();
  const texture = new THREE.CanvasTexture(img);
  img.onload = () => { texture.needsUpdate = true; };
  img.src = dataUrl;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  blockTextureCache.set(tileName, texture);
  return texture;
}

function getBlockMaterials(id) {
  const block = BLOCKS[id];
  if (!block) return new THREE.MeshLambertMaterial({ color: 0x8a8a8a });

  let topTile = block.top || block.all;
  let sideTile = block.side || block.all;
  let bottomTile = block.bottom || sideTile;

  if (block.ore || !topTile) {
    const nameLower = (block.name || '').toLowerCase();
    if (nameLower.includes("diamond")) topTile = sideTile = bottomTile = "diamond_ore";
    else if (nameLower.includes("coal")) topTile = sideTile = bottomTile = "coal_ore";
    else if (nameLower.includes("iron")) topTile = sideTile = bottomTile = "iron_ore";
    else if (nameLower.includes("gold")) topTile = sideTile = bottomTile = "gold_ore";
    else if (nameLower.includes("redstone")) topTile = sideTile = bottomTile = "redstone_ore";
    else if (nameLower.includes("cobble")) topTile = sideTile = bottomTile = "cobble";
    else if (nameLower.includes("plank")) topTile = sideTile = bottomTile = "plank";
    else if (nameLower.includes("wood") || nameLower.includes("log")) {
      topTile = "wood_top"; sideTile = "wood_side"; bottomTile = "wood_top";
    }
  }

  const createMat = (tileName) => {
    if (tileName) {
      const tex = getBlockFaceTexture(tileName);
      if (tex) return new THREE.MeshLambertMaterial({ map: tex });
    }
    const col = block.color || block.all || 0x8a8a8a;
    return new THREE.MeshLambertMaterial({ color: col });
  };

  return [
    createMat(sideTile),   // Right
    createMat(sideTile),   // Left
    createMat(topTile),    // Top
    createMat(bottomTile), // Bottom
    createMat(sideTile),   // Front
    createMat(sideTile),   // Back
  ];
}

export function createToolMesh(id) {
  const toolGroup = new THREE.Group();
  if (!id || id <= 0) return toolGroup;

  const itemDef = ITEMS[id] || BLOCKS[id];
  const color = itemDef?.color || 0x8a8a8a;
  
  const isMetal = itemDef?.tier && itemDef.tier >= 3;
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: isMetal ? 0.3 : 0.6,
    metalness: isMetal ? 0.7 : 0.1,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a4a24, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.9 });

  if (itemDef && itemDef.tool === "pickaxe") {
    // Pickaxe Wooden Handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.40, 0.025), woodMat);
    handle.position.set(0, 0.14, 0);
    toolGroup.add(handle);
    // Iron Binding Strap
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.035), darkMat);
    strap.position.set(0, 0.28, 0);
    toolGroup.add(strap);
    // Pickaxe Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), mat);
    head.position.set(0, 0.31, 0);
    toolGroup.add(head);
    // Left & Right Curved Tips
    const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.04), mat);
    tipL.position.set(-0.12, 0.28, 0);
    const tipR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.04), mat);
    tipR.position.set(0.12, 0.28, 0);
    toolGroup.add(tipL);
    toolGroup.add(tipR);
  } else if (itemDef && itemDef.tool === "sword") {
    // Pommel Knob
    const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.04), darkMat);
    pommel.position.set(0, -0.04, 0);
    toolGroup.add(pommel);
    // Wooden Grip
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.14, 0.025), woodMat);
    handle.position.set(0, 0.03, 0);
    toolGroup.add(handle);
    // Crossguard
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.04), mat);
    guard.position.set(0, 0.10, 0);
    toolGroup.add(guard);
    // Blade Body
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 0.018), mat);
    blade.position.set(0, 0.32, 0);
    toolGroup.add(blade);
    // Blade Tip
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.018), mat);
    tip.position.set(0, 0.55, 0);
    toolGroup.add(tip);
  } else if (itemDef && itemDef.tool === "axe") {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.40, 0.025), woodMat);
    handle.position.set(0, 0.14, 0);
    toolGroup.add(handle);
    // Main Wedge Blade
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.04), mat);
    head.position.set(0.05, 0.28, 0);
    toolGroup.add(head);
    // Back Poll
    const backPoll = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.045), mat);
    backPoll.position.set(-0.04, 0.28, 0);
    toolGroup.add(backPoll);
  } else if (itemDef && itemDef.tool === "shovel") {
    // Handle & D-Grip
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.40, 0.025), woodMat);
    handle.position.set(0, 0.14, 0);
    toolGroup.add(handle);
    // Spade Scoop Head
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.02), mat);
    blade.position.set(0, 0.32, 0);
    toolGroup.add(blade);
  } else if (itemDef && itemDef.tool === "hoe") {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.40, 0.025), woodMat);
    handle.position.set(0, 0.14, 0);
    toolGroup.add(handle);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.04), mat);
    blade.position.set(0.04, 0.31, 0);
    toolGroup.add(blade);
  } else if (itemDef && itemDef.tool === "bow") {
    const arc = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.04), woodMat);
    arc.position.set(0, 0.15, 0);
    toolGroup.add(arc);
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.40, 0.008), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    string.position.set(-0.02, 0.15, 0);
    toolGroup.add(string);
  } else if (BLOCKS[id]) {
    const mats = getBlockMaterials(id);
    const blockMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), mats);
    blockMesh.position.set(0, 0, 0);
    toolGroup.add(blockMesh);
  } else {
    const itemMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), mat);
    itemMesh.position.set(0, 0.08, 0);
    toolGroup.add(itemMesh);
  }

  return toolGroup;
}

export function updatePlayerArmorMesh(pMesh, armorObj = player.armor) {
  if (!pMesh) return;

  if (!pMesh.armorGroup) {
    pMesh.armorGroup = new THREE.Group();
    pMesh.add(pMesh.armorGroup);
  }

  while (pMesh.armorGroup.children.length > 0) {
    const child = pMesh.armorGroup.children[0];
    pMesh.armorGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  }

  if (!armorObj) return;

  const armorColors = {
    160: 0x8a5a2a, 161: 0x8a5a2a, 162: 0x8a5a2a, 163: 0x8a5a2a, // Leather
    164: 0xcccccc, 165: 0xcccccc, 166: 0xcccccc, 167: 0xcccccc, // Iron
    168: 0x5fe6e0, 169: 0x5fe6e0, 170: 0x5fe6e0, 171: 0x5fe6e0, // Diamond
    172: 0xf2d24a, 173: 0xf2d24a, 174: 0xf2d24a, 175: 0xf2d24a, // Gold
  };

  // 1. Helmet + Visor Brim
  if (armorObj.helmet && armorObj.helmet.id) {
    const col = armorColors[armorObj.helmet.id] || 0xcccccc;
    const helmMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.5 });
    const helmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), helmMat);
    helmMesh.position.set(0, 1.575, 0);
    
    // Visor Brim
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.06, 0.08), helmMat);
    brim.position.set(0, 1.62, 0.16);
    helmMesh.add(brim);

    pMesh.armorGroup.add(helmMesh);
  }

  // 2. Chestplate + Shoulder Pauldrons
  if (armorObj.chestplate && armorObj.chestplate.id) {
    const col = armorColors[armorObj.chestplate.id] || 0xcccccc;
    const chestMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.5 });
    
    // Main Torso Plate
    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.54, 0.20), chestMat);
    chestMesh.position.set(0, 1.1375, 0);

    // Left & Right Shoulder Pauldrons
    const leftPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.15), chestMat);
    leftPauldron.position.set(-0.25, 1.32, 0);
    const rightPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.15), chestMat);
    rightPauldron.position.set(0.25, 1.32, 0);

    pMesh.armorGroup.add(chestMesh);
    pMesh.armorGroup.add(leftPauldron);
    pMesh.armorGroup.add(rightPauldron);
  }

  // 3. Leggings
  if (armorObj.leggings && armorObj.leggings.id) {
    const col = armorColors[armorObj.leggings.id] || 0xcccccc;
    const legMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.5 });
    const leftLegArmor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.18), legMat);
    leftLegArmor.position.set(-0.09, 0.32, 0);
    const rightLegArmor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.18), legMat);
    rightLegArmor.position.set(0.09, 0.32, 0);
    pMesh.armorGroup.add(leftLegArmor);
    pMesh.armorGroup.add(rightLegArmor);
  }

  // 4. Boots
  if (armorObj.boots && armorObj.boots.id) {
    const col = armorColors[armorObj.boots.id] || 0xcccccc;
    const bootMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.5 });
    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.18, 0.19), bootMat);
    leftBoot.position.set(-0.09, 0.09, 0);
    const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.18, 0.19), bootMat);
    rightBoot.position.set(0.09, 0.09, 0);
    pMesh.armorGroup.add(leftBoot);
    pMesh.armorGroup.add(rightBoot);
  }
}

export function updatePlayerRightHandTool(pMesh, selectedId = hotbar[game.selected]) {
  if (!pMesh || !pMesh.rightArm) return;

  if (!pMesh.rightArm.toolGroup) {
    pMesh.rightArm.toolGroup = new THREE.Group();
    pMesh.rightArm.add(pMesh.rightArm.toolGroup);
  }

  while (pMesh.rightArm.toolGroup.children.length > 0) {
    const c = pMesh.rightArm.toolGroup.children[0];
    pMesh.rightArm.toolGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
  }

  if (selectedId > 0) {
    const tool3D = createToolMesh(selectedId);
    tool3D.position.set(0, -0.22, 0.12);
    tool3D.rotation.set(Math.PI / 4, 0, 0);
    pMesh.rightArm.toolGroup.add(tool3D);
  }
}

export function updateHeldItemMesh() {
  if (!webgl.heldGroup) return;

  const currentSelectedId = hotbar[game.selected];
  
  while(webgl.heldGroup.children.length > 0) {
    const c = webgl.heldGroup.children[0];
    webgl.heldGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
      else c.material.dispose();
    }
  }

  const avatar = player.avatar || { shirtColor: "#008080", skinColor: "#dfcfb7" };
  const shirtMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(avatar.shirtColor || "#008080") });
  const skinMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(avatar.skinColor || "#dfcfb7") });

  // 1. Unified Forearm Sleeve & Hand Hierarchy (prevents disconnection/shearing)
  const armGroup = new THREE.Group();

  // Forearm Sleeve (shirt color)
  const sleeveGeo = new THREE.BoxGeometry(0.095, 0.095, 0.24);
  const sleeveMesh = new THREE.Mesh(sleeveGeo, shirtMat);
  sleeveMesh.position.set(0, 0, 0.10);
  armGroup.add(sleeveMesh);

  // Hand / Wrist (skin color) - perfectly flush with sleeve along Z-axis
  const handGeo = new THREE.BoxGeometry(0.088, 0.088, 0.10);
  const handMesh = new THREE.Mesh(handGeo, skinMat);
  handMesh.position.set(0, 0, -0.06);
  armGroup.add(handMesh);

  // 2. Render Held 3D Item or Block in Palm
  if (currentSelectedId > 0) {
    const tool3D = createToolMesh(currentSelectedId);
    if (BLOCKS[currentSelectedId]) {
      tool3D.position.set(0.01, 0.04, -0.14);
      tool3D.rotation.set(0.2, 0.45, -0.1);
    } else {
      tool3D.position.set(0, -0.02, -0.14);
      tool3D.rotation.set(-0.15, -0.35, 0.15);
    }
    armGroup.add(tool3D);
  }

  // Single unified angle for arm
  armGroup.position.set(0.02, -0.02, 0);
  armGroup.rotation.set(0.12, -0.22, 0.08);
  webgl.heldGroup.add(armGroup);

  // Idle Sway & Swing Animations
  const time = performance.now() * 0.002;
  const bobY = Math.sin(time * 2) * 0.005;
  const bobX = Math.cos(time) * 0.003;

  webgl.heldGroup.position.set(0.25 + bobX, -0.22 + bobY, -0.38);

  if (player.swingProgress > 0) {
    const phase = player.swingProgress;
    const swingAngle = Math.sin(phase * Math.PI) * -0.9;
    webgl.heldGroup.rotation.set(swingAngle, 0, swingAngle * 0.4);
  } else {
    webgl.heldGroup.rotation.set(0, 0, 0);
  }

  if (webgl.playerMesh) {
    updatePlayerArmorMesh(webgl.playerMesh, player.armor);
    updatePlayerRightHandTool(webgl.playerMesh, currentSelectedId);
  }
}

export function createPlayerMesh() {
  const group = new THREE.Group();
  
  const headMat = new THREE.MeshLambertMaterial();
  const bodyMat = new THREE.MeshLambertMaterial();
  const legMat = new THREE.MeshLambertMaterial();
  const armMat = new THREE.MeshLambertMaterial();
  
  // Head
  const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.set(0, 1.575, 0);
  group.add(headMesh);
  group.head = headMesh;
  
  // Body
  const bodyGeo = new THREE.BoxGeometry(0.35, 0.525, 0.175);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.set(0, 1.1375, 0);
  group.add(bodyMesh);
  
  // Left Leg
  const legGeo = new THREE.BoxGeometry(0.16, 0.525, 0.16);
  const leftLegMesh = new THREE.Mesh(legGeo, legMat);
  leftLegMesh.position.set(-0.09, 0.2625, 0);
  group.add(leftLegMesh);
  group.leftLeg = leftLegMesh;
  
  // Right Leg
  const rightLegMesh = new THREE.Mesh(legGeo, legMat);
  rightLegMesh.position.set(0.09, 0.2625, 0);
  group.add(rightLegMesh);
  group.rightLeg = rightLegMesh;
  
  // Left Arm
  const armGeo = new THREE.BoxGeometry(0.12, 0.525, 0.12);
  const leftArmMesh = new THREE.Mesh(armGeo, armMat);
  leftArmMesh.position.set(-0.24, 1.1375, 0);
  group.add(leftArmMesh);
  group.leftArm = leftArmMesh;
  
  // Right Arm
  const rightArmMesh = new THREE.Mesh(armGeo, armMat);
  rightArmMesh.position.set(0.24, 1.1375, 0);
  group.add(rightArmMesh);
  group.rightArm = rightArmMesh;
  
  webgl.scene.add(group);
  webgl.playerMesh = group;
  
  updatePlayerMeshMaterials();
}

export function updatePlayerMeshMaterials() {
  if (!webgl.playerMesh) return;
  const avatar = player.avatar || { headType: "steve", shirtColor: "#008080", pantsColor: "#3c4e8c", skinColor: "#dfcfb7" };
  
  const headMat = webgl.playerMesh.head.material;
  const bodyMat = webgl.playerMesh.children[1].material;
  const leftLegMat = webgl.playerMesh.leftLeg.material;
  const rightLegMat = webgl.playerMesh.rightLeg.material;
  const leftArmMat = webgl.playerMesh.leftArm.material;
  const rightArmMat = webgl.playerMesh.rightArm.material;
  
  let skinCol = new THREE.Color(avatar.skinColor);
  let shirtCol = new THREE.Color(avatar.shirtColor);
  let pantsCol = new THREE.Color(avatar.pantsColor);
  
  if (avatar.headType === "zombie") {
    skinCol = new THREE.Color(0x4a7a4a);
  } else if (avatar.headType === "creeper") {
    skinCol = new THREE.Color(0x2e8b57);
  }
  
  headMat.color.copy(skinCol);
  bodyMat.color.copy(shirtCol);
  leftLegMat.color.copy(pantsCol);
  rightLegMat.color.copy(pantsCol);
  leftArmMat.color.copy(shirtCol);
  rightArmMat.color.copy(shirtCol);

  updatePlayerArmorMesh(webgl.playerMesh, player.armor);
  updatePlayerRightHandTool(webgl.playerMesh, hotbar[game.selected]);
}

// ── 3D MULTIPLAYER OTHER PLAYER AVATARS & RENDERING ENGINE ──

export const otherPlayerMeshes = new Map();

function safeColor(colorStr, defaultHex) {
  try {
    if (typeof colorStr === 'string' && colorStr.length >= 3) {
      return new THREE.Color(colorStr);
    }
  } catch (e) {}
  return new THREE.Color(defaultHex);
}

function disposePlayerGroup(group) {
  if (!group) return;
  group.traverse((child) => {
    if (child.isMesh || child.isSprite) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
        } else {
          child.material.dispose();
        }
      }
    }
  });
}

export function clearOtherPlayerMeshes() {
  for (const [uid, pMesh] of otherPlayerMeshes.entries()) {
    if (webgl.scene) webgl.scene.remove(pMesh);
    disposePlayerGroup(pMesh);
  }
  otherPlayerMeshes.clear();
}
if (typeof window !== 'undefined') window.__clearOtherPlayerMeshes = clearOtherPlayerMeshes;

function createOtherPlayerMesh(pData) {
  const group = new THREE.Group();
  const avatar = pData.avatar || {};

  let skinCol = safeColor(avatar.skinColor, "#dfcfb7");
  let shirtCol = safeColor(avatar.shirtColor, "#008080");
  let pantsCol = safeColor(avatar.pantsColor, "#3c4e8c");

  if (avatar.headType === "zombie") skinCol = new THREE.Color(0x4a7a4a);
  else if (avatar.headType === "creeper") skinCol = new THREE.Color(0x2e8b57);

  const headMat = new THREE.MeshLambertMaterial({ color: skinCol });
  const bodyMat = new THREE.MeshLambertMaterial({ color: shirtCol });
  const legMat = new THREE.MeshLambertMaterial({ color: pantsCol });
  const armMat = new THREE.MeshLambertMaterial({ color: shirtCol });

  // Head
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), headMat);
  headMesh.position.set(0, 1.575, 0);
  group.add(headMesh);
  group.head = headMesh;

  // Body
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.525, 0.175), bodyMat);
  bodyMesh.position.set(0, 1.1375, 0);
  group.add(bodyMesh);

  // Left Leg
  const legGeo = new THREE.BoxGeometry(0.16, 0.525, 0.16);
  const leftLegMesh = new THREE.Mesh(legGeo, legMat);
  leftLegMesh.position.set(-0.09, 0.2625, 0);
  group.add(leftLegMesh);
  group.leftLeg = leftLegMesh;

  // Right Leg
  const rightLegMesh = new THREE.Mesh(legGeo, legMat);
  rightLegMesh.position.set(0.09, 0.2625, 0);
  group.add(rightLegMesh);
  group.rightLeg = rightLegMesh;

  // Left Arm
  const armGeo = new THREE.BoxGeometry(0.12, 0.525, 0.12);
  const leftArmMesh = new THREE.Mesh(armGeo, armMat);
  leftArmMesh.position.set(-0.24, 1.1375, 0);
  group.add(leftArmMesh);
  group.leftArm = leftArmMesh;

  // Right Arm
  const rightArmMesh = new THREE.Mesh(armGeo, armMat);
  rightArmMesh.position.set(0.24, 1.1375, 0);
  group.add(rightArmMesh);
  group.rightArm = rightArmMesh;

  // Floating 3D Name Tag Canvas Sprite
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#ffdf7e';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cleanEmail = String(pData.email || 'Player').replace(/<[^>]*>?/gm, '');
  const label = cleanEmail.split('@')[0];
  ctx.fillText(label, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(0, 2.05, 0);
  sprite.scale.set(1.5, 0.385, 1);
  group.add(sprite);

  if (webgl.scene) webgl.scene.add(group);
  return group;
}

export function updateOtherPlayers3D(dt) {
  if (game.mode === 'singleplayer') {
    if (otherPlayerMeshes.size > 0) clearOtherPlayerMeshes();
    return;
  }

  const activeList = game.otherPlayersList || [];
  const currentUids = new Set();
  const currentEmail = window.__currentUserEmail;

  for (const p of activeList) {
    if (!p.uid || p.email === currentEmail || !p.pos) continue;
    currentUids.add(p.uid);

    let pMesh = otherPlayerMeshes.get(p.uid);
    if (!pMesh) {
      pMesh = createOtherPlayerMesh(p);
      otherPlayerMeshes.set(p.uid, pMesh);
    }

    const targetPos = new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z);
    pMesh.position.lerp(targetPos, Math.min(1.0, dt * 15));
    pMesh.rotation.y = p.yaw || 0;
    if (pMesh.head) pMesh.head.rotation.x = -(p.pitch || 0);

    // Walking animation legs
    const phase = (performance.now() * 0.01) % (Math.PI * 2);
    const swing = Math.sin(phase) * 0.45;
    if (pMesh.leftLeg) pMesh.leftLeg.rotation.x = swing;
    if (pMesh.rightLeg) pMesh.rightLeg.rotation.x = -swing;
    if (pMesh.leftArm) pMesh.leftArm.rotation.x = -swing;
    if (pMesh.rightArm) pMesh.rightArm.rotation.x = swing;
  }

  // Remove disconnected player meshes with full GPU memory disposal
  for (const [uid, pMesh] of otherPlayerMeshes.entries()) {
    if (!currentUids.has(uid)) {
      if (webgl.scene) webgl.scene.remove(pMesh);
      disposePlayerGroup(pMesh);
      otherPlayerMeshes.delete(uid);
    }
  }
}

export function spawnLightningStrike(x, y, z) {
  if (!webgl.scene) return;
  const topY = Math.min(128, y + 40);
  const geom = new THREE.CylinderGeometry(0.15, 0.4, topY - y, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y + (topY - y)/2, z);
  webgl.scene.add(mesh);

  spawnBreakBurst(x, y, z, 91);
  playMineSound(16);

  let ticks = 0;
  const flashInterval = setInterval(() => {
    ticks++;
    mat.opacity = ticks % 2 === 0 ? 0.9 : 0.2;
    if (ticks > 8) {
      clearInterval(flashInterval);
      if (webgl.scene) webgl.scene.remove(mesh);
      geom.dispose();
      mat.dispose();
    }
  }, 40);
}
if (typeof window !== 'undefined') window.__spawnLightningStrike = spawnLightningStrike;

// Auto start game bootloader
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootGame);
  } else {
    bootGame();
  }
}
