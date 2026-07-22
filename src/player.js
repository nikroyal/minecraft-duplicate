import * as THREE from 'three';
import { keys, touch, player, inventory, hotbar, game, webgl } from './state.js';
import { 
  CHUNK, HEIGHT, SEA, isSolid, isFood, ITEMS, BLOCKS, thingName, surfaceHeight 
} from './config.js';
import { getBlock, getChunk } from './world.js';
import { 
  flashDamage, updateStatsHUD, showDeathScreen, hideDeathScreen, toast, refreshCounts,
  isMenuOpen, unlockAchievement
} from './ui.js';
import { playHitSound, playFootstepSound } from './audio.js';

const GRAV = -26;
const JUMP = 8.4;
const SPEED = 4.6;
const SPRINT = 7.4;
const FLYSPEED = 10;
const STEP_HEIGHT = 1.05;

export function spawnPlayer(){
  if (player.spawnPoint) {
    player.pos.copy(player.spawnPoint);
  } else {
    const h = surfaceHeight(8, 8);
    player.pos.set(8.5, h + 3, 8.5);
  }
  player.vel.set(0, 0, 0);
  player.onGround = false;
  player.fallPeak = player.pos.y;
  player.coyoteTimer = 0;
  player.jumpBuffer = 0;
}

export function chunkReadyAt(wx, wz){
  const cx = Math.floor(wx / CHUNK);
  const cz = Math.floor(wz / CHUNK);
  const ch = getChunk(cx, cz);
  return ch && ch.generated;
}

export function collisionSolid(x, y, z){
  if(y < 0) return false; // allow falling into void
  if(y >= HEIGHT) return false;
  const fx = Math.floor(x), fz = Math.floor(z);
  const cx = Math.floor(fx / CHUNK);
  const cz = Math.floor(fz / CHUNK);
  const ch = getChunk(cx, cz);
  if(!ch || !ch.generated) return false; // unloaded air
  const lx = ((fx % CHUNK) + CHUNK) % CHUNK;
  const lz = ((fz % CHUNK) + CHUNK) % CHUNK;
  return isSolid(ch.get(lx, y, lz));
}

export function collidesAt(px, py, pz){
  const hw = 0.6 / 2, h = 1.8; // player width 0.6, height 1.8
  const minX = Math.floor(px - hw + 1e-4);
  const maxX = Math.floor(px + hw - 1e-4);
  const minY = Math.floor(py + 1e-4);
  const maxY = Math.floor(py + h - 1e-4);
  const minZ = Math.floor(pz - hw + 1e-4);
  const maxZ = Math.floor(pz + hw - 1e-4);
  
  for(let x = minX; x <= maxX; x++)
  for(let y = minY; y <= maxY; y++)
  for(let z = minZ; z <= maxZ; z++){
    if(collisionSolid(x, y, z)) return true;
  }
  return false;
}

export function isSupportedOnGround(px, py, pz){
  const hw = 0.6 / 2;
  const minX = Math.floor(px - hw + 1e-4);
  const maxX = Math.floor(px + hw - 1e-4);
  const minZ = Math.floor(pz - hw + 1e-4);
  const maxZ = Math.floor(pz + hw - 1e-4);
  
  const blockBelowY = Math.floor(py - 0.01);
  const distToBlockTop = py - (blockBelowY + 1.0);
  
  // Feet must be within 0.08 blocks of a solid top surface directly beneath
  if (distToBlockTop > 0.08) return false;
  
  for(let x = minX; x <= maxX; x++){
    for(let z = minZ; z <= maxZ; z++){
      if(collisionSolid(x, blockBelowY, z)) return true;
    }
  }
  return false;
}

export function getIntersectingColliders(px, py, pz){
  const hw = 0.6 / 2, h = 1.8;
  const minX = Math.floor(px - hw + 1e-4);
  const maxX = Math.floor(px + hw - 1e-4);
  const minY = Math.floor(py - 0.05); // Include ground support block
  const maxY = Math.floor(py + h - 1e-4);
  const minZ = Math.floor(pz - hw + 1e-4);
  const maxZ = Math.floor(pz + hw - 1e-4);
  const list = [];
  
  for(let x = minX; x <= maxX; x++)
  for(let y = minY; y <= maxY; y++)
  for(let z = minZ; z <= maxZ; z++){
    if(collisionSolid(x, y, z)) {
      const id = getBlock(x, y, z);
      list.push({ x, y, z, id, name: thingName(id) || "Solid" });
    }
  }
  return list;
}

