import * as THREE from 'three';
import { keys, touch, player, inventory, hotbar, game, webgl } from './state.js';
import { 
  CHUNK, HEIGHT, SEA, isSolid, isFood, ITEMS, thingName, surfaceHeight 
} from './config.js';
import { getBlock, getChunk } from './world.js';
import { 
  flashDamage, updateStatsHUD, showDeathScreen, hideDeathScreen, toast, refreshCounts 
} from './ui.js';

const GRAV = -26;
const JUMP = 8.4;
const SPEED = 4.6;
const SPRINT = 7.4;
const FLYSPEED = 10;

export function spawnPlayer(){
  const h = surfaceHeight(8, 8);
  player.pos.set(8.5, h+3, 8.5);
}

export function chunkReadyAt(wx, wz){
  const ch = getChunk(Math.floor(wx/CHUNK), Math.floor(wz/CHUNK));
  return ch && ch.generated;
}

export function collisionSolid(x, y, z){
  if(y < 0) return true; // floor
  if(y >= HEIGHT) return false;
  const ch = getChunk(Math.floor(x/CHUNK), Math.floor(z/CHUNK));
  if(!ch || !ch.generated) return true; // unloaded is solid
  const lx = ((x%CHUNK)+CHUNK)%CHUNK, lz = ((z%CHUNK)+CHUNK)%CHUNK;
  return isSolid(ch.get(lx, y, lz));
}

export function collidesAt(px, py, pz){
  const hw = 0.6 / 2, h = 1.8; // player width 0.6, height 1.8
  const minX = Math.floor(px-hw), maxX = Math.floor(px+hw);
  const minY = Math.floor(py),    maxY = Math.floor(py+h);
  const minZ = Math.floor(pz-hw), maxZ = Math.floor(pz+hw);
  
  for(let x=minX; x<=maxX; x++)
  for(let y=minY; y<=maxY; y++)
  for(let z=minZ; z<=maxZ; z++){
    if(collisionSolid(x, y, z)) return true;
  }
  return false;
}

const MAX_STEP = 0.35;
export function moveAxis(axis, amount){
  const p = player.pos;
  let remaining = amount;
  while(Math.abs(remaining) > 1e-6){
    const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, remaining));
    remaining -= step;
    if(axis === "x"){
      if(!collidesAt(p.x+step, p.y, p.z)) p.x += step;
      else { player.vel.x = 0; break; }
    } else if(axis === "y"){
      if(!collidesAt(p.x, p.y+step, p.z)) p.y += step;
      else { if(step < 0) player.onGround = true; player.vel.y = 0; break; }
    } else {
      if(!collidesAt(p.x, p.y, p.z+step)) p.z += step;
      else { player.vel.z = 0; break; }
    }
  }
}

export function updatePlayer(dt){
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  let wish = new THREE.Vector3();
  
  if(keys["KeyW"]) wish.add(forward);
  if(keys["KeyS"]) wish.sub(forward);
  if(keys["KeyD"]) wish.add(right);
  if(keys["KeyA"]) wish.sub(right);
  
  // touch stick
  if(touch.move.x || touch.move.y){
    wish.add(forward.clone().multiplyScalar(-touch.move.y));
    wish.add(right.clone().multiplyScalar(touch.move.x));
  }
  if(wish.lengthSq() > 0) wish.normalize();

  const sprint = keys["ShiftLeft"] || keys["ShiftRight"];

  if(!chunkReadyAt(player.pos.x, player.pos.z) && !player.flying){
    player.vel.set(0,0,0);
    return;
  }

  if(player.flying){
    const sp = FLYSPEED * (sprint ? 2 : 1);
    let vy = 0;
    if(keys["Space"] || touch.jump) vy += sp;
    if(keys["ControlLeft"] || keys["KeyC"]) vy -= sp;
    
    moveAxis("x", wish.x*sp*dt);
    moveAxis("z", wish.z*sp*dt);
    moveAxis("y", vy*dt);
    player.vel.set(0,0,0);
    player.onGround = false;
    return;
  }

  const sp = sprint ? SPRINT : SPEED;
  player.vel.x = wish.x * sp;
  player.vel.z = wish.z * sp;

  player.vel.y += GRAV * dt;
  if(player.vel.y < -55) player.vel.y = -55;

  if((keys["Space"] || touch.jump) && player.onGround){
    player.vel.y = JUMP; player.onGround = false;
  }

  const wasOnGround = player.onGround;
  player.onGround = false;
  
  moveAxis("x", player.vel.x*dt);
  moveAxis("z", player.vel.z*dt);
  moveAxis("y", player.vel.y*dt);

  // Fall damage tracking
  if(!player.flying){
    if(player.onGround){
      if(!wasOnGround && player.fallPeak !== undefined){
        const dropped = player.fallPeak - player.pos.y;
        if(dropped > 3.5) hurtPlayer(Math.floor(dropped - 3.5), "fall");
      }
      player.fallPeak = player.pos.y;
    } else {
      player.fallPeak = Math.max(player.fallPeak !== undefined ? player.fallPeak : player.pos.y, player.pos.y);
    }
  }

  // Void respawn
  if(player.pos.y < -20){ hurtPlayer(4, "void"); spawnPlayer(); }
}

