import * as THREE from 'three';
import { player, game, webgl } from './state.js';
import { HEIGHT, isSolid, surfaceHeight } from './config.js';
import { getBlock, getLightGlobal } from './world.js';
import { 
  hurtPlayer, addItem, heldTool, collisionSolid, chunkReadyAt, eyePos, lookDir 
} from './player.js';
import { toast } from './ui.js';

const GRAV = -26;

export const MOB_TYPES = {
  pig:   { name:"Pig",   color:0xe89090, w:0.9, h:0.9, hp:8,  hostile:false, drop:133, dropN:2, speed:1.8 },
  sheep: { name:"Sheep", color:0xe8e8e0, w:0.9, h:1.1, hp:8,  hostile:false, drop:133, dropN:1, speed:1.6 },
  zombie:{ name:"Zombie",color:0x4a7a4a, w:0.6, h:1.8, hp:14, hostile:true,  drop:133, dropN:1, speed:2.6, dmg:3 },
};

const MAX_MOBS = 14;
let mobSpawnTimer = 0;

export function makeMobMesh(type){
  const t = MOB_TYPES[type];
  const geo = new THREE.BoxGeometry(t.w, t.h, t.w*1.4);
  const mat = new THREE.MeshLambertMaterial({color:t.color});
  const mesh = new THREE.Mesh(geo, mat);
  webgl.scene.add(mesh);
  
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(t.w*0.7, t.w*0.7, t.w*0.7), 
    new THREE.MeshLambertMaterial({color:t.color})
  );
  mesh.add(head); 
  head.position.set(0, t.h*0.35, t.w*0.8);
  return mesh;
}

export function spawnMob(type, x, y, z){
  if(game.mobs.length >= MAX_MOBS) return null;
  const t = MOB_TYPES[type];
  const m = { 
    type, 
    def: t, 
    pos: new THREE.Vector3(x, y, z), 
    vel: new THREE.Vector3(),
    hp: t.hp, 
    mesh: makeMobMesh(type), 
    wander: new THREE.Vector3(), 
    wanderT: 0,
    attackCd: 0, 
    onGround: false, 
    hurtFlash: 0 
  };
  game.mobs.push(m);
  return m;
}

export function trySpawnMobs(dt){
  mobSpawnTimer += dt;
  if(mobSpawnTimer < 3) return; // attempt every ~3s
  mobSpawnTimer = 0;
  if(game.mobs.length >= MAX_MOBS) return;
  
  const night = game.timeOfDay < 0.24 || game.timeOfDay > 0.78;
  const ang = Math.random()*Math.PI*2, dist = 12 + Math.random()*12;
  const sx = Math.floor(player.pos.x + Math.cos(ang)*dist);
  const sz = Math.floor(player.pos.z + Math.sin(ang)*dist);
  
  if(!chunkReadyAt(sx, sz)) return;
  
  let topY = 0; 
  for(let y=HEIGHT-1; y>=0; y--){ 
    if(isSolid(getBlock(sx, y, sz))){ topY = y + 1; break; } 
  }
  
  const lightHere = getLightGlobal(sx, topY, sz);
  if(night && lightHere < 7 && Math.random() < 0.7){
    spawnMob("zombie", sx+0.5, topY+0.1, sz+0.5);
  } else if(!night && lightHere > 8 && Math.random() < 0.5){
    spawnMob(Math.random() < 0.5 ? "pig" : "sheep", sx+0.5, topY+0.1, sz+0.5);
  }
}

export function mobCollides(m, px, py, pz){
  const hw = m.def.w/2, h = m.def.h;
  for(let x=Math.floor(px-hw); x<=Math.floor(px+hw); x++)
  for(let y=Math.floor(py); y<=Math.floor(py+h); y++)
  for(let z=Math.floor(pz-hw); z<=Math.floor(pz+hw); z++){
    if(collisionSolid(x, y, z)) return true;
  }
  return false;
}

export function mobMoveAxis(m, axis, amt){
  const p = m.pos;
  if(axis === "x"){ 
    if(!mobCollides(m, p.x+amt, p.y, p.z)) p.x += amt; 
    else m.vel.x = 0; 
  } else if(axis === "y"){ 
    if(!mobCollides(m, p.x, p.y+amt, p.z)) p.y += amt; 
    else { if(amt < 0) m.onGround = true; m.vel.y = 0; } 
  } else { 
    if(!mobCollides(m, p.x, p.y, p.z+amt)) p.z += amt; 
    else m.vel.z = 0; 
  }
}