const MAX_STEP = 0.35;
export function moveAxis(axis, amount){
  if(!isFinite(amount) || Math.abs(amount) < 1e-6) return;
  const p = player.pos;
  let remaining = amount;
  let maxTries = 100;
  while(Math.abs(remaining) > 1e-6 && maxTries-- > 0){
    const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, remaining));
    remaining -= step;
    if(axis === "x"){
      if(!collidesAt(p.x + step, p.y, p.z)) {
        p.x += step;
      } else {
        let stepped = false;
        // Step-up is strictly allowed ONLY when player is already grounded
        if(player.onGround){
          const targetY = Math.floor(p.y) + 1.0 + 1e-4;
          const stepY = targetY - p.y;
          if(stepY > 0 && stepY <= STEP_HEIGHT){
            if(!collidesAt(p.x, targetY, p.z) && !collidesAt(p.x + step, targetY, p.z)){
              p.y = targetY;
              p.x += step;
              stepped = true;
            }
          }
        }
        if(!stepped){
          player.vel.x = 0;
          break;
        }
      }
    } else if(axis === "y"){
      if(!collidesAt(p.x, p.y + step, p.z)) {
        p.y += step;
      } else {
        if(step < 0) {
          // Landing on floor: snap Y to top of block surface
          p.y = Math.floor(p.y + step) + 1.0 + 1e-4;
          player.onGround = true;
        }
        player.vel.y = 0;
        break;
      }
    } else {
      if(!collidesAt(p.x, p.y, p.z + step)) {
        p.z += step;
      } else {
        let stepped = false;
        // Step-up is strictly allowed ONLY when player is already grounded
        if(player.onGround){
          const targetY = Math.floor(p.y) + 1.0 + 1e-4;
          const stepY = targetY - p.y;
          if(stepY > 0 && stepY <= STEP_HEIGHT){
            if(!collidesAt(p.x, targetY, p.z) && !collidesAt(p.x, targetY, p.z + step)){
              p.y = targetY;
              p.z += step;
              stepped = true;
            }
          }
        }
        if(!stepped){
          player.vel.z = 0;
          break;
        }
      }
    }
  }
}

