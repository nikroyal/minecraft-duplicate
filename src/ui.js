import { keys, touch, player, inventory, hotbar, game, webgl, SAVE_KEY, world, reactBridge } from './state.js';
import { thingName, isPlaceable, craftableRecipes, BLOCKS } from './config.js';
import { invCount, addItem, removeItem } from './player.js';
import { initFirebase, saveWorldToCloud } from './firebase.js';

// Mutable UI state - use setters to modify from outside (ES module immutability rule)
export const uiState = {
  craftOpen: false,
  chestOpen: false,
  furnaceOpen: false,
  activeChestCoords: null,
  activeFurnaceCoords: null,
};

// Setters
export function setChestOpen(v) { uiState.chestOpen = v; }
export function setFurnaceOpen(v) { uiState.furnaceOpen = v; }
export function setActiveChestCoords(v) { uiState.activeChestCoords = v; }
export function setActiveFurnaceCoords(v) { uiState.activeFurnaceCoords = v; }

// Open/Close Actions
export function getCraftOpen() { return uiState.craftOpen; }
export function isMenuOpen() { return uiState.craftOpen || uiState.chestOpen || uiState.furnaceOpen; }

export function openCraft() {
  Object.keys(keys).forEach(k => keys[k] = false);
  uiState.craftOpen = true;
  if(document.pointerLockElement) document.exitPointerLock();
  if (reactBridge.updateUI) reactBridge.updateUI();
}

export function closeCraft() {
  uiState.craftOpen = false;
  if(!touch.isTouch && game.running) {
    try { webgl.renderer.domElement.requestPointerLock(); } catch(e){}
  }
  if (reactBridge.updateUI) reactBridge.updateUI();
}

export function openChest(x, y, z) {
  Object.keys(keys).forEach(k => keys[k] = false);
  uiState.chestOpen = true;
  uiState.activeChestCoords = `${x},${y},${z}`;
  world.chests = world.chests || {};
  if (!world.chests[uiState.activeChestCoords]) {
    world.chests[uiState.activeChestCoords] = Array.from({length: 27}, () => ({id: 0, count: 0}));
  }
  if(document.pointerLockElement) document.exitPointerLock();
  if (reactBridge.updateUI) reactBridge.updateUI();
}

export function openFurnace(x, y, z) {
  Object.keys(keys).forEach(k => keys[k] = false);
  uiState.furnaceOpen = true;
  uiState.activeFurnaceCoords = `${x},${y},${z}`;
  world.furnaces = world.furnaces || {};
  if (!world.furnaces[uiState.activeFurnaceCoords]) {
    world.furnaces[uiState.activeFurnaceCoords] = {
      inputId: 0, inputCount: 0,
      fuelId: 0, fuelCount: 0,
      outputId: 0, outputCount: 0,
      smeltProgress: 0,
      burnTime: 0,
      maxBurnTime: 0
    };
  }
  if(document.pointerLockElement) document.exitPointerLock();
  if (reactBridge.updateUI) reactBridge.updateUI();
}

// GUI Redraw Triggers (handled by React)
export function updateHUD() { if (reactBridge.updateUI) reactBridge.updateUI(); }
export function updateClock() { if (reactBridge.updateUI) reactBridge.updateUI(); }
export function updateStatsHUD() { if (reactBridge.updateUI) reactBridge.updateUI(); }
export function refreshCounts() { if (reactBridge.updateUI) reactBridge.updateUI(); }
export function buildHotbar() { if (reactBridge.updateUI) reactBridge.updateUI(); }
export let deathCause = "The world got the better of you.";
export function showDeathScreen(cause) {
  if (cause === "starve") deathCause = "You starved to death.";
  else if (cause === "drown") deathCause = "You drowned.";
  else if (cause === "fall") deathCause = "You fell from a high place.";
  else if (cause === "void") deathCause = "You fell into the void.";
  else if (cause === "mob" || cause === "zombie") deathCause = "You were slain by a monster.";
  else if (cause === "creeper" || cause === "explosion") deathCause = "You were blown up by a Creeper.";
  else deathCause = cause || "The world got the better of you.";
  
  if (reactBridge.updateUI) reactBridge.updateUI();
}
export function hideDeathScreen() { if (reactBridge.updateUI) reactBridge.updateUI(); }