export function hurtPlayer(amount, cause){
  if(!game.survival || player.dead || player.invuln > 0 || amount <= 0) return;
  player.health = Math.max(0, player.health - amount);
  player.invuln = 0.5;
  flashDamage();
  updateStatsHUD();
  if(player.health <= 0) playerDie(cause);
}

export function healPlayer(amount){
  player.health = Math.min(20, player.health + amount);
  updateStatsHUD();
}

export function feedPlayer(amount){
  player.hunger = Math.min(20, player.hunger + amount);
  updateStatsHUD();
}

export function eatSelected(){
  const id = hotbar[game.selected];
  if(!isFood(id)) { toast("that's not food"); return; }
  if(invCount(id) <= 0) return;
  if(player.hunger >= 20 && !ITEMS[id].heal) { toast("not hungry"); return; }
  removeItem(id, 1);
  feedPlayer(ITEMS[id].food || 0);
  if(ITEMS[id].heal) healPlayer(ITEMS[id].heal);
  toast(`ate ${thingName(id)}`);
}

export function updateSurvival(dt){
  if(!game.survival || player.dead) return;
  if(player.invuln > 0) player.invuln -= dt;

  const sprinting = (keys["ShiftLeft"] || keys["ShiftRight"]) && (Math.abs(player.vel.x) + Math.abs(player.vel.z)) > 0.1;
  player.hungerTimer += dt * (sprinting ? 1.8 : 1);
  if(player.hungerTimer >= 18){
    player.hungerTimer = 0;
    player.hunger = Math.max(0, player.hunger - 1);
    updateStatsHUD();
  }
  
  if(player.hunger >= 16 && player.health < 20){
    player.regenTimer += dt;
    if(player.regenTimer >= 3){ player.regenTimer = 0; healPlayer(1); }
  } else player.regenTimer = 0;
  
  if(player.hunger <= 0){
    player.starveTimer += dt;
    if(player.starveTimer >= 4){ player.starveTimer = 0; if(player.health > 2) hurtPlayer(1, "starve"); }
  } else player.starveTimer = 0;

  // Drowning
  const head = getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y+1.6), Math.floor(player.pos.z));
  if(head === 8){ // Water block id
    player.drownTimer = (player.drownTimer || 0) + dt;
    if(player.drownTimer >= 2){ player.drownTimer = 0; hurtPlayer(1, "drown"); }
  } else player.drownTimer = 0;
}

export function playerDie(cause){
  player.dead = true;
  game.running = false;
  // Mining state is in main.js, we can trigger exitPointerLock
  if(document.pointerLockElement) document.exitPointerLock();
  showDeathScreen(cause);
}

export function respawnPlayer(){
  player.dead = false;
  player.health = 20;
  player.hunger = 20;
  player.hungerTimer = 0; player.regenTimer = 0; player.starveTimer = 0; player.invuln = 1.5;
  player.vel.set(0,0,0);
  spawnPlayer();
  
  const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
  let topY = 1; for(let y = HEIGHT-1; y>=0; y--){ if(isSolid(getBlock(px, y, pz))){ topY = y + 1; break; } }
  player.pos.set(px+0.5, topY+0.5, pz+0.5);
  
  updateStatsHUD();
  hideDeathScreen();
  game.running = true;
}

export function invCount(id){ return inventory[id] || 0; }
export function addItem(id, n=1){ 
  inventory[id] = (inventory[id] || 0) + n; 
  refreshCounts(); 
}
export function removeItem(id, n=1){ 
  inventory[id] = Math.max(0, (inventory[id] || 0) - n); 
  if(inventory[id] === 0) delete inventory[id]; 
  refreshCounts(); 
}

export function heldTool(){
  const id = hotbar[game.selected];
  return ITEMS[id] && ITEMS[id].tool ? ITEMS[id] : null;
}
export function heldItem(){
  const id = hotbar[game.selected];
  return ITEMS[id] || null;
}

export function unstick(){
  if(!chunkReadyAt(player.pos.x, player.pos.z)) return;
  let tries = 0;
  while(collidesAt(player.pos.x, player.pos.y, player.pos.z) && tries < HEIGHT){
    player.pos.y += 1; tries++;
  }
}

export function eyePos(){ 
  return new THREE.Vector3(player.pos.x, player.pos.y+player.eye, player.pos.z); 
}

export function lookDir(){
  const d=new THREE.Vector3(0,0,-1);
  d.applyAxisAngle(new THREE.Vector3(1,0,0), player.pitch);
  d.applyAxisAngle(new THREE.Vector3(0,1,0), player.yaw);
  return d;
}