export function updateMobs(dt){
  trySpawnMobs(dt);
  const night = game.timeOfDay < 0.24 || game.timeOfDay > 0.78;
  
  for(let i=game.mobs.length-1; i>=0; i--){
    const m = game.mobs[i];
    const dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z;
    const distToPlayer = Math.hypot(dx, dz, m.pos.y - player.pos.y);
    
    // despawn if very far
    if(distToPlayer > 60){ removeMob(i); continue; }
    
    // zombies burn/despawn in daylight
    if(m.def.hostile && !night && distToPlayer > 16){ removeMob(i); continue; }

    if(m.attackCd > 0) m.attackCd -= dt;
    if(m.hurtFlash > 0){ 
      m.hurtFlash -= dt; 
      if(m.mesh.material.emissive) {
        m.mesh.material.emissive.setRGB(m.hurtFlash > 0 ? 0.5 : 0, 0, 0); 
      }
    }

    let wishX = 0, wishZ = 0;
    if(m.def.hostile && distToPlayer < 20){
      const len = Math.hypot(dx, dz) || 1;
      wishX = -dx/len; wishZ = -dz/len;
      if(distToPlayer < 1.6 && m.attackCd <= 0){
        hurtPlayer(m.def.dmg, "mob"); 
        m.attackCd = 1.0;
        player.vel.x += -dx/len*4; 
        player.vel.z += -dz/len*4;
      }
    } else {
      m.wanderT -= dt;
      if(m.wanderT <= 0){ 
        const a = Math.random()*Math.PI*2; 
        m.wander.set(Math.cos(a), 0, Math.sin(a)); 
        m.wanderT = 2 + Math.random()*3; 
        if(Math.random() < 0.3) m.wander.set(0, 0, 0); 
      }
      wishX = m.wander.x*0.5; wishZ = m.wander.z*0.5;
    }

    const sp = m.def.speed;
    m.vel.x = wishX*sp; m.vel.z = wishZ*sp;
    m.vel.y += GRAV*dt; if(m.vel.y < -40) m.vel.y = -40;
    
    if(m.onGround && (wishX || wishZ)){
      const ahead = mobCollides(m, m.pos.x+Math.sign(wishX)*0.4, m.pos.y, m.pos.z+Math.sign(wishZ)*0.4);
      if(ahead) m.vel.y = 7;
    }
    m.onGround = false;
    
    mobMoveAxis(m, "x", m.vel.x*dt);
    mobMoveAxis(m, "z", m.vel.z*dt);
    mobMoveAxis(m, "y", m.vel.y*dt);
    
    if(m.pos.y < -20){ removeMob(i); continue; }

    if(wishX || wishZ) m.mesh.rotation.y = Math.atan2(wishX, wishZ);
    m.mesh.position.copy(m.pos); 
    m.mesh.position.y += m.def.h/2;
  }
}

export function removeMob(i){
  const m = game.mobs[i];
  webgl.scene.remove(m.mesh); 
  m.mesh.geometry.dispose(); 
  m.mesh.material.dispose();
  game.mobs.splice(i, 1);
}

export function attackMob(){
  const o = eyePos(), d = lookDir();
  let best = null, bestT = 4.5;
  for(const m of game.mobs){
    const cx = m.pos.x, cy = m.pos.y+m.def.h/2, cz = m.pos.z;
    const toM = new THREE.Vector3(cx-o.x, cy-o.y, cz-o.z);
    const t = toM.dot(d);
    if(t < 0 || t > bestT) continue;
    const closest = new THREE.Vector3(o.x+d.x*t, o.y+d.y*t, o.z+d.z*t);
    const dist = Math.hypot(closest.x-cx, closest.y-cy, closest.z-cz);
    if(dist < m.def.w+0.4){ best = m; bestT = t; }
  }
  if(!best) return false;
  
  const tool = heldTool();
  let dmg = 1;
  if(tool){ dmg = tool.tool === "axe" ? (2+tool.tier) : (1+tool.tier); }
  best.hp -= dmg;
  best.hurtFlash = 0.2;
  if(best.mesh.material.emissive) best.mesh.material.emissive.setRGB(0.5, 0, 0);
  
  const kx = best.pos.x - player.pos.x, kz = best.pos.z - player.pos.z, kl = Math.hypot(kx, kz) || 1;
  best.vel.x += kx/kl*4; best.vel.z += kz/kl*4; best.vel.y = 4;
  
  if(best.hp <= 0){
    if(best.def.drop && game.survival) addItem(best.def.drop, best.def.dropN || 1);
    toast(`${best.def.name} defeated`);
    const idx = game.mobs.indexOf(best); 
    if(idx >= 0) removeMob(idx);
  }
  return true;
}