export function updatePlayer(dt){
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  let wish = new THREE.Vector3();
  
  const blockInput = (!touch.isTouch && document.pointerLockElement !== webgl.renderer?.domElement) || isMenuOpen();
  
  if(!blockInput){
    if(keys["KeyW"]) wish.add(forward);
    if(keys["KeyS"]) wish.sub(forward);
    if(keys["KeyD"]) wish.add(right);
    if(keys["KeyA"]) wish.sub(right);
    
    // touch stick
    if(touch.move.x || touch.move.y){
      wish.add(forward.clone().multiplyScalar(-touch.move.y));
      wish.add(right.clone().multiplyScalar(touch.move.x));
    }
  }
  if(wish.lengthSq() > 0) wish.normalize();

  const sprint = blockInput ? false : (keys["ControlLeft"] || keys["ControlRight"] || keys["ShiftLeft"] || keys["ShiftRight"]);
  player.sprinting = sprint;

  if(!chunkReadyAt(player.pos.x, player.pos.z) && !player.flying){
    player.vel.set(0, 0, 0);
    return;
  }

  // Water check & physics
  const feetBlock = getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y), Math.floor(player.pos.z));
  const headBlock = getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y + player.eye), Math.floor(player.pos.z));
  const inWater = (feetBlock === 8 || headBlock === 8);

  // Ground status evaluation & Coyote Timer
  if(!player.flying){
    const supported = isSupportedOnGround(player.pos.x, player.pos.y, player.pos.z);
    if(player.vel.y <= 0.05 && supported){
      player.onGround = true;
    }
    if(player.onGround){
      player.coyoteTimer = 0.12;
    } else {
      player.coyoteTimer = Math.max(0, (player.coyoteTimer || 0) - dt);
    }
  }

  // Jump Input Buffering
  if(!blockInput && (keys["Space"] || touch.jump)){
    player.jumpBuffer = 0.15;
  } else if((player.jumpBuffer || 0) > 0){
    player.jumpBuffer -= dt;
  }

  if(player.flying){
    player.fallPeak = player.pos.y;
    const sp = FLYSPEED * (sprint ? 2 : 1);
    let vy = 0;
    if(!blockInput){
      if(keys["Space"] || touch.jump) vy += sp;
      if(keys["ControlLeft"] || keys["KeyC"]) vy -= sp;
    }
    
    moveAxis("x", wish.x * sp * dt);
    moveAxis("z", wish.z * sp * dt);
    moveAxis("y", vy * dt);
    player.vel.set(0, 0, 0);
    player.onGround = false;
    return;
  }

  const sp = sprint ? SPRINT : SPEED;
  player.vel.x = wish.x * sp;
  player.vel.z = wish.z * sp;

  // Unconditional Gravity application when airborne
  if (!inWater) {
    player.vel.y += GRAV * dt;
    if(player.vel.y < -55) player.vel.y = -55;
  }

  if (inWater) {
    player.fallPeak = player.pos.y; // Negate fall damage in water
    if (player.vel.y < -3.5) player.vel.y = -3.5; // Cap downward sinking speed
    player.vel.x *= 0.85;
    player.vel.z *= 0.85;
    if (!blockInput && (keys["Space"] || touch.jump)) {
      player.vel.y = Math.min(player.vel.y + 16 * dt, 4.5); // Swimming up
      const upperAir = getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y + 0.8), Math.floor(player.pos.z)) !== 8;
      if (upperAir) {
        player.vel.y = Math.max(player.vel.y, 6.4);
      }
    }
  }

  // Trigger jump if jump buffer is active and player is on ground or within coyote window
  if(!blockInput && !inWater && (player.jumpBuffer || 0) > 0 && (player.onGround || (player.coyoteTimer || 0) > 0)){
    player.vel.y = JUMP;
    player.onGround = false;
    player.coyoteTimer = 0;
    player.jumpBuffer = 0;
  }

  const wasOnGround = player.onGround;
  player.onGround = false;
  
  const oldX = player.pos.x, oldZ = player.pos.z;
  moveAxis("x", player.vel.x * dt);
  moveAxis("z", player.vel.z * dt);
  moveAxis("y", player.vel.y * dt);

  // Post-move ground probe check to keep player grounded state precise
  if(!player.flying && player.vel.y <= 0.05 && isSupportedOnGround(player.pos.x, player.pos.y, player.pos.z)){
    player.onGround = true;
  }

  if (player.onGround && !player.flying) {
    const dX = player.pos.x - oldX;
    const dZ = player.pos.z - oldZ;
    player.distWalked = (player.distWalked || 0) + Math.sqrt(dX * dX + dZ * dZ);
    if (player.distWalked >= 100) {
      unlockAchievement(1, "First Journey", "Walked over 100 blocks.");
    }
  }

  // Fall damage tracking
  if(!player.flying && !inWater){
    if(player.onGround){
      if(!wasOnGround && player.fallPeak !== undefined){
        const dropped = player.fallPeak - player.pos.y;
        if(dropped > 3.5) hurtPlayer(Math.ceil(dropped - 3.5), "fall");
      }
      player.fallPeak = player.pos.y;
    } else {
      player.fallPeak = Math.max(player.fallPeak !== undefined ? player.fallPeak : player.pos.y, player.pos.y);
    }
  }

  // Footsteps audio triggers
  const posDisplacement = Math.abs(player.pos.x - oldX) + Math.abs(player.pos.z - oldZ);
  if(player.onGround && posDisplacement > 0.005 && !player.flying){
    player.stepTimer = (player.stepTimer || 0) + dt;
    const interval = sprint ? 0.3 : 0.45;
    if(player.stepTimer >= interval){
      playFootstepSound();
      player.stepTimer = 0;
    }
  } else {
    player.stepTimer = 0;
  }

  // Void handling
  if(player.pos.y < -30){
    if (game.survival) {
      playerDie("void");
    } else {
      player.vel.set(0, 0, 0);
      spawnPlayer();
    }
  }
}

