import * as THREE from 'three';
import { player, game, webgl, toolDurability, hotbar } from './state.js';
import { HEIGHT, isSolid, surfaceHeight, thingName } from './config.js';
import { getBlock, triggerWorldExplosion, setBlock, spawnBreakBurst } from './world.js';
import { 
  hurtPlayer, addItem, removeItem, heldTool, collisionSolid, eyePos, lookDir 
} from './player.js';
import { spawnItemDrop, spawnXpOrbs, spawnProjectile } from './main.js';
import { toast, scheduleSave } from './ui.js';
import { playHissSound, stopHissSound, playExplodeSound, playHitSound, playPigSound, playSheepSound, playZombieSound } from './audio.js';
import { findPath } from './pathfinder.js';

const GRAV = -26;

export const MOB_TYPES = {
  pig:      { name:"Pig",      color:0xe89090, w:0.9, h:0.9,  hp:8,  hostile:false, drop:133, dropN:2, speed:1.8 },
  sheep:    { name:"Sheep",    color:0xe8e8e0, w:0.9, h:1.1,  hp:8,  hostile:false, drop:50,  dropN:1, speed:1.6 },
  zombie:   { name:"Zombie",   color:0x4a7a4a, w:0.6, h:1.8,  hp:14, hostile:true,  drop:133, dropN:1, speed:2.6, dmg:3 },
  creeper:  { name:"Creeper",  color:0x2e8b57, w:0.6, h:1.7,  hp:16, hostile:true,  drop:148, dropN:2, speed:2.4, dmg:0 },
  skeleton: { name:"Skeleton", color:0xd0d0d0, w:0.6, h:1.8,  hp:16, hostile:true,  drop:147, dropN:3, speed:2.2, dmg:2 },
  spider:   { name:"Spider",   color:0x333333, w:1.2, h:0.75, hp:10, hostile:true,  drop:115, dropN:2, speed:3.2, dmg:2, canClimb:true },
};

const MAX_MOBS = 16;
let mobSpawnTimer = 0;

// ---- LOS raycast through voxels -------------------------------------------------
function hasLineOfSight(from, to, maxDist = 20) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (dist > maxDist) return false;
  const steps = Math.ceil(dist * 2);
  const ix = dx / steps, iy = dy / steps, iz = dz / steps;
  let cx = from.x, cy = from.y, cz = from.z;
  for (let s = 0; s < steps; s++) {
    cx += ix; cy += iy; cz += iz;
    const b = getBlock(Math.floor(cx), Math.floor(cy), Math.floor(cz));
    if (b !== 0 && b !== 8 && isSolid(b)) return false;
  }
  return true;
}

// ---- Water depth check ----------------------------------------------------------
function waterDepthAt(x, z) {
  let depth = 0;
  for (let y = 60; y >= 1; y--) {
    const b = getBlock(Math.floor(x), y, Math.floor(z));
    if (b === 8) { depth++; }
    else if (b !== 0) break;
  }
  return depth;
}

// ---- Shade & Water Search --------------------------------------------------------
function findNearbyShadeOrWater(mobX, mobY, mobZ, radius = 10) {
  let bestPos = null, minD = Infinity;
  const startX = Math.floor(mobX), startZ = Math.floor(mobZ), startZFloor = Math.floor(mobZ);
  for (let dx = -radius; dx <= radius; dx += 3) {
    for (let dz = -radius; dz <= radius; dz += 3) {
      const cx = startX + dx, cz = startZFloor + dz;
      const cy = Math.floor(surfaceHeight(cx, cz)) + 1;
      if (cy <= 0 || cy >= HEIGHT - 2) continue;
      const b = getBlock(cx, cy, cz);
      const isWater = (b === 8);
      let isShaded = false;
      if (!isWater) {
        for (let y = cy + 1; y < cy + 15 && y < 128; y++) {
          if (isSolid(getBlock(cx, y, cz))) { isShaded = true; break; }
        }
      }
      if (isWater || isShaded) {
        const dist = Math.hypot(cx + 0.5 - mobX, cz + 0.5 - mobZ);
        if (dist < minD) { minD = dist; bestPos = new THREE.Vector3(cx + 0.5, cy, cz + 0.5); }
      }
    }
  }
  return bestPos;
}

function findNearbyWaterOrDirt(mobX, mobY, mobZ, radius = 8) {
  let bestPos = null, minD = Infinity;
  const startX = Math.floor(mobX), startZ = Math.floor(mobZ);
  for (let dx = -radius; dx <= radius; dx += 3) {
    for (let dz = -radius; dz <= radius; dz += 3) {
      const cx = startX + dx, cz = startZ + dz;
      const cy = Math.floor(surfaceHeight(cx, cz));
      if (cy <= 0 || cy >= HEIGHT - 2) continue;
      const b = getBlock(cx, cy, cz);
      if (b === 8 || b === 3) {
        const dist = Math.hypot(cx + 0.5 - mobX, cz + 0.5 - mobZ);
        if (dist < minD) { minD = dist; bestPos = new THREE.Vector3(cx + 0.5, cy + 1, cz + 0.5); }
      }
    }
  }
  return bestPos;
}

