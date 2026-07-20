import * as THREE from 'three';
import { player, game, webgl } from './state.js';
import { HEIGHT, isSolid, surfaceHeight, thingName } from './config.js';
import { getBlock, getLightGlobal, triggerWorldExplosion } from './world.js';
import { 
  hurtPlayer, addItem, heldTool, collisionSolid, chunkReadyAt, eyePos, lookDir 
} from './player.js';
import { toast, scheduleSave } from './ui.js';
import { playHissSound, stopHissSound, playExplodeSound, playHitSound, playPigSound, playSheepSound, playZombieSound } from './audio.js';

const GRAV = -26;

export const MOB_TYPES = {
  pig:   { name:"Pig",   color:0xe89090, w:0.9, h:0.9, hp:8,  hostile:false, drop:133, dropN:2, speed:1.8 },
  sheep: { name:"Sheep", color:0xe8e8e0, w:0.9, h:1.1, hp:8,  hostile:false, drop:133, dropN:1, speed:1.6 },
  zombie:{ name:"Zombie",color:0x4a7a4a, w:0.6, h:1.8, hp:14, hostile:true,  drop:133, dropN:1, speed:2.6, dmg:3 },
  creeper:{ name:"Creeper",color:0x2e8b57, w:0.6, h:1.7, hp:16, hostile:true,  drop:133, dropN:1, speed:2.4, dmg:0 }
};

const MAX_MOBS = 14;
let mobSpawnTimer = 0;