export function selectSlot(n) {
  game.selected = n;
  const main = import('./main.js');
  main.then(m => {
    if (m.updateHeldItemMesh) m.updateHeldItemMesh();
  });
  if (reactBridge.updateUI) reactBridge.updateUI();
}

// Combat Visual effects
export function flashDamage() {
  const el = document.getElementById("damageFlash");
  if (el) {
    el.style.opacity = "0.75";
    setTimeout(() => { el.style.opacity = "0"; }, 150);
  }
}

export function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

// Craft Item
export function craft(recipe) {
  for (const id in recipe.in) {
    if (invCount(Number(id)) < recipe.in[id]) return;
  }
  for (const id in recipe.in) {
    removeItem(Number(id), recipe.in[id]);
  }
  addItem(recipe.out, recipe.qty);

  if (isPlaceable(recipe.out) && !hotbar.includes(recipe.out)) {
    let slot = hotbar.findIndex(id => invCount(id) === 0);
    if (slot < 0) slot = hotbar.length - 1;
    hotbar[slot] = recipe.out;
  }
  
  const main = import('./main.js');
  main.then(m => {
    if (m.updateHeldItemMesh) m.updateHeldItemMesh();
  });

  scheduleSave();
  if (reactBridge.updateUI) reactBridge.updateUI();
}

// Save / Load Progress
export function saveWorld() {
  let minedBlocks = 0;
  let placedBlocks = 0;
  const edits = world.edits || {};
  for (const key in edits) {
    if (edits[key] === 0) minedBlocks++;
    else placedBlocks++;
  }

  const payload = {
    edits: world.edits,
    chests: world.chests,
    furnaces: world.furnaces,
    inventory,
    hotbar,
    player: {
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      yaw: player.yaw, pitch: player.pitch, flying: player.flying,
      health: player.health, hunger: player.hunger
    },
    avatar: player.avatar,
    survival: game.survival,
    timeOfDay: game.timeOfDay,
    minedBlocks,
    placedBlocks,
    username: window.__currentUserEmail || 'player',
    lastUpdated: new Date().toISOString()
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    toast("world saved");
  } catch (e) {}

  saveWorldToCloud(payload);
}

export function scheduleSave() {
  if (game.saveTimer) clearTimeout(game.saveTimer);
  game.saveTimer = setTimeout(saveWorld, 1200);
}

