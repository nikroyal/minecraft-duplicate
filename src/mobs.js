import * as THREE from 'three';
import { player, game, webgl, toolDurability } from './state.js';
import { HEIGHT, isSolid, surfaceHeight, thingName } from './config.js';
import { getBlock, triggerWorldExplosion } from './world.js';
import { 
  hurtPlayer, addItem, heldTool, collisionSolid, eyePos, lookDir 
} from './player.js';
import { spawnItemDrop, spawnXpOrbs, spawnProjectile } from './main.js';
import { toast, scheduleSave } from './ui.js';
import { playHissSound, stopHissSound, playExplodeSound, playHitSound, playPigSound, playSheepSound, playZombieSound } from './audio.js';

const GRAV = -26;

export const MOB_TYPES = {
  pig:      { name:"Pig",      color:0xe89090, w:0.9, h:0.9, hp:8,  hostile:false, drop:133, dropN:2, speed:1.8 },
  sheep:    { name:"Sheep",    color:0xe8e8e0, w:0.9, h:1.1, hp:8,  hostile:false, drop:50,  dropN:1, speed:1.6 },
  zombie:   { name:"Zombie",   color:0x4a7a4a, w:0.6, h:1.8, hp:14, hostile:true,  drop:133, dropN:1, speed:2.6, dmg:3 },
  creeper:  { name:"Creeper",  color:0x2e8b57, w:0.6, h:1.7, hp:16, hostile:true,  drop:148, dropN:2, speed:2.4, dmg:0 },
  skeleton: { name:"Skeleton", color:0xd0d0d0, w:0.6, h:1.8, hp:16, hostile:true,  drop:147, dropN:3, speed:2.2, dmg:2 }
};

const MAX_MOBS = 14;
let mobSpawnTimer = 0;

export function makeMobMesh(type){
  const t = MOB_TYPES[type];
  const group = new THREE.Group();
  webgl.scene?.add(group);
  
  const mat = new THREE.MeshLambertMaterial({ color: t.color });
  
  if(type === "pig"){
    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 1.2), mat);
    body.position.set(0, 0.525, 0);
    group.add(body);
    
    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
    head.position.set(0, 0.65, -0.7);
    group.add(head);
    
    // Snout
    const snoutMat = new THREE.MeshLambertMaterial({ color: 0xd87070 });
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.15), snoutMat);
    snout.position.set(0, 0.6, -0.98);
    group.add(snout);
    
    // 4 legs
    for(let dx of [-0.3, 0.3]) for(let dz of [-0.4, 0.4]){
      const legGeo = new THREE.BoxGeometry(0.22, 0.4, 0.22);
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(dx, 0.2, dz);
      group.add(leg);
    }
  } else if(type === "sheep"){
    // Wool body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.3), mat);
    body.position.set(0, 0.65, 0);
    group.add(body);
    
    // Head
    const headMat = new THREE.MeshLambertMaterial({ color: 0xc8c8c0 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.5), headMat);
    head.position.set(0, 0.75, -0.75);
    group.add(head);
    
    // 4 legs
    for(let dx of [-0.32, 0.32]) for(let dz of [-0.45, 0.45]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), headMat);
      leg.position.set(dx, 0.25, dz);
      group.add(leg);
    }
  } else if(type === "zombie"){
    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.35), mat);
    body.position.set(0, 1.075, 0);
    group.add(body);
    
    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
    head.position.set(0, 1.7, 0);
    group.add(head);
    
    // Arms forward
    for(let dx of [-0.42, 0.42]){
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), mat);
      arm.position.set(dx, 1.1, -0.35);
      arm.rotation.x = -Math.PI / 2.2;
      group.add(arm);
    }
    
    // 2 legs
    for(let dx of [-0.18, 0.18]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), mat);
      leg.position.set(dx, 0.35, 0);
      group.add(leg);
    }
  } else if(type === "creeper"){
    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.35), mat);
    body.position.set(0, 0.8, 0);
    group.add(body);
    
    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), mat);
    head.position.set(0, 1.475, 0);
    group.add(head);
    
    // 4 short legs
    for(let dx of [-0.2, 0.2]) for(let dz of [-0.2, 0.2]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.22), mat);
      leg.position.set(dx, 0.2, dz);
      group.add(leg);
    }
  } else if(type === "skeleton"){
    // Skeleton Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.75, 0.25), mat);
    body.position.set(0, 1.075, 0);
    group.add(body);
    
    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat);
    head.position.set(0, 1.7, 0);
    group.add(head);
    
    // 2 Thin Arms
    for(let dx of [-0.32, 0.32]){
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 0.12), mat);
      arm.position.set(dx, 1.1, -0.2);
      arm.rotation.x = -Math.PI / 3;
      group.add(arm);
    }
    
    // Bow mesh in hand
    const bowMat = new THREE.MeshLambertMaterial({ color: 0x9a7b4a });
    const bowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.08), bowMat);
    bowMesh.position.set(0.35, 1.0, -0.4);
    group.add(bowMesh);

    // 2 Thin Legs
    for(let dx of [-0.14, 0.14]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), mat);
      leg.position.set(dx, 0.35, 0);
      group.add(leg);
    }
  }
  
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
      if(!mobCollides(m, m.pos.x, m.pos.y + step, m.pos.z)) {
        m.pos.y += step;
      } else {
        if(step < 0) {
          m.onGround = true;
        }
        m.vel.y = 0;
        break;
      }
    } else {
      if(!mobCollides(m, m.pos.x, m.pos.y, m.pos.z + step)) m.pos.z += step;
      else { m.vel.z = 0; m.hitWall = true; break; }
    }
  }
}

