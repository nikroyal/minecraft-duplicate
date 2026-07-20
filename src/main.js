import * as THREE from 'three';
import { keys, touch, player, inventory, hotbar, game, webgl } from './state.js';
import { 
  CHUNK, HEIGHT, RENDER_DIST, SEA, SEED, BLOCKS, ITEMS, parentTiles, 
  tileFor, tileUV, isSolid, isPlaceable, thingName, resolveRecipe, thingColor
} from './config.js';
import { 
  Chunk, getChunk, generateChunk, getBlock, setBlock, getLightGlobal, 
  computeChunkLight, relightAround, updateChunkMesh, disposeMesh, 
  updateChunkLoading, processGenBudget, buildAtlas, buildCrackTexture, 
  showCrack, hideCrack, spawnBreakBurst, updateParticles, initParticles,
  disturbWater, tickWater, wkey, setWater, WATER_TICK, queueWater
} from './world.js';
import { 
  spawnPlayer, collidesAt, moveAxis, updatePlayer, hurtPlayer, healPlayer, 
  feedPlayer, eatSelected, updateSurvival, playerDie, respawnPlayer, 
  invCount, addItem, removeItem, heldTool, heldItem, unstick, eyePos, lookDir 
} from './player.js';
import { 
  MOB_TYPES, makeMobMesh, spawnMob, trySpawnMobs, updateMobs, removeMob, attackMob 
} from './mobs.js';
import { 
  initUI, toast, updateHUD, updateClock, updateStatsHUD, flashDamage, 
  showDeathScreen, hideDeathScreen, buildHotbar, selectSlot, refreshCounts, 
  openCraft, closeCraft, switchTab, renderInventory, renderRecipes, 
  craft, renderBlocks, saveWorld, scheduleSave, loadWorld, getCraftOpen,
  openChest, openFurnace, isMenuOpen, tickFurnaces
} from './ui.js';
import { playPlaceSound, playMineSound } from './audio.js';

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
  if(t<0.22){ sky=SKY.night.clone(); sunI=0; moonI=0.35; ambI=0.35; }
  else if(t<0.30){ const k=(t-0.22)/0.08; sky=mixColor(SKY.night,SKY.dawn,k).clone(); sunI=k*0.9; moonI=0.35*(1-k); ambI=0.35+k*0.35; }
  else if(t<0.36){ const k=(t-0.30)/0.06; sky=mixColor(SKY.dawn,SKY.day,k).clone(); sunI=0.9+k*0.1; moonI=0; ambI=0.7+k*0.05; }
  else if(t<0.64){ sky=SKY.day.clone(); sunI=1.0; moonI=0; ambI=0.75; }
  else if(t<0.72){ const k=(t-0.64)/0.08; sky=mixColor(SKY.day,SKY.dusk,k).clone(); sunI=1.0-k*0.1; moonI=0; ambI=0.75-k*0.05; }
  else if(t<0.80){ const k=(t-0.72)/0.08; sky=mixColor(SKY.dusk,SKY.night,k).clone(); sunI=0.9*(1-k); moonI=0.35*k; ambI=0.7-k*0.35; }
  else { sky=SKY.night.clone(); sunI=0; moonI=0.35; ambI=0.35; }
  return {sky, sunI, moonI, ambI};
}

const dayColor = new THREE.Color(0xfff0d8), nightColor = new THREE.Color(0x9fb6e0);

function updateDayNight(dt){
  game.timeOfDay = (game.timeOfDay + dt/DAY_LENGTH) % 1;
  const s = skyState(game.timeOfDay);

  webgl.renderer.setClearColor(s.sky);
  webgl.scene.fog.color.copy(s.sky);

  const ang = (game.timeOfDay-0.25)*Math.PI*2;
  const sx = Math.cos(ang), sy = Math.sin(ang);
  
  webgl.dirLight.position.set(sx*100, Math.max(0.05, sy)*120, 60).add(webgl.camera.position);
  webgl.dirLight.intensity = s.sunI;
  webgl.dirLight.color.copy(dayColor);
  
  webgl.moonLight.position.set(-sx*100, Math.max(0.05, -sy)*120, -60).add(webgl.camera.position);
  webgl.moonLight.intensity = s.moonI;
  webgl.moonLight.color.copy(nightColor);
  
  webgl.ambientLight.intensity = Math.max(0.6, s.ambI);
  webgl.ambientLight.color.copy(nightColor).lerp(new THREE.Color(0xb8c4d0), s.sunI);

  if (webgl.sunMesh) {
    webgl.sunMesh.position.set(sx*140, sy*140, 60).add(webgl.camera.position);
    webgl.sunMesh.rotation.y = ang;
  }
  if (webgl.moonMesh) {
    webgl.moonMesh.position.set(-sx*140, -sy*140, -60).add(webgl.camera.position);
    webgl.moonMesh.rotation.y = ang;
  }

  updateClock();
}