// ---- Mesh builders --------------------------------------------------------------
export function makeMobMesh(type){
  const t = MOB_TYPES[type];
  const group = new THREE.Group();
  webgl.scene?.add(group);
  
  const mat = new THREE.MeshLambertMaterial({ color: t.color });
  const legs = [];
  const arms = [];
  let head = null;
  let body = null;
  
  if(type === "pig"){
    body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 1.2), mat);
    body.position.set(0, 0.525, 0);
    group.add(body);
    head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
    head.position.set(0, 0.65, -0.7);
    group.add(head);
    const snoutMat = new THREE.MeshLambertMaterial({ color: 0xd87070 });
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.15), snoutMat);
    snout.position.set(0, -0.05, -0.28);
    head.add(snout);

    const legGeo = new THREE.BoxGeometry(0.22, 0.4, 0.22);
    legGeo.translate(0, -0.2, 0);
    for(let dx of [-0.3, 0.3]) for(let dz of [-0.4, 0.4]){
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(dx, 0.4, dz);
      group.add(leg);
      legs.push(leg);
    }
  } else if(type === "sheep"){
    body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.3), mat);
    body.position.set(0, 0.65, 0);
    group.add(body);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xc8c8c0 });
    head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.5), headMat);
    head.position.set(0, 0.75, -0.75);
    group.add(head);

    const legGeo = new THREE.BoxGeometry(0.22, 0.5, 0.22);
    legGeo.translate(0, -0.25, 0);
    for(let dx of [-0.32, 0.32]) for(let dz of [-0.45, 0.45]){
      const leg = new THREE.Mesh(legGeo, headMat);
      leg.position.set(dx, 0.5, dz);
      group.add(leg);
      legs.push(leg);
    }
  } else if(type === "zombie"){
    body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.35), mat);
    body.position.set(0, 1.075, 0);
    group.add(body);
    head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
    head.position.set(0, 1.7, 0);
    group.add(head);

    const armGeo = new THREE.BoxGeometry(0.22, 0.65, 0.22);
    armGeo.translate(0, -0.325, 0);
    for(let dx of [-0.42, 0.42]){
      const arm = new THREE.Mesh(armGeo, mat);
      arm.position.set(dx, 1.4, 0);
      arm.rotation.x = -Math.PI / 2.2;
      group.add(arm);
      arms.push(arm);
    }

    const legGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);
    legGeo.translate(0, -0.35, 0);
    for(let dx of [-0.18, 0.18]){
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(dx, 0.7, 0);
      group.add(leg);
      legs.push(leg);
    }
  } else if(type === "creeper"){
    body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.35), mat);
    body.position.set(0, 0.8, 0);
    group.add(body);
    head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), mat);
    head.position.set(0, 1.475, 0);
    group.add(head);

    const legGeo = new THREE.BoxGeometry(0.22, 0.4, 0.22);
    legGeo.translate(0, -0.2, 0);
    for(let dx of [-0.2, 0.2]) for(let dz of [-0.2, 0.2]){
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(dx, 0.4, dz);
      group.add(leg);
      legs.push(leg);
    }
  } else if(type === "skeleton"){
    body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.75, 0.25), mat);
    body.position.set(0, 1.075, 0);
    group.add(body);
    head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat);
    head.position.set(0, 1.7, 0);
    group.add(head);

    const armGeo = new THREE.BoxGeometry(0.12, 0.65, 0.12);
    armGeo.translate(0, -0.325, 0);
    for(let dx of [-0.32, 0.32]){
      const arm = new THREE.Mesh(armGeo, mat);
      arm.position.set(dx, 1.4, 0);
      arm.rotation.x = -Math.PI / 3;
      group.add(arm);
      arms.push(arm);
    }
    const bowMat = new THREE.MeshLambertMaterial({ color: 0x9a7b4a });
    const bowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.08), bowMat);
    bowMesh.position.set(0.35, 1.0, -0.4);
    group.add(bowMesh);

    const legGeo = new THREE.BoxGeometry(0.14, 0.7, 0.14);
    legGeo.translate(0, -0.35, 0);
    for(let dx of [-0.14, 0.14]){
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(dx, 0.7, 0);
      group.add(leg);
      legs.push(leg);
    }
  } else if(type === "spider"){
    body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.1), mat);
    body.position.set(0, 0.35, 0.35);
    group.add(body);
    const thorax = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.5, 0.65), mat);
    thorax.position.set(0, 0.35, -0.3);
    group.add(thorax);
    head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.45), mat);
    head.position.set(0, 0.38, -0.72);
    group.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    for (let ex of [-0.16, 0.16]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), eyeMat);
      eye.position.set(ex, 0.42, -0.95);
      group.add(eye);
    }

    const legMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (let side of [-1, 1]) {
      for (let li = 0; li < 4; li++) {
        const legGrp = new THREE.Group();
        legGrp.position.set(side * 0.45, 0.25, -0.45 + li * 0.32);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.45), legMat);
        upper.rotation.z = side * -0.7;
        upper.position.set(side * 0.22, 0.1, 0);
        legGrp.add(upper);
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.42), legMat);
        lower.rotation.z = side * 0.5;
        lower.position.set(side * 0.48, -0.14, 0);
        legGrp.add(lower);
        group.add(legGrp);
        legs.push(legGrp);
      }
    }
  }

  group.userData = { legs, arms, head, body };
  return group;
}

export function mobCollides(m, px, py, pz){
  const hw = m.def.w / 2, h = m.def.h;
  const minX = Math.floor(px - hw + 1e-5), maxX = Math.floor(px + hw - 1e-5);
  const minY = Math.floor(py + 1e-5),    maxY = Math.floor(py + h - 1e-5);
  const minZ = Math.floor(pz - hw + 1e-5), maxZ = Math.floor(pz + hw - 1e-5);
  for(let x = minX; x <= maxX; x++)
  for(let y = minY; y <= maxY; y++)
  for(let z = minZ; z <= maxZ; z++){
    if(collisionSolid(x, y, z)) return true;
  }
  return false;
}

const MAX_STEP = 0.35;
export function mobMoveAxis(m, axis, amt){
  if(!isFinite(amt) || Math.abs(amt) < 1e-5) return;
  let remaining = amt;
  let maxTries = 50;
  while(Math.abs(remaining) > 1e-5 && maxTries-- > 0){
    const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, remaining));
    remaining -= step;
    if(axis === "x"){
      if(!mobCollides(m, m.pos.x + step, m.pos.y, m.pos.z)) m.pos.x += step;
      else { m.vel.x = 0; m.hitWall = true; break; }
    } else if(axis === "y"){
      if(!mobCollides(m, m.pos.x, m.pos.y + step, m.pos.z)){
        m.pos.y += step;
      } else {
        if(step < 0) m.onGround = true;
        m.vel.y = 0;
        break;
      }
    } else {
      if(!mobCollides(m, m.pos.x, m.pos.y, m.pos.z + step)) m.pos.z += step;
      else { m.vel.z = 0; m.hitWall = true; break; }
    }
  }
}

// ---- Alert nearby zombies to player position -----------------------------------
function alertNearbyZombies(alerter) {
  for (const m of game.mobs) {
    if (m === alerter) continue;
    if (m.type !== 'zombie') continue;
    const dist = m.pos.distanceTo(alerter.pos);
    if (dist < 12) {
      m.alerted = true;
      m.alertCooldown = 8; // stay alerted for 8s
    }
  }
}

export function emitSoundEvent(x, y, z, loudness = 12) {
  if (!Array.isArray(game.mobs)) return;
  const soundPos = new THREE.Vector3(x, y, z);
  for (const m of game.mobs) {
    if (!m || !m.def?.hostile) continue;
    const dist = m.pos.distanceTo(soundPos);
    if (dist <= loudness) {
      m.heardSoundTarget = soundPos.clone();
      m.soundInvestigateTimer = 6.0;
      m.alerted = true;
      m.alertCooldown = 6.0;
    }
  }
}

export function tryFeedAnimal() {
  const heldId = hotbar ? hotbar[game.selected] : 0;
  const isFood = (heldId === 136 || heldId === 138 || heldId === 135 || heldId === 149);
  if (!isFood) return false;

  const o = eyePos(), d = lookDir();
  let best = null, bestT = 4.0;
  for (const m of game.mobs) {
    if (!m || m.isBaby || m.def?.hostile) continue;
    if (m.type === 'pig' && !(heldId === 136 || heldId === 138 || heldId === 135)) continue;
    if (m.type === 'sheep' && !(heldId === 136 || heldId === 138 || heldId === 149)) continue;
    const cx = m.pos.x, cy = m.pos.y + m.def.h / 2, cz = m.pos.z;
    const toM = new THREE.Vector3(cx - o.x, cy - o.y, cz - o.z);
    const t = toM.dot(d);
    if (t < 0 || t > bestT) continue;
    const closest = new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
    const distHoriz = Math.hypot(closest.x - cx, closest.z - cz);
    const distVert = Math.abs(closest.y - cy);
    if (distHoriz < m.def.w / 2 + 0.3 && distVert < m.def.h / 2 + 0.4) {
      best = m;
      bestT = t;
    }
  }
  if (!best) return false;

  if ((best.breedCooldown || 0) > 0) {
    toast(`⏳ ${best.def.name} cannot breed yet!`);
    return true;
  }
  if ((best.loveTimer || 0) > 0) {
    toast(`❤️ ${best.def.name} is already in Love Mode!`);
    return true;
  }

  if (removeItem(heldId, 1)) {
    best.loveTimer = 20.0;
    playSheepSound();
    toast(`❤️ Fed ${best.def.name}! Entered Love Mode!`);
    return true;
  }
  return false;
}