export function spawnMob(type, x, y, z){
  if(game.mobs.length >= MAX_MOBS) return null;
  const def = { ...MOB_TYPES[type] };
  const mesh = makeMobMesh(type);
  mesh.position.set(x, y, z);
  
  const mob = {
    type, def, mesh,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    yaw: Math.random() * Math.PI * 2,
    hp: def.hp,
    onGround: false,
    wanderTimer: 0,
    fuseTimer: 0,
    attackCd: 0,
    hurtFlash: 0,
    shootCd: 0,
    animPhase: Math.random() * 100,
    nextVoiceTime: performance.now() + 10000 + Math.random() * 15000,
    hitWall: false
  };
  game.mobs.push(mob);
  return mob;
}

export function trySpawnMobs(){
  if(game.mobs.length >= MAX_MOBS) return;
  const types = ["pig", "sheep", "zombie", "creeper", "skeleton"];
  const type = types[Math.floor(Math.random() * types.length)];
  const def = MOB_TYPES[type];
  
  // Night check for hostiles
  const isNight = game.timeOfDay < 0.22 || game.timeOfDay > 0.78;
  if(def.hostile && !isNight) return;
  if(!def.hostile && isNight && Math.random() > 0.3) return;
  
  const angle = Math.random() * Math.PI * 2;
  const dist = 12 + Math.random() * 18;
  const sx = Math.floor(player.pos.x + Math.cos(angle) * dist);
  const sz = Math.floor(player.pos.z + Math.sin(angle) * dist);
  
  let topY = 0;
  for(let y = HEIGHT - 1; y >= 1; y--){
    const b = getBlock(sx, y, sz);
    if(isSolid(b) && b !== 6){ // Ignore leaves
      topY = y + 1;
      break;
    }
  }
  if(topY === 0 || topY >= HEIGHT - 2) return;
  
  spawnMob(type, sx + 0.5, topY + 0.1, sz + 0.5);
}