export function hurtPlayer(amount, cause){
  if(!game.survival || player.dead || player.invuln > 0 || amount <= 0) return;
  const roundedDmg = Math.max(1, Math.round(amount));
  player.health = Math.max(0, player.health - roundedDmg);
  player.invuln = 0.5;
  playHitSound();
  flashDamage();
  updateStatsHUD();
  if(player.health <= 0) playerDie(cause);
}

export function healPlayer(amount){
  player.health = Math.min(20, player.health + Math.round(amount));
  updateStatsHUD();
}

export function feedPlayer(amount){
  player.hunger = Math.min(20, player.hunger + Math.round(amount));
  updateStatsHUD();
}

export function eatSelected(){
  const id = hotbar[game.selected];
  if(!isFood(id)) { toast("that's not food"); return; }
  if(invCount(id) <= 0) return;
  if(player.hunger >= 20 && (!ITEMS[id] || !ITEMS[id].heal)) { toast("not hungry"); return; }
  removeItem(id, 1);
  feedPlayer(ITEMS[id]?.food || 0);
  if(ITEMS[id]?.heal) healPlayer(ITEMS[id].heal);
  toast(`ate ${thingName(id)}`);
}

export function updateSurvival(dt){
  if(!game.survival || player.dead) return;
  if(player.invuln > 0) player.invuln -= dt;

  // Initialize timers safely if missing
  player.hungerTimer = player.hungerTimer || 0;
  player.regenTimer = player.regenTimer || 0;
  player.starveTimer = player.starveTimer || 0;
  player.drownTimer = player.drownTimer || 0;

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
  const headY = Math.floor(player.pos.y + player.eye);
  const head = getBlock(Math.floor(player.pos.x), headY, Math.floor(player.pos.z));
  if(head === 8){ // Water block id
    player.drownTimer += dt;
    if(player.drownTimer >= 2){ player.drownTimer = 0; hurtPlayer(1, "drown"); }
  } else player.drownTimer = 0;
}

export function playerDie(cause){
  player.dead = true;
  player.diedTonight = true;
  game.running = false;
  if(document.pointerLockElement) document.exitPointerLock();
  showDeathScreen(cause);
}

export function respawnPlayer(){
  player.dead = false;
  player.health = 20;
  player.hunger = 20;
  player.hungerTimer = 0; player.regenTimer = 0; player.starveTimer = 0; player.invuln = 1.5;
  player.vel.set(0, 0, 0);
  spawnPlayer();
  
  updateStatsHUD();
  hideDeathScreen();
  game.running = true;
}

export function invCount(id){ return inventory[id] || 0; }
export function addItem(id, n=1){ 
  if (n <= 0) return;
  inventory[id] = (inventory[id] || 0) + n; 
  refreshCounts(); 
}
export function removeItem(id, n=1){ 
  if (n <= 0) return;
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
  return ITEMS[id] || BLOCKS[id] || null;
}

export function unstick(){
  if(!chunkReadyAt(player.pos.x, player.pos.z)) return;
  let tries = 0;
  while(collidesAt(player.pos.x, player.pos.y, player.pos.z) && tries < HEIGHT){
    player.pos.y += 1; tries++;
  }
  player.vel.set(0, 0, 0);
  player.fallPeak = player.pos.y;
}

export function eyePos(){ 
  return new THREE.Vector3(player.pos.x, player.pos.y + player.eye, player.pos.z); 
}

export function lookDir(){
  const clampedPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
  const cosPitch = Math.cos(clampedPitch);
  const sinPitch = Math.sin(clampedPitch);
  const sinYaw = Math.sin(player.yaw);
  const cosYaw = Math.cos(player.yaw);
  return new THREE.Vector3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch).normalize();
}