export function spawnMob(type, x, y, z, isBaby = false, parent = null){
  if (!MOB_TYPES[type]) return null;
  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null;
  if (game.mobs.length >= MAX_MOBS) return null;
  const def = { ...MOB_TYPES[type] };
  const mesh = makeMobMesh(type);
  mesh.position.set(x, y, z);
  const spawnYaw = Math.random() * Math.PI * 2;
  mesh.rotation.y = spawnYaw;
  if (isBaby && mesh) {
    mesh.scale.set(0.5, 0.5, 0.5);
  }
  
  const mob = {
    type, def, mesh,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    yaw: spawnYaw,
    hp: isBaby ? Math.ceil(def.hp / 2) : def.hp,
    onGround: false,
    wanderTimer: 0,
    fuseTimer: 0,
    attackCd: 0,
    hurtFlash: 0,
    shootCd: 0,
    animPhase: Math.random() * 100,
    nextVoiceTime: performance.now() + 10000 + Math.random() * 15000,
    hitWall: false,
    // LOS & aggro
    hasLOS: false,
    losTimer: 0,
    alerted: false,
    alertCooldown: 0,
    // Breeding & Growth
    isBaby,
    growTimer: isBaby ? 120 : 0,
    loveTimer: 0,
    breedCooldown: 0,
    parent,
    panicThreatPos: null,
    panicTimer: 0,
    // Hearing AI
    heardSoundTarget: null,
    soundInvestigateTimer: 0,
    // A* pathfinding
    path: [],
    pathTimer: 0,
    pathIndex: 0,
    // strafe
    strafeDir: 0,
    strafeSwitchTimer: 0,
    // climb (spider)
    climbing: false,
    climbY: 0,
    // Advanced Hostile Mob AI
    shadeTarget: null,
    shadeSearchTimer: 0,
    flankAngleOffset: (Math.random() - 0.5) * 1.3,
    isStealthAmbush: false,
    dodgeCd: 0,
    webSpinCd: 0,
    webTrapTimer: 0,
    webTrapPos: null,
    // Advanced Passive Animal AI
    grazeTimer: 10 + Math.random() * 15,
    isGrazing: false,
    grazeDuration: 0,
    sleeping: false,
    isBathing: false,
    bathTarget: null,
    bathTimer: 15 + Math.random() * 20,
    bathDuration: 0,
  };
  game.mobs.push(mob);
  return mob;
}

export function trySpawnMobs(){
  if(game.mobs.length >= MAX_MOBS) return;
  const isNight = game.timeOfDay < 0.22 || game.timeOfDay > 0.78;
  const passiveTypes = ["pig", "sheep"];
  const hostileTypes = ["zombie", "creeper", "skeleton", "spider"];
  
  let type;
  if(isNight){
    type = Math.random() < 0.75
      ? hostileTypes[Math.floor(Math.random() * hostileTypes.length)]
      : passiveTypes[Math.floor(Math.random() * passiveTypes.length)];
  } else {
    // Spiders also spawn in daylight (unlike zombies/skeletons)
    if (Math.random() < 0.1) {
      type = "spider";
    } else {
      type = passiveTypes[Math.floor(Math.random() * passiveTypes.length)];
    }
  }
  
  const angle = Math.random() * Math.PI * 2;
  const dist = 10 + Math.random() * 20;
  const sx = Math.floor(player.pos.x + Math.cos(angle) * dist);
  const sz = Math.floor(player.pos.z + Math.sin(angle) * dist);
  
  let topY = 0;
  for(let y = HEIGHT - 1; y >= 1; y--){
    const b = getBlock(sx, y, sz);
    if(isSolid(b) && b !== 6){
      topY = y + 1;
      break;
    }
  }
  if(topY === 0 || topY >= HEIGHT - 2) return;

  // Hardened terrain verification: ensure surface under feet is solid and head clearance is open
  if (!isSolid(getBlock(sx, topY - 1, sz))) return;
  if (isSolid(getBlock(sx, topY, sz)) || isSolid(getBlock(sx, topY + 1, sz))) return;
  
  spawnMob(type, sx + 0.5, topY + 0.1, sz + 0.5);
}