export function loadWorld() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const p = JSON.parse(raw);
    world.edits = p.edits || {};
    world.chests = p.chests || {};
    world.furnaces = p.furnaces || {};
    if (p.inventory) Object.assign(inventory, p.inventory);
    if (Array.isArray(p.hotbar) && p.hotbar.length === 8) {
      for (let i = 0; i < 8; i++) hotbar[i] = p.hotbar[i];
    }
    if (typeof p.survival === "boolean") game.survival = p.survival;
    if (typeof p.timeOfDay === "number") game.timeOfDay = p.timeOfDay;
    if (p.player) {
      player.pos.set(p.player.x, p.player.y, p.player.z);
      player.yaw = p.player.yaw; player.pitch = p.player.pitch;
      player.flying = !!p.player.flying;
      if (typeof p.player.health === "number") player.health = p.player.health;
      if (typeof p.player.hunger === "number") player.hunger = p.player.hunger;
    }
    if (p.avatar) {
      Object.assign(player.avatar, p.avatar);
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Firebase initialization connector
export function initUI(placeBlockCallback, miningStateRef) {
  const onStatusChange = (status) => {
    if (window.__onStatusChange) {
      window.__onStatusChange(status);
    }
  };

  const onSyncConflict = (cloudData) => {
    if (window.__onSyncConflict) {
      window.__onSyncConflict(cloudData);
    }
  };

  initFirebase(onStatusChange, onSyncConflict);
}

// Smelting Background Loop Ticks
export function tickFurnaces(dt) {
  const fuels = { 11: 80, 101: 80, 120: 80, 5: 15, 22: 15, 23: 15, 7: 15, 31: 15, 32: 15 };
  const smeltMap = { 12: 102, 13: 103, 14: 104, 4: 9, 15: 3, 133: 134, 28: 36, 23: 120, 3: 40 };

  const furnaces = world.furnaces || {};
  for (const coords in furnaces) {
    const f = furnaces[coords];
    const hasInput = f.inputId > 0 && f.inputCount > 0;
    const smeltable = hasInput ? smeltMap[f.inputId] : null;

    if (f.burnTime > 0) {
      f.burnTime -= dt;
      if (f.burnTime < 0) f.burnTime = 0;
    }

    if (f.burnTime === 0 && hasInput && smeltable) {
      const fuelVal = fuels[f.fuelId];
      if (fuelVal > 0 && f.fuelCount > 0) {
        const canOutput = f.outputCount === 0 || (f.outputId === smeltable && f.outputCount < 64);
        if (canOutput) {
          f.fuelCount--;
          f.burnTime = fuelVal;
          f.maxBurnTime = fuelVal;
          if (f.fuelCount <= 0) { f.fuelId = 0; f.fuelCount = 0; }
          scheduleSave();
        }
      }
    }

    if (f.burnTime > 0 && hasInput && smeltable) {
      const canOutput = f.outputCount === 0 || (f.outputId === smeltable && f.outputCount < 64);
      if (canOutput) {
        f.smeltProgress += dt;
        if (f.smeltProgress >= 8.0) {
          f.smeltProgress = 0;
          f.inputCount--;
          if (f.inputCount <= 0) { f.inputId = 0; f.inputCount = 0; }
          f.outputId = smeltable;
          f.outputCount = (f.outputCount || 0) + 1;
          scheduleSave();
        }
      } else {
        f.smeltProgress = 0;
      }
    } else {
      f.smeltProgress = Math.max(0, f.smeltProgress - dt * 2.0);
    }
  }
}

// Window event before unload auto-saves
window.addEventListener("beforeunload", saveWorld);

// CSS dynamic model update helper mapped to DOM
export function updateLobbyAvatarPreview() {
  const head = document.getElementById("avatarHead")?.value || "steve";
  const shirt = document.getElementById("avatarShirtColor")?.value || "#008080";
  const pants = document.getElementById("avatarPantsColor")?.value || "#3c4e8c";
  const skin = document.getElementById("avatarSkinColor")?.value || "#dfcfb7";
  
  const headModel = document.querySelector("#stevePreview .steve-head");
  const bodyModel = document.querySelector("#stevePreview .steve-body");
  const leftArm = document.querySelector("#stevePreview .left-arm");
  const rightArm = document.querySelector("#stevePreview .right-arm");
  const leftLeg = document.querySelector("#stevePreview .left-leg");
  const rightLeg = document.querySelector("#stevePreview .right-leg");
  
  if (!headModel || !bodyModel) return;
  
  let headFront = skin, headSides = skin, headTop = skin;
  if (head === "zombie") {
    headFront = "#4a7a4a"; headSides = "#4a7a4a"; headTop = "#4a7a4a";
  } else if (head === "creeper") {
    headFront = "#2e8b57"; headSides = "#2e8b57"; headTop = "#2e8b57";
  } else if (head === "alex") {
    headFront = skin; headSides = "#d06010"; headTop = "#d06010";
  }
  
  [...headModel.children].forEach(f => {
    if (f.classList.contains("face-front")) f.style.backgroundColor = headFront;
    else if (f.classList.contains("face-top")) f.style.backgroundColor = headTop;
    else f.style.backgroundColor = headSides;
  });
  
  [...bodyModel.children].forEach(f => f.style.backgroundColor = shirt);
  [...leftArm.children].forEach(f => f.style.backgroundColor = f.classList.contains("face-bottom") ? skin : shirt);
  [...rightArm.children].forEach(f => f.style.backgroundColor = f.classList.contains("face-bottom") ? skin : shirt);
  [...leftLeg.children].forEach(f => f.style.backgroundColor = pants);
  [...rightLeg.children].forEach(f => f.style.backgroundColor = pants);
}