export function makeMobMesh(type){
  const t = MOB_TYPES[type];
  const group = new THREE.Group();
  webgl.scene.add(group);
  
  const mat = new THREE.MeshLambertMaterial({color:t.color});
  
  if(type === "pig"){
    // Body (Y center = 0.5)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 1.2), mat);
    body.position.set(0, 0.525, 0);
    group.add(body);
    
    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat);
    head.position.set(0, 0.775, 0.5);
    group.add(head);
    
    // Snout (pink detail)
    const snout = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.14, 0.12), 
      new THREE.MeshLambertMaterial({color:0xffa0a0})
    );
    snout.position.set(0, 0.65, 0.785);
    group.add(snout);
    
    // 4 Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.35, 0.18);
    const legMat = new THREE.MeshLambertMaterial({color:0xe88080});
    
    const fl = new THREE.Mesh(legGeo, legMat); fl.position.set(-0.25, 0.175, 0.35); group.add(fl);
    const fr = new THREE.Mesh(legGeo, legMat); fr.position.set(0.25, 0.175, 0.35); group.add(fr);
    const bl = new THREE.Mesh(legGeo, legMat); bl.position.set(-0.25, 0.175, -0.35); group.add(bl);
    const br = new THREE.Mesh(legGeo, legMat); br.position.set(0.25, 0.175, -0.35); group.add(br);
    
    group.legs = [fl, fr, bl, br];
  }
  else if(type === "sheep"){
    // Body (wool)
    const woolMat = new THREE.MeshLambertMaterial({color:0xf5f5f0});
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 1.3), woolMat);
    body.position.set(0, 0.6, 0);
    group.add(body);
    
    // Head (wool)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), woolMat);
    head.position.set(0, 0.85, 0.55);
    group.add(head);
    
    // Skin face
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.08), 
      new THREE.MeshLambertMaterial({color:0xdfcfb7})
    );
    face.position.set(0, 0.76, 0.8);
    group.add(face);
    
    // 4 Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.4, 0.18);
    const legMat = new THREE.MeshLambertMaterial({color:0xdfcfb7});
    
    const fl = new THREE.Mesh(legGeo, legMat); fl.position.set(-0.25, 0.2, 0.4); group.add(fl);
    const fr = new THREE.Mesh(legGeo, legMat); fr.position.set(0.25, 0.2, 0.4); group.add(fr);
    const bl = new THREE.Mesh(legGeo, legMat); bl.position.set(-0.25, 0.2, -0.4); group.add(bl);
    const br = new THREE.Mesh(legGeo, legMat); br.position.set(0.25, 0.2, -0.4); group.add(br);
    
    group.legs = [fl, fr, bl, br];
  }
  else if(type === "creeper"){
    // Torso/Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.85, 0.22), mat);
    body.position.set(0, 0.725, 0);
    group.add(body);
    
    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
    head.position.set(0, 1.4, 0);
    group.add(head);
    
    // 4 Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.3, 0.22);
    
    const fl = new THREE.Mesh(legGeo, mat); fl.position.set(-0.14, 0.15, 0.14); group.add(fl);
    const fr = new THREE.Mesh(legGeo, mat); fr.position.set(0.14, 0.15, 0.14); group.add(fr);
    const bl = new THREE.Mesh(legGeo, mat); bl.position.set(-0.14, 0.15, -0.14); group.add(bl);
    const br = new THREE.Mesh(legGeo, mat); br.position.set(0.14, 0.15, -0.14); group.add(br);
    
    group.legs = [fl, fr, bl, br];
  }
  else if(type === "zombie"){
    // Body (Shirt)
    const shirtMat = new THREE.MeshLambertMaterial({color:0x008080});
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.22), shirtMat);
    body.position.set(0, 0.675, 0);
    group.add(body);
    
    // Head (Green skin)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat);
    head.position.set(0, 1.275, 0);
    group.add(head);
    
    // Hands extended forward
    const handGeo = new THREE.BoxGeometry(0.12, 0.12, 0.45);
    const hl = new THREE.Mesh(handGeo, mat); hl.position.set(-0.25, 0.8, 0.2); group.add(hl);
    const hr = new THREE.Mesh(handGeo, mat); hr.position.set(0.25, 0.8, 0.2); group.add(hr);
    
    // 2 Legs (Pants)
    const pantsMat = new THREE.MeshLambertMaterial({color:0x3c4e8c});
    const legGeo = new THREE.BoxGeometry(0.18, 0.45, 0.18);
    const ll = new THREE.Mesh(legGeo, pantsMat); ll.position.set(-0.11, 0.225, 0); group.add(ll);
    const lr = new THREE.Mesh(legGeo, pantsMat); lr.position.set(0.11, 0.225, 0); group.add(lr);
    
    group.legs = [ll, lr];
  }
  else {
    // Symmetrical fallback
    const geo = new THREE.BoxGeometry(t.w, t.h, t.w*1.4);
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    mesh.position.y = t.h/2;
  }
  
  return group;
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
    hurtFlash: 0,
    explodeTimer: 0
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
    spawnMob(Math.random() < 0.5 ? "zombie" : "creeper", sx+0.5, topY+0.1, sz+0.5);
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
    
    // hostile mobs burn/despawn in daylight
    if(m.def.hostile && !night && distToPlayer > 16){ removeMob(i); continue; }

    if(m.attackCd > 0) m.attackCd -= dt;
    if(m.hurtFlash > 0){ 
      m.hurtFlash -= dt; 
      m.mesh.traverse(child => {
        if(child.material && child.material.emissive){
          child.material.emissive.setRGB(m.hurtFlash > 0 ? 0.5 : 0, 0, 0); 
        }
      });
    }

    // --- Creeper Detonation Loop ---
    if(m.type === "creeper"){
      if(distToPlayer < 2.0 && !player.dead){
        if((m.explodeTimer || 0) === 0){
          playHissSound(1.5);
        }
        m.explodeTimer = (m.explodeTimer || 0) + dt;
        m.mesh.scale.setScalar(1.0 + (m.explodeTimer / 1.5) * 0.35);
        const flash = Math.sin(performance.now() * 0.05) > 0;
        m.mesh.traverse(child => {
          if(child.material && child.material.emissive){
            child.material.emissive.setRGB(flash ? 0.7 : 0.1, flash ? 0.7 : 0.1, flash ? 0.7 : 0.1);
          }
        });
        if(m.explodeTimer >= 1.5){
          playExplodeSound();
          // Detonate explosion
          triggerWorldExplosion(m.pos.x, m.pos.y, m.pos.z, 3.2, scheduleSave);
          // Radius damage to player
          const dmg = Math.max(0, Math.floor(18 * (1.0 - distToPlayer / 6.0)));
          hurtPlayer(dmg, "mob");
          // Blast knockback push
          const kx = player.pos.x - m.pos.x, kz = player.pos.z - m.pos.z, kl = Math.hypot(kx, kz) || 1;
          player.vel.x += kx/kl * 15; player.vel.z += kz/kl * 15; player.vel.y += 8;
          
          removeMob(i);
          continue;
        }
      } else {
        if(m.explodeTimer > 0){
          m.explodeTimer = Math.max(0, m.explodeTimer - dt * 2.0);
          if(m.explodeTimer === 0){
            stopHissSound();
          }
          m.mesh.scale.setScalar(1.0 + (m.explodeTimer / 1.5) * 0.35);
          m.mesh.traverse(child => {
            if(child.material && child.material.emissive){
              child.material.emissive.set(0x000000);
            }
          });
        }
      }
    }

    let wishX = 0, wishZ = 0;
    if(m.def.hostile && distToPlayer < 20){
      const len = Math.hypot(dx, dz) || 1;
      wishX = -dx/len; wishZ = -dz/len;
      // Normal attack for zombies
      if(m.type === "zombie" && distToPlayer < 1.6 && m.attackCd <= 0){
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

    // Ambient sound triggers
    m.ambientTimer = (m.ambientTimer || 0) + dt;
    const voiceTrigger = 10 + Math.random()*15;
    if(m.ambientTimer >= voiceTrigger){
      m.ambientTimer = 0;
      if(distToPlayer < 24){
        if(m.type === "pig") playPigSound();
        else if(m.type === "sheep") playSheepSound();
        else if(m.type === "zombie") playZombieSound();
      }
    }

    // Animate leg swings
    if(m.mesh.legs && (Math.abs(m.vel.x) + Math.abs(m.vel.z) > 0.1)){
      const swing = Math.sin(performance.now() * 0.012) * 0.6;
      if(m.mesh.legs.length === 4){
        m.mesh.legs[0].rotation.x = swing;
        m.mesh.legs[1].rotation.x = -swing;
        m.mesh.legs[2].rotation.x = -swing;
        m.mesh.legs[3].rotation.x = swing;
      } else if(m.mesh.legs.length === 2){
        m.mesh.legs[0].rotation.x = swing;
        m.mesh.legs[1].rotation.x = -swing;
      }
    } else if(m.mesh.legs){
      m.mesh.legs.forEach(l => l.rotation.x = 0);
    }
  }
}

export function removeMob(i){
  const m = game.mobs[i];
  if(m.type === "creeper"){
    stopHissSound();
  }
  webgl.scene.remove(m.mesh); 
  m.mesh.traverse(child => {
    if(child.geometry) child.geometry.dispose();
    if(child.material){
      if(Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
      else child.material.dispose();
    }
  });
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
  playHitSound();
  best.mesh.traverse(child => {
    if(child.material && child.material.emissive) child.material.emissive.setRGB(0.5, 0, 0);
  });
  
  const kx = best.pos.x - player.pos.x, kz = best.pos.z - player.pos.z, kl = Math.hypot(kx, kz) || 1;
  best.vel.x += kx/kl*4; best.vel.z += kz/kl*4; best.vel.y = 4;
  
  if(best.hp <= 0){
    if(best.def.drop && game.survival){
      addItem(best.def.drop, best.def.dropN || 1);
      toast(`${best.def.name} defeated. Got +${best.def.dropN || 1} ${thingName(best.def.drop)}!`);
    } else {
      toast(`${best.def.name} defeated`);
    }
    const idx = game.mobs.indexOf(best); 
    if(idx >= 0) removeMob(idx);
  }
  return true;
}