export function updateMobs(dt){
  dt = Math.min(dt, 0.1);
  mobSpawnTimer += dt;
  const spawnInterval = game.mobs.length < 8 ? 0.8 : 3.5;
  if(mobSpawnTimer >= spawnInterval){
    mobSpawnTimer = 0;
    trySpawnMobs();
  }
  
  const now = performance.now();
  const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
  const playerEye = new THREE.Vector3(px, py + 1.6, pz);
  // Cache player velocity for skeleton predictive aim
  const pvx = player.vel?.x || 0, pvz = player.vel?.z || 0;
  
  for(let i = game.mobs.length - 1; i >= 0; i--){
    const m = game.mobs[i];
    
    // Hurt flash
    if(m.hurtFlash > 0){
      m.hurtFlash -= dt;
      if(m.hurtFlash <= 0){
        m.mesh.traverse(child => {
          if(child.material && child.material.emissive) child.material.emissive.setRGB(0, 0, 0);
        });
      }
    }
    
    // Despawn far mobs
    const distToP = m.pos.distanceTo(player.pos);
    if(distToP > 64 || (distToP > 36 && Math.random() < dt * 0.05)){
      removeMob(i);
      continue;
    }
    
    if (m.attackCd > 0) m.attackCd -= dt;
    if (m.alertCooldown > 0) m.alertCooldown -= dt;
    if (m.alertCooldown <= 0) m.alerted = false;
    if (m.soundInvestigateTimer > 0) m.soundInvestigateTimer -= dt;
    
    // Ground check
    if(m.vel.y === 0 && mobCollides(m, m.pos.x, m.pos.y - 0.05, m.pos.z)){
      m.onGround = true;
    }
    
    // ── Line-of-Sight update (every 0.25s) ───────────────────────────────────
    m.losTimer = (m.losTimer || 0) + dt;
    if (m.losTimer >= 0.25) {
      m.losTimer = 0;
      const mobEyeH = m.def.h * 0.85;
      const mobEyePos = new THREE.Vector3(m.pos.x, m.pos.y + mobEyeH, m.pos.z);
      m.hasLOS = hasLineOfSight(mobEyePos, playerEye, 20);
      
      // Group alert: zombie sees player → alert nearby zombies
      if (m.hasLOS && m.def.hostile && m.type === 'zombie') {
        alertNearbyZombies(m);
      }
    }
    
    const maxAggroDist = m.alerted ? 28 : 18;
    const canAggro = m.def.hostile && distToP < maxAggroDist && !player.dead && (m.hasLOS || m.alerted);
    const isInvestigatingSound = m.def.hostile && !canAggro && m.soundInvestigateTimer > 0 && m.heardSoundTarget;
    
    let wishX = 0, wishZ = 0;
    
    // ── Spider wall climbing ──────────────────────────────────────────────────
    if (m.type === 'spider' && canAggro) {
      // Check if there's a wall block directly ahead
      const fwdX = -Math.sin(m.yaw), fwdZ = -Math.cos(m.yaw);
      const wallX = Math.floor(m.pos.x + fwdX * 0.6);
      const wallY = Math.floor(m.pos.y + 0.5);
      const wallZ = Math.floor(m.pos.z + fwdZ * 0.6);
      const wallBlock = getBlock(wallX, wallY, wallZ);
      const wallAbove = getBlock(wallX, wallY + 1, wallZ);
      if (isSolid(wallBlock) || isSolid(wallAbove)) {
        // Start climbing: override gravity
        m.climbing = true;
      } else {
        m.climbing = false;
      }
      // Spider leaps at the player when close enough and airborne
      if (m.onGround && distToP < 4 && Math.random() < dt * 2.5) {
        const dx = px - m.pos.x, dz = pz - m.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        m.vel.x = (dx / len) * 6;
        m.vel.z = (dz / len) * 6;
        m.vel.y = 8;
        m.onGround = false;
      }
    } else {
      m.climbing = false;
    }
    
    // ── A* Pathfinding (update path every 1.5s for hostile mobs) ─────────────
    m.pathTimer = (m.pathTimer || 0) + dt;
    const pathInterval = distToP < 8 ? 0.8 : 1.5;
    
    if (canAggro && m.pathTimer >= pathInterval) {
      m.pathTimer = 0;
      // Only compute path when direct line is blocked or mob is stuck
      if (!m.hasLOS || m.hitWall) {
        const start = { x: m.pos.x, y: m.pos.y, z: m.pos.z };
        const target = { x: px, y: py, z: pz };
        const maxExp = distToP < 12 ? 200 : 100;
        m.path = findPath(start, target, maxExp);
        m.pathIndex = 1; // skip current cell
      } else {
        m.path = []; // direct chase when LOS is clear
      }
    }
    
    // ── Movement computation ──────────────────────────────────────────────────
    if (canAggro) {
      const dx = px - m.pos.x, dz = pz - m.pos.z;
      const rawYaw = Math.atan2(-dx, -dz);

      // ── Flanking & Encircling Swarms AI ──────────────────────────────────
      if (distToP < 10 && distToP > 1.8) {
        m.yaw = rawYaw + (m.flankAngleOffset || 0);
      } else {
        m.yaw = rawYaw;
      }
      
      // ── Creeper Stealth & Ambush AI ────────────────────────────────────────
      if (m.type === 'creeper') {
        const toCreeperX = m.pos.x - px, toCreeperZ = m.pos.z - pz;
        const cLen = Math.hypot(toCreeperX, toCreeperZ) || 1;
        const lookD = lookDir();
        const lookDot = (lookD.x * (toCreeperX / cLen)) + (lookD.z * (toCreeperZ / cLen));
        if (lookDot < -0.25) {
          m.isStealthAmbush = true;
        } else {
          m.isStealthAmbush = false;
        }
      }

      // ── Skeleton Tactical Jump-Dodge AI ────────────────────────────────────
      if (m.type === 'skeleton') {
        m.dodgeCd = (m.dodgeCd || 0) - dt;
        const toSkX = m.pos.x - px, toSkZ = m.pos.z - pz;
        const skLen = Math.hypot(toSkX, toSkZ) || 1;
        const lookD = lookDir();
        const aimDot = (lookD.x * (toSkX / skLen)) + (lookD.z * (toSkZ / skLen));
        if (aimDot > 0.85 && distToP < 12 && m.onGround && m.dodgeCd <= 0) {
          m.dodgeCd = 3.5;
          m.vel.y = 6.2;
          m.onGround = false;
          m.strafeDir = Math.random() < 0.5 ? 1 : -1;
          toast("💀 Skeleton dodged your line of sight!");
        }
      }

      // ── Spider Cobweb Trap Spinning AI ─────────────────────────────────────
      if (m.type === 'spider') {
        m.webSpinCd = (m.webSpinCd || 0) - dt;
        if (m.webSpinCd <= 0 && distToP < 5.0 && m.onGround) {
          m.webSpinCd = 8.5;
          m.webTrapTimer = 4.0;
          m.webTrapPos = m.pos.clone();
          spawnBreakBurst(m.pos.x, m.pos.y + 0.2, m.pos.z, 50); // web wool particles
          toast("🕸️ Spider spun a sticky cobweb trap!");
        }
      }
      
      // Water-aware: hostile mobs avoid water >2 blocks deep (except spiders)
      if (m.type !== 'spider') {
        const aheadX = m.pos.x + (-Math.sin(m.yaw)) * 0.8;
        const aheadZ = m.pos.z + (-Math.cos(m.yaw)) * 0.8;
        if (waterDepthAt(aheadX, aheadZ) > 2) {
          // Steer around — pick a perpendicular direction
          m.yaw += Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
        }
      }
      
      // Use path waypoint if we have a computed path
      if (m.path && m.path.length > 1 && m.pathIndex < m.path.length) {
        const wp = m.path[m.pathIndex];
        const wpDx = (wp.x + 0.5) - m.pos.x;
        const wpDz = (wp.z + 0.5) - m.pos.z;
        const wpDist = Math.hypot(wpDx, wpDz);
        if (wpDist < 0.6) {
          m.pathIndex++;
        } else {
          m.yaw = Math.atan2(-wpDx, -wpDz);
        }
      }
      
      // ── Strafe logic (zombie & skeleton) ─────────────────────────────────
      if (m.type === 'zombie' || m.type === 'skeleton') {
        m.strafeSwitchTimer = (m.strafeSwitchTimer || 0) - dt;
        if (m.strafeSwitchTimer <= 0) {
          m.strafeDir = Math.random() < 0.5 ? 1 : -1;
          m.strafeSwitchTimer = 1.2 + Math.random() * 1.4;
        }
        const strafeYaw = m.yaw + Math.PI / 2 * m.strafeDir;
        const strafeWeight = m.type === 'skeleton' ? 0.6 : 0.3; // skeletons strafe more
        const fwdX = -Math.sin(m.yaw), fwdZ = -Math.cos(m.yaw);
        const sfX = -Math.sin(strafeYaw), sfZ = -Math.cos(strafeYaw);
        wishX = fwdX * (1 - strafeWeight) + sfX * strafeWeight;
        wishZ = fwdZ * (1 - strafeWeight) + sfZ * strafeWeight;
        const wl = Math.hypot(wishX, wishZ) || 1;
        wishX /= wl; wishZ /= wl;
      } else if (m.type === 'skeleton' && distToP < 8.0) {
        // Skeleton tries to back up when too close
        const backX = Math.sin(m.yaw), backZ = Math.cos(m.yaw);
        const testX = m.pos.x + backX * 0.5;
        const testZ = m.pos.z + backZ * 0.5;
        if (!mobCollides(m, testX, m.pos.y, testZ)) {
          wishX = backX; wishZ = backZ;
        } else {
          wishX = Math.cos(m.yaw); wishZ = -Math.sin(m.yaw);
        }
      } else {
        wishX = -Math.sin(m.yaw);
        wishZ = -Math.cos(m.yaw);
      }
    } else if (isInvestigatingSound) {
      // ── Hearing & Sound Investigation Navigation ──────────────────────────
      const soundDist = m.pos.distanceTo(m.heardSoundTarget);
      if (soundDist < 1.5) {
        m.soundInvestigateTimer = 0;
        m.heardSoundTarget = null;
      } else {
        const sdx = m.heardSoundTarget.x - m.pos.x;
        const sdz = m.heardSoundTarget.z - m.pos.z;
        m.yaw = Math.atan2(-sdx, -sdz);
        wishX = -Math.sin(m.yaw);
        wishZ = -Math.cos(m.yaw);
      }
    } else {
      // ── Passive Animal AI (Food Temptation, Herd Instinct & Panic Fleeing & Love Mode & Mating) ───
      const heldId = hotbar ? hotbar[game.selected] : 0;
      const isFood = (
        (m.type === 'pig' && (heldId === 136 || heldId === 138 || heldId === 135)) ||
        (m.type === 'sheep' && (heldId === 136 || heldId === 138 || heldId === 149))
      );

      // Growth update for baby animals
      if (m.isBaby) {
        m.growTimer -= dt;
        if (m.growTimer <= 0) {
          m.isBaby = false;
          if (m.mesh) m.mesh.scale.set(1.0, 1.0, 1.0);
          toast(`🎉 A baby ${m.def.name} grew into an adult!`);
        }
      }
      if ((m.breedCooldown || 0) > 0) m.breedCooldown -= dt;

      // Love Mode & Mating Search
      let isBreedingTarget = false;
      if ((m.loveTimer || 0) > 0) {
        m.loveTimer -= dt;
        if (m.mesh) {
          m.mesh.traverse(child => {
            if (child.material && child.material.emissive) {
              const pulse = (Math.sin(performance.now() * 0.01) + 1) * 0.25;
              child.material.emissive.setRGB(pulse, 0, pulse * 0.5);
            }
          });
        }
        let mate = null;
        if (Array.isArray(game.mobs)) {
          for (const other of game.mobs) {
            if (other !== m && other.type === m.type && (other.loveTimer || 0) > 0 && !other.isBaby) {
              if (m.pos.distanceTo(other.pos) < 12.0) { mate = other; break; }
            }
          }
        }
        if (mate) {
          isBreedingTarget = true;
          const mateDx = mate.pos.x - m.pos.x;
          const mateDz = mate.pos.z - m.pos.z;
          const mateDist = Math.hypot(mateDx, mateDz);
          m.yaw = Math.atan2(-mateDx, -mateDz);
          wishX = -Math.sin(m.yaw) * 1.2;
          wishZ = -Math.cos(m.yaw) * 1.2;

          if (mateDist < 1.4) {
            m.loveTimer = 0;
            mate.loveTimer = 0;
            m.breedCooldown = 180;
            mate.breedCooldown = 180;

            [m, mate].forEach(parentMob => {
              if (parentMob.mesh) {
                parentMob.mesh.traverse(c => {
                  if (c.material && c.material.emissive) c.material.emissive.setRGB(0, 0, 0);
                });
              }
            });

            const babyX = (m.pos.x + mate.pos.x) / 2;
            const babyY = (m.pos.y + mate.pos.y) / 2;
            const babyZ = (m.pos.z + mate.pos.z) / 2;
            spawnMob(m.type, babyX, babyY, babyZ, true, m);
            spawnXpOrbs(babyX, babyY + 0.5, babyZ, 4);
            toast(`✨ A baby ${m.def.name} was born! ❤️`);
          }
        }
      } else if (m.hurtFlash <= 0 && (!m.fuseTimer || m.fuseTimer <= 0)) {
        if (m.mesh) {
          m.mesh.traverse(c => {
            if (c.material && c.material.emissive) c.material.emissive.setRGB(0, 0, 0);
          });
        }
      }

      // ── Startle Response to Player Sprinting ───────────────────────────────
      const pSpeed = Math.hypot(player.vel?.x || 0, player.vel?.z || 0);
      if (pSpeed > 4.5 && distToP < 6.0 && !isFood && (m.panicTimer || 0) <= 0) {
        m.panicTimer = 2.2;
        m.panicThreatPos = player.pos.clone();
        toast(`🐗 ${m.def.name} was startled by your sprinting!`);
      }

      // ── Maternal Protection (Herd Defense) ─────────────────────────────────
      if (m.isBaby && (m.panicTimer || 0) > 0 && Array.isArray(game.mobs)) {
        for (const parentMob of game.mobs) {
          if (parentMob !== m && parentMob.type === m.type && !parentMob.isBaby && (parentMob.panicTimer || 0) <= 0) {
            if (parentMob.pos.distanceTo(m.pos) < 10.0) {
              parentMob.panicTimer = 3.0;
              parentMob.panicThreatPos = m.panicThreatPos || player.pos;
            }
          }
        }
      }

      // ── Sheep Grazing & Wool Regrowth ──────────────────────────────────────
      if (m.type === 'sheep' && !isBreedingTarget && (m.panicTimer || 0) <= 0) {
        m.grazeTimer = (m.grazeTimer || 0) - dt;
        if (m.isGrazing) {
          m.grazeDuration -= dt;
          wishX = 0; wishZ = 0;
          if (m.grazeDuration <= 0) {
            m.isGrazing = false;
            const gx = Math.floor(m.pos.x), gy = Math.floor(m.pos.y - 0.4), gz = Math.floor(m.pos.z);
            if (getBlock(gx, gy, gz) === 2) {
              setBlock(gx, gy, gz, 3, false, scheduleSave); // Grass -> Dirt
              spawnBreakBurst(m.pos.x, m.pos.y - 0.3, m.pos.z, 2);
              if (m.isBaby) m.growTimer = Math.max(0, m.growTimer - 15);
              playSheepSound();
            }
          }
        } else if (m.grazeTimer <= 0 && m.onGround) {
          const gx = Math.floor(m.pos.x), gy = Math.floor(m.pos.y - 0.4), gz = Math.floor(m.pos.z);
          if (getBlock(gx, gy, gz) === 2) {
            m.isGrazing = true;
            m.grazeDuration = 1.8;
            m.grazeTimer = 15.0 + Math.random() * 12.0;
          }
        }
      }

      // ── Pig Mud & Water Bathing ───────────────────────────────────────────
      if (m.type === 'pig' && !isBreedingTarget && (m.panicTimer || 0) <= 0) {
        m.bathTimer = (m.bathTimer || 0) - dt;
        if (m.bathTimer <= 0 && !m.bathTarget) {
          m.bathTimer = 25.0;
          m.bathTarget = findNearbyWaterOrDirt(m.pos.x, m.pos.y, m.pos.z, 8);
        }
        if (m.bathTarget) {
          const bDist = m.pos.distanceTo(m.bathTarget);
          if (bDist < 1.2) {
            m.isBathing = true;
            m.bathDuration = 4.0;
            m.bathTarget = null;
          } else if (bDist < 8.0) {
            const bdx = m.bathTarget.x - m.pos.x, bdz = m.bathTarget.z - m.pos.z;
            m.yaw = Math.atan2(-bdx, -bdz);
            wishX = -Math.sin(m.yaw) * 0.9;
            wishZ = -Math.cos(m.yaw) * 0.9;
          }
        }
        if (m.isBathing) {
          m.bathDuration -= dt;
          wishX = 0; wishZ = 0;
          if (m.bathDuration <= 0) m.isBathing = false;
        }
      }

      // ── Nighttime Resting & Sleeping AI ───────────────────────────────────
      const isNightTime = (game.timeOfDay < 0.22 || game.timeOfDay > 0.78);
      if (isNightTime && !isBreedingTarget && (m.panicTimer || 0) <= 0 && !isFood) {
        m.sleeping = true;
        wishX = 0; wishZ = 0;
      } else {
        m.sleeping = false;
      }

      // Predator Detection (Flee from monsters!)
      let predatorDetected = false;
      if (!isBreedingTarget) {
        let nearestPredator = null, minPredDist = 9.0;
        if (Array.isArray(game.mobs)) {
          for (const other of game.mobs) {
            if (other.def?.hostile) {
              const d = m.pos.distanceTo(other.pos);
              if (d < minPredDist) { minPredDist = d; nearestPredator = other; }
            }
          }
        }
        if (nearestPredator) {
          predatorDetected = true;
          m.panicTimer = 3.0;
          m.panicThreatPos = nearestPredator.pos.clone();
        }
      }

      if (!isBreedingTarget && !m.sleeping && !m.isGrazing && !m.isBathing) {
        if ((m.panicTimer || 0) > 0) {
          m.panicTimer -= dt;
          const threatPos = m.panicThreatPos || player.pos;
          const fleeDx = m.pos.x - threatPos.x;
          const fleeDz = m.pos.z - threatPos.z;
          m.yaw = Math.atan2(-fleeDx, -fleeDz);
          wishX = -Math.sin(m.yaw) * 1.8;
          wishZ = -Math.cos(m.yaw) * 1.8;
        } else if (m.isBaby && m.parent && m.parent.mesh && game.mobs.includes(m.parent)) {
          // Baby animal follows parent everywhere!
          const pDist = m.pos.distanceTo(m.parent.pos);
          if (pDist > 2.2) {
            const pdx = m.parent.pos.x - m.pos.x;
            const pdz = m.parent.pos.z - m.pos.z;
            m.yaw = Math.atan2(-pdx, -pdz);
            wishX = -Math.sin(m.yaw) * 1.3;
            wishZ = -Math.cos(m.yaw) * 1.3;
          }
        } else if (isFood && distToP < 10.0) {
          const dx = px - m.pos.x;
          const dz = pz - m.pos.z;
          m.yaw = Math.atan2(-dx, -dz);
          if (distToP > 1.8) {
            wishX = -Math.sin(m.yaw) * 0.9;
            wishZ = -Math.cos(m.yaw) * 0.9;
          }
        } else {
          let herdDx = 0, herdDz = 0, herdCount = 0;
          if (Array.isArray(game.mobs)) {
            for (const other of game.mobs) {
              if (other !== m && other.type === m.type && other.pos.distanceTo(m.pos) < 6.0) {
                herdDx += other.pos.x - m.pos.x;
                herdDz += other.pos.z - m.pos.z;
                herdCount++;
              }
            }
          }

          m.wanderTimer -= dt;
          if(m.wanderTimer <= 0){
            m.wanderTimer = 2.5 + Math.random() * 3.5;
            if (herdCount > 0 && Math.random() < 0.5) {
              m.yaw = Math.atan2(-herdDx, -herdDz);
            } else if(Math.random() < 0.65){
              let attempts = 0;
              do {
                m.yaw = Math.random() * Math.PI * 2;
                const nx = m.pos.x + (-Math.sin(m.yaw)) * 1.5;
                const nz = m.pos.z + (-Math.cos(m.yaw)) * 1.5;
                if (waterDepthAt(nx, nz) <= 1) break;
                attempts++;
              } while (attempts < 4);
            } else {
              m.yaw = null; // idle
            }
          }
          if(m.yaw !== null && m.yaw !== undefined){
            wishX = -Math.sin(m.yaw);
            wishZ = -Math.cos(m.yaw);
          }
        }
      }
    }
    
    // ── Skeleton predictive shooting ─────────────────────────────────────────
    if (m.type === "skeleton" && canAggro && distToP < 18) {
      m.shootCd = (m.shootCd || 2.0) - dt;
      if (m.shootCd <= 0) {
        m.shootCd = 2.2 + Math.random() * 0.8;
        const mobEye = m.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        // Lead the target: estimate where player will be based on their velocity
        const arrowSpeed = 18;
        const travelTime = distToP / arrowSpeed;
        const predictedTarget = new THREE.Vector3(
          px + pvx * travelTime,
          py + 1.0,
          pz + pvz * travelTime
        );
        const spread = new THREE.Vector3(
          (Math.random() - 0.5) * 0.08,
          (Math.random() - 0.5) * 0.06,
          (Math.random() - 0.5) * 0.08
        );
        const arrDir = predictedTarget.sub(mobEye).normalize().add(spread).normalize();
        const spawnPos = mobEye.clone().add(arrDir.clone().multiplyScalar(0.6));
        spawnProjectile(spawnPos.x, spawnPos.y, spawnPos.z, arrDir, arrowSpeed, false);
      }
    }

    // ── Jump over obstacles ───────────────────────────────────────────────────
    m.jumpCd = (m.jumpCd || 0) - dt;
    m.hitWall = false;
    if(m.onGround && m.jumpCd <= 0 && (wishX !== 0 || wishZ !== 0)){
      const aheadX = m.pos.x + wishX * 0.4;
      const aheadZ = m.pos.z + wishZ * 0.4;
      if(mobCollides(m, aheadX, m.pos.y, aheadZ)){
        m.vel.y = m.type === 'spider' ? 9 : 7.5; // spiders jump higher
        m.onGround = false;
        m.jumpCd = 0.6;
      }
    }
    
    // Stealth Creeper speed multiplier & Spider web trap slow down
    let currentSpeed = m.def.speed;
    if (m.isStealthAmbush) currentSpeed *= 0.7;
    
    // Check if player is trapped in active spider web trap
    if (m.webTrapTimer > 0 && m.webTrapPos) {
      m.webTrapTimer -= dt;
      if (player.pos.distanceTo(m.webTrapPos) < 2.0) {
        player.vel.x *= 0.65;
        player.vel.z *= 0.65;
      }
    }

    m.vel.x = wishX * currentSpeed;
    m.vel.z = wishZ * currentSpeed;
    
    // Gravity / climbing
    if (m.climbing) {
      // Spider climbs up toward player or wall surface
      const climbDir = py > m.pos.y ? 1 : -1;
      m.vel.y = climbDir * m.def.speed * 0.7;
    } else {
      m.vel.y += GRAV * dt;
      if(m.vel.y < -35) m.vel.y = -35;
    }
    
    // Swimming (hostile mobs float in water)
    const inWater = getBlock(Math.floor(m.pos.x), Math.floor(m.pos.y), Math.floor(m.pos.z)) === 8;
    if (inWater && m.def.hostile) {
      m.vel.y = Math.max(m.vel.y, 3.0); // float upward
    }
    
    mobMoveAxis(m, "x", m.vel.x * dt);
    mobMoveAxis(m, "z", m.vel.z * dt);
    mobMoveAxis(m, "y", m.vel.y * dt);
    
    if (m.mesh) {
      m.mesh.position.copy(m.pos);
      if (typeof m.yaw === 'number' && !isNaN(m.yaw)) {
        let diff = m.yaw - m.mesh.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        m.mesh.rotation.y += diff * Math.min(1.0, dt * 10.0);
      }
    }
    // ── 3D Articulated Limb Animations & Spider Wall Climbing Pitch ─────────────
    const ud = m.mesh.userData || {};
    const isMoving = (wishX !== 0 || wishZ !== 0);

    if (m.type === 'spider' && m.climbing) {
      // Spider wall climbing pitch tilt
      m.mesh.rotation.x = -Math.PI / 2.5;
    } else {
      m.mesh.rotation.x = 0;
    }

    if (isMoving || m.climbing) {
      const animSpeed = m.climbing ? 12.0 : (m.def.speed * 3.5);
      m.animPhase += dt * animSpeed;
      const bob = Math.sin(m.animPhase * 2) * 0.04;
      m.mesh.position.y += bob;

      // Leg swing animations
      if (Array.isArray(ud.legs) && ud.legs.length > 0) {
        if (m.type === 'spider') {
          // 8-leg scuttle motion
          ud.legs.forEach((legGrp, idx) => {
            const stepPhase = m.animPhase + (idx % 4) * 0.8;
            legGrp.rotation.x = Math.sin(stepPhase) * 0.35;
          });
        } else if (ud.legs.length === 4) {
          // Quadruped stride (Pigs, Sheep, Creepers)
          const swing = Math.sin(m.animPhase) * 0.60;
          ud.legs[0].rotation.x = swing;
          ud.legs[1].rotation.x = -swing;
          ud.legs[2].rotation.x = -swing;
          ud.legs[3].rotation.x = swing;
        } else if (ud.legs.length === 2) {
          // Biped stride (Zombies, Skeletons)
          const swing = Math.sin(m.animPhase) * 0.65;
          ud.legs[0].rotation.x = swing;
          ud.legs[1].rotation.x = -swing;

          if (Array.isArray(ud.arms) && ud.arms.length === 2 && m.type !== 'skeleton') {
            ud.arms[0].rotation.x = -Math.PI / 2.2 - swing * 0.25;
            ud.arms[1].rotation.x = -Math.PI / 2.2 + swing * 0.25;
          }
        }
      }
    } else {
      // Idle pose reset
      m.animPhase = 0;
      if (Array.isArray(ud.legs)) {
        ud.legs.forEach(leg => {
          leg.rotation.x += (0 - leg.rotation.x) * Math.min(1.0, dt * 8.0);
        });
      }
    }

    // ── Head Pitch/Yaw Articulation & Eye Contact (runs moving or idle) ──────
    if (ud.head) {
      let lookTarget = null;
      const heldId = hotbar ? hotbar[game.selected] : 0;
      const isHoldingFood = (
        (m.type === 'pig' && (heldId === 136 || heldId === 138 || heldId === 135)) ||
        (m.type === 'sheep' && (heldId === 136 || heldId === 138 || heldId === 149))
      );

      if (canAggro || (isHoldingFood && distToP < 10.0)) {
        lookTarget = playerEye;
      } else if (m.soundInvestigateTimer > 0 && m.heardSoundTarget) {
        lookTarget = m.heardSoundTarget;
      } else if (m.isBaby && m.parent && m.parent.pos) {
        lookTarget = m.parent.pos.clone().add(new THREE.Vector3(0, m.parent.def.h * 0.8, 0));
      }

      if (m.isGrazing) {
        ud.head.rotation.x = 0.75; // head down grazing
      } else if (m.sleeping) {
        ud.head.rotation.x = 0.45; // head lowered sleeping
      } else if (lookTarget) {
        const headWorldPos = new THREE.Vector3();
        ud.head.getWorldPosition(headWorldPos);
        const lookDx = lookTarget.x - headWorldPos.x;
        const lookDy = lookTarget.y - headWorldPos.y;
        const lookDz = lookTarget.z - headWorldPos.z;
        const horizDist = Math.hypot(lookDx, lookDz) || 1;

        const targetYaw = Math.atan2(-lookDx, -lookDz);
        let relYaw = targetYaw - (m.mesh ? m.mesh.rotation.y : 0);
        relYaw = Math.atan2(Math.sin(relYaw), Math.cos(relYaw));
        const clampedYaw = Math.max(-1.1, Math.min(1.1, relYaw));

        const targetPitch = -Math.atan2(lookDy, horizDist);
        const clampedPitch = Math.max(-0.7, Math.min(0.7, targetPitch));

        ud.head.rotation.y += (clampedYaw - ud.head.rotation.y) * Math.min(1.0, dt * 8.0);
        ud.head.rotation.x += (clampedPitch - ud.head.rotation.x) * Math.min(1.0, dt * 8.0);
      } else {
        ud.head.rotation.y += (0 - ud.head.rotation.y) * Math.min(1.0, dt * 5.0);
        ud.head.rotation.x += (Math.sin(now * 0.0015 + i) * 0.08 - ud.head.rotation.x) * Math.min(1.0, dt * 5.0);
      }
    }
    
    // ── Creeper fuse ─────────────────────────────────────────────────────────
    if(m.type === "creeper" && distToP < 3.2 && !player.dead){
      if(m.fuseTimer === 0) playHissSound();
      m.fuseTimer += dt;
      m.mesh.traverse(child => {
        if(child.material && child.material.emissive){
          const flash = Math.floor(now / 100) % 2 === 0 ? 0.6 : 0;
          child.material.emissive.setRGB(flash, flash, flash);
        }
      });
      if(m.fuseTimer >= 1.5){
        playExplodeSound();
        triggerWorldExplosion(m.pos.x, m.pos.y, m.pos.z, 3.5, scheduleSave);
        const curDist = m.pos.distanceTo(player.pos);
        if(curDist < 4.5){
          const dmg = Math.max(1, Math.ceil(24 * (1 - curDist / 4.5)));
          hurtPlayer(dmg, "creeper");
        }
        removeMob(i);
        continue;
      }
    } else if(m.type === "creeper" && m.fuseTimer > 0){
      m.fuseTimer = Math.max(0, m.fuseTimer - dt * 1.5);
      if(m.fuseTimer === 0) stopHissSound();
      m.mesh.traverse(child => {
        if(child.material && child.material.emissive) child.material.emissive.setRGB(0, 0, 0);
      });
    }
    
    // ── Zombie melee ─────────────────────────────────────────────────────────
    if(m.type === "zombie" && distToP < 1.4 && !player.dead && m.attackCd <= 0){
      m.attackCd = 1.0;
      hurtPlayer(m.def.dmg || 3, "zombie");
    }
    
    // ── Spider melee ─────────────────────────────────────────────────────────
    if(m.type === "spider" && distToP < 1.5 && !player.dead && m.attackCd <= 0){
      m.attackCd = 1.2;
      hurtPlayer(m.def.dmg || 2, "spider");
    }
    
    // ── Ambient sounds ───────────────────────────────────────────────────────
    if(now >= m.nextVoiceTime && distToP < 20){
      m.nextVoiceTime = now + 10000 + Math.random() * 15000;
      if(m.type === "pig") playPigSound();
      else if(m.type === "sheep") playSheepSound();
      else if(m.type === "zombie" || m.type === "skeleton" || m.type === "spider") playZombieSound();
    }

    // ── Undead sunburn ───────────────────────────────────────────────────────
    const isDaytime = game.timeOfDay >= 0.25 && game.timeOfDay <= 0.75;
    if(isDaytime && (m.type === "zombie" || m.type === "skeleton")){
      const mx = Math.floor(m.pos.x), my = Math.floor(m.pos.y + m.def.h), mz = Math.floor(m.pos.z);
      let exposed = true;
      for(let y = my; y < 128; y++){
        if(isSolid(getBlock(mx, y, mz))){ exposed = false; break; }
      }
      if(exposed){
        m.burnTimer = (m.burnTimer || 0) + dt;
        if(m.burnTimer >= 0.8){
          m.burnTimer = 0;
          m.hp -= 2;
          m.hurtFlash = 0.35;
          if(m.hp <= 0){
            if(m.def.drop && game.survival){
              spawnItemDrop(m.def.drop, m.def.dropN || 1, m.pos.x, m.pos.y + 0.5, m.pos.z);
              spawnXpOrbs(m.pos.x, m.pos.y + 0.5, m.pos.z, 3);
            }
            removeMob(i);
            continue;
          }
        }
      }
    }
  }
}

