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
  createWaterMaterial
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
  MOB_TYPES, makeMobMesh, spawnMob, trySpawnMobs, updateMobs, removeMob, attackMob 
} from './mobs.js';
import { 
  initUI, toast, updateHUD, updateClock, updateStatsHUD, flashDamage, 
  showDeathScreen, hideDeathScreen, buildHotbar, selectSlot, refreshCounts, 
  openCraft, closeCraft, closeChest, closeFurnace, craft, saveWorld, scheduleSave, loadWorld, getCraftOpen,
  openChest, openFurnace, isMenuOpen, tickFurnaces, uiState,
  setChestOpen, setFurnaceOpen, setActiveChestCoords, setActiveFurnaceCoords,
  unlockAchievement
} from './ui.js';
import { playPlaceSound, playMineSound } from './audio.js';
import { activeNavigation, findPath, updatePathTrail } from './pathfinder.js';

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
  if (typeof window !== 'undefined') window.__spawnItemDrop = spawnItemDrop;
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

// ---- Primed TNT System ----
const tntGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);

export function spawnPrimedTnt(x, y, z) {
  let mesh;
  if (webgl.atlasTex) {
    const geo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const faceMap = [4, 5, 0, 1, 2, 3];
    const uvAttr = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const faceIdx = faceMap[f];
      const tile = tileFor(56, faceIdx); // ID 56 = TNT
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
    const tntMat = new THREE.MeshLambertMaterial({ color: 0xd83030 });
    mesh = new THREE.Mesh(tntGeo, tntMat);
  }
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  if (webgl.scene) webgl.scene.add(mesh);

  game.primedTnt.push({
    mesh,
    pos: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
    fuse: 3.0,
  });
}