// ---- Raycast helper ----
function raycastVoxel(maxDist){
  const o = eyePos(), d = lookDir();
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const stepX = Math.sign(d.x)||1, stepY = Math.sign(d.y)||1, stepZ = Math.sign(d.z)||1;
  const tDX = Math.abs(1/d.x), tDY = Math.abs(1/d.y), tDZ = Math.abs(1/d.z);
  let tMX = ((stepX>0 ? (x+1-o.x) : (o.x-x)))*tDX;
  let tMY = ((stepY>0 ? (y+1-o.y) : (o.y-y)))*tDY;
  let tMZ = ((stepZ>0 ? (z+1-o.z) : (o.z-z)))*tDZ;
  let px = x, py = y, pz = z, t = 0;
  
  for(let i=0; i<128; i++){
    const b = getBlock(x, y, z);
    if(b !== 0 && BLOCKS[b] && BLOCKS[b].solid){
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
  if(!tool) return 1;
  const b = BLOCKS[blockId]; if(!b) return 1;
  const name = b.name.toLowerCase();
  
  const isStone = b.ore || /stone|cobble|brick|granite|andesite|diorite|sandstone|obsidian|terracotta|glowstone|furnace|ore/.test(name);
  const isWood  = /wood|plank|log|bookshelf|chest|crafting|fence|gate|trapdoor|ladder/.test(name);
  const isSoft  = /dirt|grass|sand|gravel|snow|clay/.test(name);
  
  let good = false;
  if(tool.tool === "pickaxe" && isStone) good = true;
  if(tool.tool === "axe"     && isWood)  good = true;
  if(tool.tool === "shovel"  && isSoft)  good = true;
  
  if(!good) return 1;
  return [1, 2, 3.5, 5, 7][tool.tier] || 2;
}

function updateMining(dt){
  if(!mining.held){
    if(mining.active){ mining.active = false; hideCrack(); }
    mining.progress = 0;
    return;
  }
  const r = raycastVoxel(6);
  if(!r){
    mining.active = false; mining.progress = 0; hideCrack();
    return;
  }
  const [x, y, z] = r.hit;
  const id = getBlock(x, y, z);
  if(id === 0 || BLOCKS[id].name === "Water"){
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
  disturbWater(x, y, z);
  playPlaceSound(id); // break audio
  
  if(id === 6){ // Leaves
    const r = Math.random();
    if(r < 0.10) addItem(130, 1);
    else if(r < 0.18) addItem(131, 1);
    else if(r < 0.30) addItem(100, 1);
    else if(r < 0.34) addItem(136, 1);
    updateAfterEdit(x, y, z);
    return;
  }
  
  if(game.survival) addItem(id, 1);
  updateAfterEdit(x, y, z);
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
  const r = raycastVoxel(6);
  if(!r) return;
  
  // Intercept right click container interaction
  const hitBlockId = getBlock(r.hit[0], r.hit[1], r.hit[2]);
  if(hitBlockId === 43){ // Chest
    openChest(r.hit[0], r.hit[1], r.hit[2]);
    return;
  }
  if(hitBlockId === 42){ // Furnace
    openFurnace(r.hit[0], r.hit[1], r.hit[2]);
    return;
  }

  const [x, y, z] = r.prev;
  const id = hotbar[game.selected];
  
  if(!isPlaceable(id)){ toast(`${thingName(id)} can't be placed`); return; }
  if(game.survival && invCount(id) <= 0){ toast(`out of ${thingName(id)}`); return; }
  if(getBlock(x, y, z) !== 0) return;
  
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

  if(game.running){
    updatePlayer(dt);
    updateMining(dt);
    updateSurvival(dt);
    updateMobs(dt);
    tickFurnaces(dt);
  }
  
  updateChunkLoading();
  processGenBudget();
  updateParticles(dt);
  updateDayNight(dt);
  
  game.waterTimer += dt;
  if(game.waterTimer >= WATER_TICK){ game.waterTimer = 0; tickWater(); }

  // Camera tracking
  webgl.camera.position.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
  const dir = lookDir();
  webgl.camera.lookAt(webgl.camera.position.x + dir.x, webgl.camera.position.y + dir.y, webgl.camera.position.z + dir.z);

  // First person swinging animation
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

  // Crosshair targeted block highlight
  if(game.running){
    const r = raycastVoxel(6);
    const hudTarget = document.getElementById("blockTargetHUD");
    if(r){ 
      webgl.highlight.visible = true; 
      webgl.highlight.position.set(r.hit[0]+0.5, r.hit[1]+0.5, r.hit[2]+0.5); 
      
      const bid = getBlock(r.hit[0], r.hit[1], r.hit[2]);
      if(hudTarget && bid !== 0){
        hudTarget.textContent = thingName(bid);
        hudTarget.classList.add("visible");
      }
    } else {
      webgl.highlight.visible = false;
      if(hudTarget){
        hudTarget.classList.remove("visible");
      }
    }
  }

  webgl.renderer.render(webgl.scene, webgl.camera);

  // FPS ticker
  loop.fpsCnt = (loop.fpsCnt || 0) + 1;
  loop.fpsTimer = (loop.fpsTimer || 0) + dt;
  if(loop.fpsTimer >= 0.5){
    const fps = Math.round(loop.fpsCnt/loop.fpsTimer);
    document.getElementById("fps").textContent = fps;
    loop.fpsCnt = 0; loop.fpsTimer = 0;
    updateHUD();
  }
}

// ---- Game Bootloader --------------------------------------------------------
export function bootGame() {
  const canvas = document.getElementById("game");
  webgl.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  webgl.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  webgl.renderer.setSize(window.innerWidth, window.innerHeight);
  webgl.renderer.setClearColor(0x8fc3e8);

  webgl.atlasTex = buildAtlas();
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

  // Highlight Box wireframe setup
  const hlGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  const hlEdges = new THREE.EdgesGeometry(hlGeo);
  webgl.highlight = new THREE.LineSegments(hlEdges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 }));
  webgl.highlight.visible = false;
  webgl.scene.add(webgl.highlight);

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
  });

  // Action listeners (left/right click)
  webgl.renderer.domElement.addEventListener("mousedown", (e) => {
    if(player.dead) return;
    if(document.pointerLockElement !== webgl.renderer.domElement){
      if(!touch.isTouch && game.running) webgl.renderer.domElement.requestPointerLock();
      return;
    }
    if(getCraftOpen() || isMenuOpen()) return;
    
    if(e.button === 0){ // Left Click: mine / attack
      if(player.swingProgress === 0) player.swingProgress = 0.01;
      if(!attackMob()){
        mining.held = true;
      }
    } else if(e.button === 2){ // Right Click: place
      placeBlock();
    }
  });

  window.addEventListener("mouseup", (e) => {
    if(e.button === 0) mining.held = false;
  });

  // Keyboard binding updates
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if(e.code === "KeyF" && game.running && !player.dead){
      player.flying = !player.flying;
      toast(player.flying ? "flying enabled" : "flying disabled");
      updateHUD();
    }
    if(e.code === "KeyQ" && game.running && !player.dead){
      eatSelected();
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

  // Scroll wheel to change selected slot
  window.addEventListener("wheel", (e) => {
    if(document.pointerLockElement !== webgl.renderer.domElement || isMenuOpen()) return;
    let s = game.selected + Math.sign(e.deltaY);
    if(s < 0) s = 7;
    if(s > 7) s = 0;
    selectSlot(s);
  });

  // Boot UI
  initUI(placeBlock, mining);

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
  for(let i=0; i<40 && genQueue.length; i++){
    const ch = genQueue.shift();
    if(!ch.generated) generateChunk(ch);
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
  
  const id = hotbar[game.selected];
  if (id === 0 || invCount(id) <= 0) {
    const geo = new THREE.BoxGeometry(0.06, 0.06, 0.22);
    const mat = new THREE.MeshLambertMaterial({color: 0xdfcfb7});
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, 0, 0);
    webgl.heldGroup.add(m);
  } else {
    const col = thingColor(id);
    const placeable = isPlaceable(id);
    
    const geo = placeable 
      ? new THREE.BoxGeometry(0.08, 0.08, 0.08)
      : new THREE.BoxGeometry(0.02, 0.02, 0.25);
    const mat = new THREE.MeshLambertMaterial({color: col});
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, 0, 0);
    webgl.heldGroup.add(m);
  }
  
  webgl.heldGroup.position.set(0.24, -0.2, -0.35);
  webgl.heldGroup.rotation.set(0, 0, 0);
}

// Auto start game bootloader
bootGame();