export function removeMob(i){
  const m = game.mobs[i];
  if(!m) return;
  if(m.type === "creeper" && m.fuseTimer > 0) stopHissSound();
  
  if(m.mesh){
    webgl.scene?.remove(m.mesh);
    const disposedGeos = new Set();
    const disposedMats = new Set();
    m.mesh.traverse(child => {
      if(child.geometry && !disposedGeos.has(child.geometry)){
        child.geometry.dispose();
        disposedGeos.add(child.geometry);
      }
      if(child.material){
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if(!disposedMats.has(mat)){ mat.dispose(); disposedMats.add(mat); }
        });
      }
    });
  }
  game.mobs.splice(i, 1);
}

export function attackMob(targetMob, customDamage){
  let best = targetMob;
  if(!best){
    const o = eyePos(), d = lookDir();
    let bestT = 4.0;
    for(const m of game.mobs){
      const cx = m.pos.x, cy = m.pos.y + m.def.h / 2, cz = m.pos.z;
      const toM = new THREE.Vector3(cx - o.x, cy - o.y, cz - o.z);
      const t = toM.dot(d);
      if(t < 0 || t > bestT) continue;
      const closest = new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
      const distHoriz = Math.hypot(closest.x - cx, closest.z - cz);
      const distVert = Math.abs(closest.y - cy);
      if(distHoriz < m.def.w / 2 + 0.25 && distVert < m.def.h / 2 + 0.3){ best = m; bestT = t; }
    }
  }
  if(!best) return false;
  
  const tool = heldTool();
  let dmg = customDamage !== undefined ? customDamage : 1;
  let isCrit = false;
  
  if (!customDamage && player.vel.y < -0.5 && !player.onGround && !player.flying) {
    isCrit = true;
  }

  if(!customDamage && tool){
    if(tool.tool === "sword") dmg = 3 + (tool.tier || 1) * 2;
    else if(tool.tool === "axe") dmg = 2 + (tool.tier || 1);
    else dmg = 1 + (tool.tier || 1);
    
    const id = tool.id;
    if(id){
      if(toolDurability[id] === undefined) toolDurability[id] = [30, 60, 150, 500][(tool.tier || 1) - 1] || 30;
      toolDurability[id] = Math.max(0, toolDurability[id] - 1);
    }
  }
  
  if(isCrit){
    dmg = Math.floor(dmg * 1.5);
    toast("CRITICAL HIT!");
  }

  best.hp -= dmg;
  best.hurtFlash = 0.2;
  playHitSound();

  if (best.type === 'zombie') {
    for (const other of game.mobs) {
      if (other !== best && other.type === 'zombie' && other.pos.distanceTo(best.pos) < 24) {
        other.alerted = true;
        other.alertCooldown = 10;
      }
    }
    if (Math.random() < 0.40 && game.mobs.length < MAX_MOBS) {
      const angle = Math.random() * Math.PI * 2;
      const rDist = 8 + Math.random() * 6;
      const rX = Math.floor(player.pos.x + Math.cos(angle) * rDist);
      const rZ = Math.floor(player.pos.z + Math.sin(angle) * rDist);
      const rY = surfaceHeight(rX, rZ) + 1;
      if (rY > 0 && rY < HEIGHT - 2) {
        spawnMob('zombie', rX + 0.5, rY + 0.1, rZ + 0.5);
        toast("🧟 Zombie called for reinforcements!");
      }
    }
  }

  if (!best.def.hostile) {
    best.panicTimer = 4.0;
    best.panicThreatPos = player.pos.clone();
    if (best.type === 'pig') playPigSound();
    else if (best.type === 'sheep') playSheepSound();
  }
  best.mesh.traverse(child => {
    if(child.material && child.material.emissive) child.material.emissive.setRGB(0.5, 0, 0);
  });
  
  let kx = best.pos.x - player.pos.x;
  let kz = best.pos.z - player.pos.z;
  let kl = Math.hypot(kx, kz);
  if (kl < 1e-4) {
    const angle = Math.random() * Math.PI * 2;
    kx = Math.cos(angle);
    kz = Math.sin(angle);
    kl = 1;
  }
  best.vel.x = (kx / kl) * 5;
  best.vel.z = (kz / kl) * 5;
  best.vel.y = 3.5;
  
  if(best.hp <= 0){
    const isAnimal = best.type === 'pig' || best.type === 'sheep';
    if(isAnimal){
      player.health = Math.min(20, player.health + 4);
      player.hunger = Math.min(20, player.hunger + 2);
      toast(`❤️ Defeated ${best.def.name}! Restored +4 HP (+2 Hearts)!`);
    } else {
      toast(`💥 Defeated ${best.def.name}!`);
    }

    spawnItemDrop(150, isAnimal ? 2 : 1, best.pos.x, best.pos.y + 0.5, best.pos.z);
    if(best.def.drop){
      spawnItemDrop(best.def.drop, best.def.dropN || 1, best.pos.x + 0.2, best.pos.y + 0.5, best.pos.z + 0.2);
    }
    spawnXpOrbs(best.pos.x, best.pos.y + 0.5, best.pos.z, Math.floor(Math.random() * 3) + 3);

    const idx = game.mobs.indexOf(best);
    if(idx >= 0) removeMob(idx);
  }
  return true;
}

if (typeof window !== 'undefined') {
  window.__emitSoundEvent = emitSoundEvent;
}