export function updateMobs(dt){
  mobSpawnTimer += dt;
  if(mobSpawnTimer >= 5.0){
    mobSpawnTimer = 0;
    trySpawnMobs();
  }
  
  const now = performance.now();
  const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
  
  for(let i = game.mobs.length - 1; i >= 0; i--){
    const m = game.mobs[i];
    
    if(m.hurtFlash > 0){
      m.hurtFlash -= dt;
      if(m.hurtFlash <= 0){
        m.mesh.traverse(child => {
          if(child.material && child.material.emissive) child.material.emissive.setRGB(0, 0, 0);
        });
      }
    }
    
    // Despawn far away mobs
    const distToP = m.pos.distanceTo(player.pos);
    if(distToP > 48){
      removeMob(i);
      continue;
    }
    
    if(m.attackCd > 0) m.attackCd -= dt;
    
    // Check ground collision explicitly when stationary
    if(m.vel.y === 0 && mobCollides(m, m.pos.x, m.pos.y - 0.05, m.pos.z)) {
      m.onGround = true;
    }
    
    let wishX = 0, wishZ = 0;
    
    if(m.def.hostile && distToP < 16 && !player.dead){
      const dx = px - m.pos.x, dz = pz - m.pos.z;
      m.yaw = Math.atan2(-dx, -dz);
      if (m.type === "skeleton" && distToP < 8.0) {
        // Skeleton backs up or maintains distance
        wishX = Math.sin(m.yaw);
        wishZ = Math.cos(m.yaw);
      } else {
        wishX = -Math.sin(m.yaw);
        wishZ = -Math.cos(m.yaw);
      }
    } else {
      // Wander
      m.wanderTimer -= dt;
      if(m.wanderTimer <= 0){
        m.wanderTimer = 2 + Math.random() * 4;
        if(Math.random() < 0.6){
          m.yaw = Math.random() * Math.PI * 2;
        } else {
          m.yaw = null; // Idle
        }
      }
      if(m.yaw !== null){
        wishX = -Math.sin(m.yaw);
        wishZ = -Math.cos(m.yaw);
      }
    }
    
    // Skeleton shooting AI
    if (m.type === "skeleton" && distToP < 16 && !player.dead) {
      m.shootCd = (m.shootCd || 2.0) - dt;
      if (m.shootCd <= 0) {
        m.shootCd = 2.2 + Math.random() * 0.8;
        const mobEye = m.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        const pTarget = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
        const arrDir = pTarget.sub(mobEye).normalize();
        spawnProjectile(mobEye.x, mobEye.y, mobEye.z, arrDir, 18, false);
      }
    }

    // Jump over obstacles when moving
    m.hitWall = false;
    if(m.onGround && (wishX !== 0 || wishZ !== 0)){
      const aheadX = m.pos.x + wishX * 0.4;
      const aheadZ = m.pos.z + wishZ * 0.4;
      if(mobCollides(m, aheadX, m.pos.y, aheadZ)){
        m.vel.y = 7.5;
        m.onGround = false;
      }
    }
    
    m.vel.x = wishX * m.def.speed;
    m.vel.z = wishZ * m.def.speed;
    
    m.vel.y += GRAV * dt;
    if(m.vel.y < -35) m.vel.y = -35;
    
    mobMoveAxis(m, "x", m.vel.x * dt);
    mobMoveAxis(m, "z", m.vel.z * dt);
    mobMoveAxis(m, "y", m.vel.y * dt);
    
    m.mesh.position.copy(m.pos);
    if (m.yaw !== null && m.yaw !== undefined) {
      m.mesh.rotation.y = m.yaw;
    }
    
    // Creeper explosion logic
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
        const curDistToP = m.pos.distanceTo(player.pos);
        if(curDistToP < 4.5){
          const dmg = Math.max(1, Math.ceil(24 * (1 - curDistToP / 4.5)));
          hurtPlayer(dmg, "creeper");
        }
        removeMob(i);
        continue;
      }
    } else if(m.type === "creeper" && m.fuseTimer > 0){
      m.fuseTimer = 0;
      stopHissSound();
      m.mesh.traverse(child => {
        if(child.material && child.material.emissive) child.material.emissive.setRGB(0, 0, 0);
      });
    }
    
    // Zombie attack logic
    if(m.type === "zombie" && distToP < 1.4 && !player.dead && m.attackCd <= 0){
      m.attackCd = 1.0;
      hurtPlayer(m.def.dmg || 3, "zombie");
    }
    
    // Ambient sound trigger per mob
    if(now >= m.nextVoiceTime && distToP < 20){
      m.nextVoiceTime = now + 10000 + Math.random() * 15000;
      if(m.type === "pig") playPigSound();
      else if(m.type === "sheep") playSheepSound();
      else if(m.type === "zombie" || m.type === "skeleton") playZombieSound();
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
          if(!disposedMats.has(mat)){
            mat.dispose();
            disposedMats.add(mat);
          }
        });
      }
    });
  }
  game.mobs.splice(i, 1);
}

export function attackMob(){
  const o = eyePos(), d = lookDir();
  let best = null, bestT = 4.0;
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
  if(!best) return false;
  
  const tool = heldTool();
  let dmg = 1;
  let isCrit = false;
  
  // Critical Hit check (player falling and not on ground)
  if (player.vel.y < -0.5 && !player.onGround && !player.flying) {
    isCrit = true;
  }

  if(tool){
    if(tool.tool === "sword") dmg = 3 + (tool.tier || 1) * 2;
    else if(tool.tool === "axe") dmg = 2 + (tool.tier || 1);
    else dmg = 1 + (tool.tier || 1);
    
    // Decrement tool durability if equipped
    const id = tool.id;
    if(id){
      if(toolDurability[id] === undefined) toolDurability[id] = [30, 60, 150, 500][(tool.tier || 1) - 1] || 30;
      toolDurability[id] = Math.max(0, toolDurability[id] - 1);
    }
  }
  
  if (isCrit) {
    dmg = Math.floor(dmg * 1.5);
    toast("CRITICAL HIT!");
  }

  best.hp -= dmg;
  best.hurtFlash = 0.2;
  playHitSound();
  best.mesh.traverse(child => {
    if(child.material && child.material.emissive) child.material.emissive.setRGB(0.5, 0, 0);
  });
  
  const kx = best.pos.x - player.pos.x, kz = best.pos.z - player.pos.z, kl = Math.hypot(kx, kz) || 1;
  best.vel.x = (kx / kl) * 5;
  best.vel.z = (kz / kl) * 5;
  best.vel.y = 3.5;
  
  if(best.hp <= 0){
    if(best.def.drop && game.survival){
      spawnItemDrop(best.def.drop, best.def.dropN || 1, best.pos.x, best.pos.y + 0.5, best.pos.z);
      spawnXpOrbs(best.pos.x, best.pos.y + 0.5, best.pos.z, Math.floor(Math.random() * 3) + 3);
      toast(`${best.def.name} defeated!`);
    } else {
      toast(`${best.def.name} defeated`);
    }
    const idx = game.mobs.indexOf(best);
    if(idx >= 0) removeMob(idx);
  }
  return true;
}