export function updatePrimedTnt(dt) {
  if (!webgl.scene || game.primedTnt.length === 0) return;
  const now = performance.now();

  for (let i = game.primedTnt.length - 1; i >= 0; i--) {
    const tnt = game.primedTnt[i];
    tnt.fuse -= dt;

    // Pulsing scale & flashing white effect
    const pulse = 1.0 + Math.sin(tnt.fuse * 14) * 0.08;
    tnt.mesh.scale.setScalar(pulse);
    
    if (Math.floor(now / 100) % 2 === 0) {
      tnt.mesh.material.color.setHex(0xffffff);
    } else {
      tnt.mesh.material.color.setHex(0xd83030);
    }

    if (tnt.fuse <= 0) {
      triggerWorldExplosion(tnt.pos.x, tnt.pos.y, tnt.pos.z, 4.0, scheduleSave);
      playExplodeSound();
      const pDist = tnt.pos.distanceTo(player.pos);
      if (pDist < 5.0) {
        const tntDmg = Math.max(1, Math.ceil(20 * (1 - pDist / 5.0)));
        hurtPlayer(tntDmg, "tnt");
      }
      for (const m of game.mobs) {
        const mDist = tnt.pos.distanceTo(m.pos);
        if (mDist < 5.0) {
          m.hp -= Math.max(1, Math.ceil(25 * (1 - mDist / 5.0)));
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
  
  for(let i=0; i<128; i++){
    const b = getBlock(x, y, z);
    if(b !== 0 && BLOCKS[b] && (includeWater || (b !== 8 && b !== 9))){
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
  spawnBreakBurst(x, y, z, id);
  setBlock(x, y, z, 0, true, scheduleSave);
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
            setBlock(lx, ly, lz, 0, true, scheduleSave);
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
      setBlock(cx, cy, cz, 0, true, scheduleSave);
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
      setBlock(cx, cy, cz, 91, true, scheduleSave);
      updateAfterEdit(cx, cy, cz);
      crop.timer = 0;
      changed = true;
    } else if (id === 91 && crop.timer >= 30) {
      setBlock(cx, cy, cz, 92, true, scheduleSave);
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

export function placeBlock(){
  if (typeof window !== 'undefined' && window.__worldSettings && window.__worldSettings.lockdown && !(window.__userRole === 'admin' || window.__userRole === 'master')) {
    toast("⚠️ Build Lockdown Active: World edits restricted by Admin.");
    return;
  }
  const heldId = hotbar[game.selected];
  const isBucket = (heldId === 144 || heldId === 145);
  // Always include water in raycast for placeable blocks so the ray hits the water
  // voxel directly rather than the solid floor beneath it.
  const includeWater = isBucket || keys["ShiftLeft"] || keys["ShiftRight"] || isPlaceable(heldId) || (heldId > 0 && BLOCKS[heldId]);
  const r = raycastVoxel(6, includeWater);
  if(!r) return;
  
  // Intercept right click container interaction
  const hitBlockId = getBlock(r.hit[0], r.hit[1], r.hit[2]);
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
  if(hitBlockId === 56){ // TNT Block right-click ignite
    spawnPrimedTnt(r.hit[0], r.hit[1], r.hit[2]);
    setBlock(r.hit[0], r.hit[1], r.hit[2], 0, true, scheduleSave);
    updateAfterEdit(r.hit[0], r.hit[1], r.hit[2]);
    playHissSound();
    toast("TNT Primed!");
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
      setBlock(hx, hy, hz, 89, true, scheduleSave);
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
        setBlock(hx, plantY, hz, 90, true, scheduleSave);
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
        setBlock(bx, by, bz, 8, true, scheduleSave);
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
        setBlock(hx, hy, hz, 0, true, scheduleSave);
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
  // If the ray hit a water block, place INTO that water cell (replacing it).
  // Otherwise place at r.prev (the empty cell adjacent to the hit block).
  let x, y, z;
  if (hitBlockId === 8 || hitBlockId === 9) {
    // Replace the water block directly
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
    setBlock(x, y, z, 8, true, scheduleSave);
    setWater(x, y, z, undefined); // source
    playPlaceSound(id);
    updateAfterEdit(x, y, z);
    disturbWater(x, y, z);
    return;
  }
  
  setBlock(x, y, z, id, true, scheduleSave);
  if(game.survival){ removeItem(id, 1); }
  playPlaceSound(id);
  updateAfterEdit(x, y, z);
  disturbWater(x, y, z);

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
    updateItemDrops(dt);
    updateXpOrbs(dt);
    updateProjectiles(dt);
    updatePrimedTnt(dt);
  }
  
  // Paused flag guards: these world-simulation ticks should stop while game is paused
  if (!game.paused) {
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

  // Dynamic Sprinting FOV Stretch interpolation
  if (webgl.camera) {
    // Always reset sprint FOV while paused so it doesn't stay stretched
    const targetFov = (!game.paused && player.sprinting) ? 84 : 72;
    webgl.camera.fov += (targetFov - webgl.camera.fov) * Math.min(1, dt * 8.0);
    webgl.camera.updateProjectionMatrix();
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

  // Underwater screen overlay & fog adjustment
  const headY = Math.floor(player.pos.y + player.eye);
  const headBlock = getBlock(Math.floor(player.pos.x), headY, Math.floor(player.pos.z));
  const isUnderwater = (headBlock === 8);

  let uEl = document.getElementById("underwaterOverlay");
  if (!uEl && typeof document !== "undefined") {
    uEl = document.createElement("div");
    uEl.id = "underwaterOverlay";
    uEl.style.cssText = "position:fixed;inset:0;z-index:7;pointer-events:none;background:rgba(20,80,180,0.36);display:none;opacity:0;transition:opacity 0.2s;";
    document.body.appendChild(uEl);
  }
  if (uEl) {
    uEl.style.display = isUnderwater ? "block" : "none";
    uEl.style.opacity = isUnderwater ? "1" : "0";
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
  if (game.running && activeNavigation && activeNavigation.targetPos) {
    if (!webgl.navTimer) webgl.navTimer = 0;
    webgl.navTimer += dt;
    if (webgl.navTimer >= 0.40) { // Recalculate every 400ms
      webgl.navTimer = 0;
      const startPos = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
      const pathNodes = findPath(startPos, activeNavigation.targetPos, 600);
      if (pathNodes && pathNodes.length > 0) {
        updatePathTrail(pathNodes);
        activeNavigation.pathNodes = pathNodes;
        const dx = activeNavigation.targetPos.x - player.pos.x;
        const dy = activeNavigation.targetPos.y - player.pos.y;
        const dz = activeNavigation.targetPos.z - player.pos.z;
        activeNavigation.distance = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
      }
    }
  }

  if (game.running && !game.paused) {
    let targetInfo = null;

    // 1. Check if looking at or close to a mob
    let closestMob = null;
    let closestMobDist = 3.5;
    if (Array.isArray(game.mobs)) {
      for (const m of game.mobs) {
        if (m.dead) continue;
        const d = m.pos.distanceTo(player.pos);
        if (d < closestMobDist) {
          closestMobDist = d;
          closestMob = m;
        }
      }
    }

    // 2. Check if close to a dropped item entity
    let closestDrop = null;
    let closestDropDist = 2.8;
    for (const d of itemDrops) {
      const dist = d.pos.distanceTo(player.pos);
      if (dist < closestDropDist) {
        closestDropDist = dist;
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

    if (closestMob && closestMobDist < 3.2) {
      targetInfo = {
        type: 'mob',
        name: `${closestMob.def?.name || 'Mob'} (${closestMob.hp}/${closestMob.def?.maxHp || 10} HP)`,
        action: '⚔️ Left Click to Attack'
      };
    } else if (closestDrop && closestDropDist < 2.8 && !targetInfo) {
      targetInfo = {
        type: 'item',
        name: `${thingName(closestDrop.id)} ×${closestDrop.count}`,
        action: '🧲 Walk near to magnet-collect'
      };
    }

    window.__hudTargetInfo = targetInfo;

    // 4. Project saved Waypoints (Base 🏡, Farm 🌾, Online Teammates 👤) to 2D Screen Space for 3D Markers
    if (webgl.camera && typeof window !== 'undefined') {
      const waypoints = typeof window.__getWaypoints === 'function' ? window.__getWaypoints() : [];
      const projectedWaypoints = [];

      // Combine local waypoints with online players & shared bases
      const waypointsList = [...waypoints];

      if (Array.isArray(game.otherPlayersList)) {
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

          if (Array.isArray(op.bases)) {
            for (const b of op.bases) {
              waypointsList.push({
                id: `op_base_${b.id || Math.random()}`,
                name: `${shortEmail}'s ${b.name || 'Base'}`,
                icon: b.icon || '🏡',
                x: b.x,
                y: b.y,
                z: b.z
              });
            }
          }
        }
      }

      for (const wp of waypointsList) {
        if (!wp || typeof wp.x !== 'number') continue;
        const wpVec = new THREE.Vector3(wp.x + 0.5, wp.y + 1.2, wp.z + 0.5);
        const dist = Math.round(wpVec.distanceTo(player.pos));
        
        // Project 3D pos to normalized device coordinates
        const proj = wpVec.clone().project(webgl.camera);
        // Check if in front of camera
        if (proj.z < 1.0) {
          const screenX = (proj.x * 0.5 + 0.5) * window.innerWidth;
          const screenY = (-(proj.y * 0.5) + 0.5) * window.innerHeight;
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
  webgl.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  webgl.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

  document.addEventListener("pointerlockchange", () => {
    game.pointerLocked = (document.pointerLockElement === webgl.renderer.domElement);
    if (!game.pointerLocked && !isMenuOpen() && !player.dead && game.running) {
      game.paused = true; // Pause physics/input, show resume overlay
    } else if (game.pointerLocked) {
      game.paused = false; // Lock regained - resume
    }
    if (reactBridge.updateUI) reactBridge.updateUI();
  });

  document.addEventListener("pointerlockerror", () => {
    if (!document.pointerLockElement && !isMenuOpen() && !player.dead && game.running) {
      game.paused = true;
      if (reactBridge.updateUI) reactBridge.updateUI();
    }
  });

  // Prevent right-click browser context menu on all document (not just canvas)
  document.addEventListener("contextmenu", (e) => {
    if (game.running) e.preventDefault();
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

    const isCanvas = (e.target === webgl.renderer?.domElement || e.target.id === 'game' || e.target.tagName === 'CANVAS');
    if (!isCanvas) return;

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
          if (game.running && !document.pointerLockElement) {
            game.paused = true;
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
        // When closing any modal, ensure pause overlay is shown if pointer is unlocked
        if (game.running && !document.pointerLockElement) {
          game.paused = true;
        }
        if (reactBridge.updateUI) reactBridge.updateUI();
      }
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

    // Toggle Wayfinder & Pathfinder Modal on 'KeyG' or 'KeyV'
    if (e.code === "KeyG" || e.code === "KeyV" || e.key === "g" || e.key === "G" || e.key === "v" || e.key === "V") {
      e.preventDefault();
      if (document.pointerLockElement) document.exitPointerLock();
      if (window.__toggleWayfinder) window.__toggleWayfinder();
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

    // Cycle camera modes on F5 / KeyH press
    if(e.code === "F5" || e.code === "KeyH"){
      e.preventDefault();
      player.cameraMode = (player.cameraMode + 1) % 3;
      toast(`Camera Mode: ${player.cameraMode === 0 ? "First-Person" : (player.cameraMode === 1 ? "Third-Person Back" : "Third-Person Front")}`);
      updateHeldItemMesh();
    }
    keys[e.code] = true;
    if(e.code === "KeyF"){
      player.flying = !player.flying;
      toast(player.flying ? "flying enabled" : "flying disabled");
      updateHUD();
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

export function updateHeldItemMesh() {
  if (!webgl.heldGroup) return;
  
  while(webgl.heldGroup.children.length > 0) {
    const c = webgl.heldGroup.children[0];
    webgl.heldGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
      else c.material.dispose();
    }
  }
  
  // Always render a constant player hand in first-person view
  const geo = new THREE.BoxGeometry(0.06, 0.06, 0.22);
  const mat = new THREE.MeshLambertMaterial({ color: 0xdfcfb7 });
  const handMesh = new THREE.Mesh(geo, mat);
  handMesh.position.set(0, 0, 0);
  webgl.heldGroup.add(handMesh);
  
  webgl.heldGroup.position.set(0.24, -0.2, -0.35);
  webgl.heldGroup.rotation.set(0, 0, 0);
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
