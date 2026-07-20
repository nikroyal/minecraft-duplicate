import * as THREE from 'three';
import { keys, touch, player, inventory, hotbar, game, webgl, SAVE_KEY, avatarCallbacks } from './state.js';
import { 
  thingColor, thingName, isPlaceable, isFood, isTool, craftableRecipes, BLOCKS, ITEMS, keyOf 
} from './config.js';
import { getBlock, getChunk } from './world.js';
import { 
  respawnPlayer, eatSelected, invCount, addItem, removeItem, heldTool, unstick 
} from './player.js';
import { attackMob } from './mobs.js';
import { initAudio, playPlaceSound } from './audio.js';
import { 
  initFirebase, loginWithEmail, signupWithEmail, loginAnonymously, logoutUser, 
  manuallySyncLocalToCloud, resolveSyncConflict, fetchLeaderboard
} from './firebase.js';

// Dom references
let toastEl = null;
let fpsEl = null;
let posEl = null;
let modeEl = null;
let clockEl = null;
let statBars = null;
let healthBarEl = null;
let hungerBarEl = null;
let damageFlash = null;
let deathScreen = null;
let hotbarEl = null;
let craftScreen = null;
let invGrid = null;
let recipeList = null;
let recipeSearch = null;
let blockList = null;
let blockSearch = null;
let blockFilters = null;
let resetModal = null;
let resetSteps = [];
let syncModal = null;

let craftOpen = false;
let hotbarAssignSlot = 0;
let blockFilter = "All";

const CAT_ORDER = ["Nature","Wood","Stone","Ore","Glass","Light","Wool","Utility","Storage","Liquid","Shape"];

export function getCraftOpen() { return craftOpen; }
export function isMenuOpen() { return craftOpen || chestOpen || furnaceOpen; }

// Initialize all DOM elements and set up event listeners
export function initUI(placeBlockCallback, miningStateRef) {
  toastEl = document.getElementById("saveToast");
  fpsEl = document.getElementById("fps");
  posEl = document.getElementById("pos");
  modeEl = document.getElementById("mode");
  clockEl = document.getElementById("clock");
  statBars = document.getElementById("statBars");
  healthBarEl = document.getElementById("healthBar");
  hungerBarEl = document.getElementById("hungerBar");
  damageFlash = document.getElementById("damageFlash");
  deathScreen = document.getElementById("deathScreen");
  hotbarEl = document.getElementById("hotbar");
  craftScreen = document.getElementById("craftScreen");
  invGrid = document.getElementById("invGrid");
  recipeList = document.getElementById("recipeList");
  recipeSearch = document.getElementById("recipeSearch");
  blockList = document.getElementById("blockList");
  blockSearch = document.getElementById("blockSearch");
  blockFilters = document.getElementById("blockFilters");
  resetModal = document.getElementById("resetModal");
  syncModal = document.getElementById("syncModal");

  resetSteps = [
    document.getElementById("resetStep1"),
    document.getElementById("resetStep2"),
    document.getElementById("resetStep3"),
  ];

  // Core Buttons
  document.getElementById("craftClose").addEventListener("click", closeCraft);
  document.getElementById("respawnBtn").addEventListener("click", () => respawnPlayer());

  chestScreen = document.getElementById("chestScreen");
  furnaceScreen = document.getElementById("furnaceScreen");
  
  document.getElementById("chestClose").addEventListener("click", closeChest);
  document.getElementById("furnaceClose").addEventListener("click", closeFurnace);

  const surfaceBtn = document.getElementById("surfaceBtn");
  const playBtn = document.getElementById("playBtn");
  const overlay = document.getElementById("overlay");

  function startGame(){
    overlay.classList.add("hidden");
    if(!touch.isTouch){ webgl.renderer.domElement.requestPointerLock(); }
    game.running = true;
  }
  playBtn.addEventListener("click", () => {
    initAudio();
    startGame();
  });

  surfaceBtn.addEventListener("click", () => {
    const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
    const cx = Math.floor(px/16), cz = Math.floor(pz/16);
    let ch = getChunk(cx,cz);
    if(!ch){ ch = new Chunk(cx,cz); world.chunks.set(keyOf(cx,cz),ch); }
    if(!ch.generated) generateChunk(ch);
    let topY = 1;
    for(let y=48-1; y>=0; y--){ if(isSolid(getBlock(px,y,pz))){ topY = y + 1; break; } }
    player.pos.set(px+0.5, topY+0.5, pz+0.5);
    player.vel.set(0,0,0);
    player.flying = false;
    
    updateHUD();
    toast("teleported to surface");
    startGame();
  });

  // Lobby Dashboard Navigation
  const dashTabs = [...document.querySelectorAll(".dash-tab")];
  const dashPanels = [...document.querySelectorAll(".dash-panel")];
  
  dashTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.dash;
      dashTabs.forEach(t => t.classList.toggle("active", t === tab));
      dashPanels.forEach(p => p.classList.toggle("hidden", p.id !== `dash-${target}`));
      
      if (target === "stats") {
        updateLobbyStats();
      } else if (target === "leaderboard") {
        updateLobbyLeaderboard();
      } else if (target === "avatar") {
        updateLobbyAvatarPreview();
      }
    });
  });

  // Avatar Customizer Selectors
  const headSel = document.getElementById("avatarHead");
  const shirtSel = document.getElementById("avatarShirtColor");
  const pantsSel = document.getElementById("avatarPantsColor");
  const skinSel = document.getElementById("avatarSkinColor");
  
  const handleAvatarChange = () => {
    player.avatar = player.avatar || {};
    player.avatar.headType = headSel.value;
    player.avatar.shirtColor = shirtSel.value;
    player.avatar.pantsColor = pantsSel.value;
    player.avatar.skinColor = skinSel.value;
    
    updateLobbyAvatarPreview();
    if (avatarCallbacks.update) avatarCallbacks.update();
    scheduleSave();
  };
  
  if (headSel) {
    headSel.addEventListener("change", handleAvatarChange);
    shirtSel.addEventListener("input", handleAvatarChange);
    pantsSel.addEventListener("input", handleAvatarChange);
    skinSel.addEventListener("input", handleAvatarChange);
  }

  async function updateLobbyLeaderboard() {
    const lbody = document.getElementById("leaderboardBody");
    if (!lbody) return;
    lbody.innerHTML = `<tr><td colspan="4" style="color: var(--gold); text-align: center; padding: 20px;">Fetching global records...</td></tr>`;
    
    const list = await fetchLeaderboard();
    if (list.length === 0) {
      lbody.innerHTML = `<tr><td colspan="4" style="color: #9a8a76; text-align: center; padding: 20px;">No records found yet. Be the first to place a block!</td></tr>`;
      return;
    }
    
    lbody.innerHTML = "";
    list.forEach((u, i) => {
      const tr = document.createElement("tr");
      const name = u.username || "Anonymous Player";
      const placed = u.placedBlocks !== undefined ? u.placedBlocks : 0;
      const mined = u.minedBlocks !== undefined ? u.minedBlocks : 0;
      
      tr.innerHTML = `
        <td style="font-weight: 700; color: ${i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--gold)'};">#${i + 1}</td>
        <td style="color: #fff; font-weight: 600; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</td>
        <td style="color: var(--gold-bright); font-weight: bold;">${placed}</td>
        <td>${mined}</td>
      `;
      lbody.appendChild(tr);
    });
  }

  function updateLobbyStats() {
    let mined = 0;
    let placed = 0;
    const edits = world.edits || {};
    for (const key in edits) {
      if (edits[key] === 0) mined++;
      else placed++;
    }
    
    let carried = 0;
    for (const id in inventory) {
      carried += inventory[id] || 0;
    }
    
    const coordsStr = `${player.pos.x.toFixed(0)}, ${player.pos.y.toFixed(0)}, ${player.pos.z.toFixed(0)}`;
    
    const mins = Math.floor(game.timeOfDay * 24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    
    const minedEl = document.getElementById("statBlocksMined");
    const placedEl = document.getElementById("statBlocksPlaced");
    const posEl = document.getElementById("statPosition");
    const invEl = document.getElementById("statInventoryCount");
    const timeEl = document.getElementById("statTimeOfDay");
    const survEl = document.getElementById("statSurvivalStatus");
    
    if (minedEl) minedEl.textContent = mined;
    if (placedEl) placedEl.textContent = placed;
    if (posEl) posEl.textContent = coordsStr;
    if (invEl) invEl.textContent = carried;
    if (timeEl) timeEl.textContent = `${hh}:${mm}`;
    if (survEl) survEl.textContent = `❤️ ${player.health} / 🍗 ${player.hunger}`;
  }

  // Reset World flow
  function showResetStep(n){
    resetModal.classList.remove("hidden");
    resetSteps.forEach((s,i)=> s.classList.toggle("hidden", i!==n));
    if(n === 2){
      const inp = document.getElementById("resetInput");
      inp.value = ""; 
      document.getElementById("resetGo3").disabled = true;
      setTimeout(() => inp.focus(), 50);
    }
  }
  function closeResetModal(){
    resetModal.classList.add("hidden");
    resetSteps.forEach(s=>s.classList.add("hidden"));
  }
  document.getElementById("resetBtn").addEventListener("click", () => showResetStep(0));
  document.getElementById("resetGo1").addEventListener("click", () => showResetStep(1));
  document.getElementById("resetGo2").addEventListener("click", () => showResetStep(2));
  document.querySelectorAll("[data-reset-cancel]").forEach(b => b.addEventListener("click", closeResetModal));
  
  const resetInput = document.getElementById("resetInput");
  const resetGo3 = document.getElementById("resetGo3");
  resetInput.addEventListener("input", () => {
    resetGo3.disabled = resetInput.value.trim().toUpperCase() !== "RESET";
  });
  resetInput.addEventListener("keydown", e => {
    if(e.key === "Enter" && !resetGo3.disabled) resetGo3.click();
  });
  resetGo3.addEventListener("click", () => {
    if(resetInput.value.trim().toUpperCase() !== "RESET") return;
    localStorage.removeItem(SAVE_KEY);
    closeResetModal();
    location.reload();
  });

  // Tab switching
  const tabButtons = [...document.querySelectorAll(".craft-tab")];
  tabButtons.forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  if(recipeSearch) recipeSearch.addEventListener("input", renderRecipes);
  if(blockSearch) blockSearch.addEventListener("input", renderBlocks);

  // Keyboard binding for Esc/Pause menu
  window.addEventListener("keydown", (e) => {
    if(e.code === "KeyE" && game.running){
      if(craftOpen) closeCraft();
      else if(chestOpen) closeChest();
      else if(furnaceOpen) closeFurnace();
      else openCraft();
      e.preventDefault();
    }
    if(e.code === "Escape"){
      if(craftOpen) { closeCraft(); e.preventDefault(); }
      else if(chestOpen) { closeChest(); e.preventDefault(); }
      else if(furnaceOpen) { closeFurnace(); e.preventDefault(); }
    }
  });

  // Mobile Touch Controls Setup
  touch.isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  if(touch.isTouch) {
    document.body.classList.add("touch");
    setupTouchControls(placeBlockCallback, miningStateRef);
  }

  // Firebase integration initialization
  setupFirebaseUI();

  // Initial render
  buildHotbar();
  updateStatsHUD();
}

// ---- Toast / HUD -----------------------------------------------------------
export function toast(msg){
  if (!toastEl) return;
  toastEl.textContent=msg; toastEl.classList.add("show");
  clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove("show"), 1100);
}

export function updateHUD(){
  if (!posEl || !modeEl) return;
  posEl.textContent=`${player.pos.x.toFixed(0)} ${player.pos.y.toFixed(0)} ${player.pos.z.toFixed(0)}`;
  modeEl.textContent=(game.survival?"survival":"creative")+(player.flying?" · fly":"");
}

export function updateClock(){
  if(!clockEl) return;
  const mins=Math.floor(game.timeOfDay*24*60);
  const hh=String(Math.floor(mins/60)).padStart(2,"0");
  const mm=String(mins%60).padStart(2,"0");
  let phase="day";
  if(game.timeOfDay<0.22||game.timeOfDay>=0.80) phase="night";
  else if(game.timeOfDay<0.36) phase="dawn";
  else if(game.timeOfDay>=0.64) phase="dusk";
  clockEl.textContent=`${hh}:${mm} · ${phase}`;
}

// ---- Hearts & Hunger -------------------------------------------------------
const HEART_SVG = (fill) => `<svg viewBox="0 0 16 16"><path d="M8 14 L2 8 Q0 6 1.5 4 Q3 2 5 3.5 L8 6 L11 3.5 Q13 2 14.5 4 Q16 6 14 8 Z" fill="${fill}" stroke="#3a0000" stroke-width="1"/></svg>`;
const FOOD_SVG = (fill) => `<svg viewBox="0 0 16 16"><path d="M4 3 Q8 1 12 3 Q13 6 11 9 L11 14 Q8 15 5 14 L5 9 Q3 6 4 3 Z" fill="${fill}" stroke="#3a2400" stroke-width="1"/></svg>`;

function pipRow(el, value, max, svgFn, fullColor){
  el.innerHTML="";
  const pips=max/2;
  for(let i=0; i<pips; i++){
    const v=value - i*2;
    const pip=document.createElement("div"); pip.className="pip";
    pip.innerHTML=svgFn(v>=1?fullColor:"#444");
    if(v===1) pip.style.opacity="0.6";
    el.appendChild(pip);
  }
}

export function updateStatsHUD(){
  if (!statBars || !healthBarEl || !hungerBarEl) return;
  if(!game.survival){ statBars.classList.add("hidden"); return; }
  statBars.classList.remove("hidden");
  pipRow(healthBarEl, player.health, 20, HEART_SVG, "#e83030");
  pipRow(hungerBarEl, player.hunger, 20, FOOD_SVG, "#c89040");
}

export function flashDamage(){
  if (!damageFlash) return;
  damageFlash.classList.add("show");
  clearTimeout(flashDamage._t);
  flashDamage._t=setTimeout(()=>damageFlash.classList.remove("show"), 140);
}

export function showDeathScreen(cause){
  if (!deathScreen) return;
  const causes={fall:"You fell from too high.", void:"You fell out of the world.",
    starve:"You starved to death.", drown:"You drowned.",
    mob:"Something got you in the dark."};
  document.getElementById("deathCause").textContent=causes[cause]||"The world got the better of you.";
  deathScreen.classList.remove("hidden");
}

export function hideDeathScreen(){ 
  if (deathScreen) deathScreen.classList.add("hidden"); 
}

export function swatch3DMarkup(id) {
  const baseCol = thingColor(id);
  const r = (baseCol >> 16) & 255;
  const g = (baseCol >> 8) & 255;
  const b = baseCol & 255;
  
  const shade = (f) => {
    const rS = Math.min(255, Math.max(0, r * f)) | 0;
    const gS = Math.min(255, Math.max(0, g * f)) | 0;
    const bS = Math.min(255, Math.max(0, b * f)) | 0;
    return "#" + ((1 << 24) + (rS << 16) + (gS << 8) + bS).toString(16).slice(1);
  };
  
  const top = shade(1.18);
  const left = shade(0.88);
  const right = shade(0.68);
  
  return `
    <div class="swatch-3d">
      <div class="face top" style="background:${top}"></div>
      <div class="face left" style="background:${left}"></div>
      <div class="face right" style="background:${right}"></div>
    </div>
  `;
}

// ---- Hotbar ----------------------------------------------------------------
export function buildHotbar(){
  if (!hotbarEl) return;
  hotbarEl.innerHTML="";
  hotbar.forEach((id,i)=>{
    const slot=document.createElement("div");
    slot.className="slot"+(i===game.selected?" active":"");
    slot.dataset.i=i;
    slot.innerHTML=`<span class="key">${i+1}</span>
      ${swatch3DMarkup(id)}
      <span class="count">${invCount(id)}</span>
      <span class="name">${thingName(id)}</span>`;
    slot.addEventListener("click",()=>{ 
      selectSlot(i); 
      if(!touch.isTouch && game.running) webgl.renderer.domElement.requestPointerLock(); 
    });
    hotbarEl.appendChild(slot);
  });
}

export function selectSlot(i){ 
  game.selected = i; 
  buildHotbar(); 
}

export function refreshCounts(){
  if (!hotbarEl) return;
  [...hotbarEl.children].forEach((s,i)=>{
    const c=s.querySelector(".count"); 
    if(c) c.textContent = invCount(hotbar[i]);
  });
}

// ---- Crafting Screens ------------------------------------------------------
export function openCraft(){
  if(!game.running && !craftOpen) return;
  Object.keys(keys).forEach(k => keys[k] = false);
  craftOpen=true;
  craftScreen.classList.remove("hidden");
  if(document.pointerLockElement) document.exitPointerLock();
  switchTab("craft");
  setTimeout(()=>{ if(recipeSearch) recipeSearch.focus(); }, 40);
}

export function closeCraft(){
  craftOpen=false;
  craftScreen.classList.add("hidden");
  if(!touch.isTouch && game.running) webgl.renderer.domElement.requestPointerLock();
}

export function switchTab(name){
  const tabPanels = [...document.querySelectorAll(".tab-panel")];
  const tabButtons = [...document.querySelectorAll(".craft-tab")];
  tabButtons.forEach(b=> b.classList.toggle("active", b.dataset.tab===name));
  tabPanels.forEach(p=> p.classList.toggle("hidden", p.dataset.panel!==name));
  if(name==="blocks") renderBlocks();
  if(name==="manual") renderManual();
  if(name==="craft"){ renderInventory(); renderRecipes(); }
}

export function renderInventory(){
  invGrid.innerHTML="";
  const ids=Object.keys(inventory).map(Number).filter(id=>invCount(id)>0);
  
  const assignBar=document.createElement("div");
  assignBar.className="assign-bar";
  assignBar.innerHTML=`<div class="assign-label">Assign to hotbar slot:</div>`;
  const slotRow=document.createElement("div"); slotRow.className="assign-slots";
  hotbar.forEach((hid,i)=>{
    const s=document.createElement("div");
    s.className="assign-slot"+(i===hotbarAssignSlot?" active":"");
    s.innerHTML=`<span>${i+1}</span><div class="mini-swatch-3d">${swatch3DMarkup(hid)}</div>`;
    s.addEventListener("click",()=>{ hotbarAssignSlot=i; renderInventory(); });
    slotRow.appendChild(s);
  });
  assignBar.appendChild(slotRow);
  
  const parent=invGrid.parentElement;
  if(parent){
    parent.querySelector(".assign-bar")?.remove();
    parent.insertBefore(assignBar, invGrid);
  }

  if(ids.length===0){ invGrid.innerHTML='<div class="inv-empty">Nothing yet — go mine some blocks!</div>'; return; }
  ids.sort((a,b)=>a-b);
  for(const id of ids){
    const cell=document.createElement("div");
    cell.className="inv-cell clickable";
    const placeable=isPlaceable(id);
    cell.innerHTML=`${swatch3DMarkup(id)}
      <span class="count">${invCount(id)}</span>
      <span class="tip">${thingName(id)}${placeable||isFood(id)||isTool(id)?" — click to add to hotbar":""}</span>`;
    cell.addEventListener("click",()=>{
      hotbar[hotbarAssignSlot]=id;
      buildHotbar();
      renderInventory();
      scheduleSave();
      toast(`slot ${hotbarAssignSlot+1} → ${thingName(id)}`);
    });
    invGrid.appendChild(cell);
  }
}

export function renderRecipes(){
  const q=recipeSearch.value.trim().toLowerCase();
  recipeList.innerHTML="";
  const list=craftableRecipes(inventory)
    .filter(({recipe})=> !q || recipe.name.toLowerCase().includes(q) || recipe.hint.toLowerCase().includes(q))
    .sort((a,b)=> (b.canMake-a.canMake));
  
  if(list.length===0){ recipeList.innerHTML='<div class="inv-empty">No recipes match.</div>'; return; }
  for(const {recipe,canMake} of list){
    const row=document.createElement("div");
    row.className="recipe "+(canMake?"can":"cant");
    row.innerHTML=`<div class="r-swatch-container">${swatch3DMarkup(recipe.out)}</div>
      <div class="r-info"><div class="r-name">${recipe.name}${recipe.qty>1?` ×${recipe.qty}`:""}</div>
      <div class="r-hint">${recipe.hint}</div></div>
      <div class="r-qty">${canMake?"craft →":"need more"}</div>`;
    if(canMake) row.addEventListener("click",()=> craft(recipe));
    recipeList.appendChild(row);
  }
}

export function craft(recipe){
  for(const id in recipe.in){ if(invCount(Number(id))<recipe.in[id]) return; }
  for(const id in recipe.in){ removeItem(Number(id), recipe.in[id]); }
  addItem(recipe.out, recipe.qty);
  
  if(isPlaceable(recipe.out) && !hotbar.includes(recipe.out)){
    let slot=hotbar.findIndex(id=>invCount(id)===0);
    if(slot<0) slot=hotbar.length-1;
    hotbar[slot]=recipe.out;
    buildHotbar();
  }
  toast(`crafted ${recipe.name}${recipe.qty>1?` ×${recipe.qty}`:""}`);
  renderInventory();
  renderRecipes();
  scheduleSave();
}

// ---- Block Encyclopedia & Manual -------------------------------------------
function blockCategory(id){
  const b=BLOCKS[id];
  if(BLOCK_INFO[id]) return BLOCK_INFO[id].cat;
  if(b.variantOf!==undefined){ return "Shape"; }
  if(b.tint!==undefined) return "Glass";
  if(/Wool/.test(b.name)) return "Wool";
  if(/Carpet/.test(b.name)) return "Wool";
  if(b.light) return "Light";
  return "Stone";
}

function blockDesc(id){
  const b=BLOCKS[id];
  if(BLOCK_INFO[id]) return BLOCK_INFO[id].desc;
  if(b.variantOf!==undefined){
    const parent=thingName(b.variantOf);
    const shape=b.shape;
    const map={stairs:`Stairs made from ${parent}. Build slopes and steps.`,
      slab:`Half-height ${parent}. Fine detail, low ceilings, smooth floors.`,
      wall:`A ${parent} wall/barrier. Fences off areas at full height.`,
      fence:`A ${parent} fence. See-through barrier; pairs with a gate.`,
      gate:`A ${parent} gate. An openable gap in a fence line.`,
      trapdoor:`A ${parent} trapdoor. Hatch-style cover for floors/holes.`,
      carpet:`Thin ${parent} floor covering. Soft color underfoot.`};
    return map[shape]||`Shaped ${parent}.`;
  }
  if(b.tint!==undefined) return `Colored translucent glass. Stained-glass windows and accents.`;
  if(/Wool/.test(b.name)) return `Soft colored block. The building palette — dye it any color.`;
  return `A building block.`;
}

function blockSource(id){
  const b=BLOCKS[id];
  if(b.ore) return "Found: mine underground";
  if([1,2,3,4,5,6,8,27,28,29].includes(id)) return "Found: naturally in the world";
  if(id===30) return "Found: deep caves / made by water+lava";
  if(id===21) return "Found in caverns, or craft from gold";
  return "Crafted: see the Craft tab";
}

const BLOCK_INFO={
  1:{cat:"Nature", desc:"The green surface layer. Dig down through it to reach dirt and stone."},
  2:{cat:"Nature", desc:"Sits under grass. Common, soft, quick to dig."},
  3:{cat:"Stone",  desc:"The bulk of underground. Mine it for cobble — the base of most building."},
  4:{cat:"Nature", desc:"Found near water and beaches. Smelt into glass, or craft sandstone."},
  5:{cat:"Wood",   desc:"Chop from trees. Craft into planks — the start of most recipes."},
  6:{cat:"Nature", desc:"Tree foliage. Source of sticks-adjacent materials, string, and dyes."},
  7:{cat:"Wood",   desc:"Made from wood. Craft sticks, tools, chests, and building shapes."},
  8:{cat:"Liquid", desc:"Flows and spreads. Fills low ground; mine around it carefully."},
  9:{cat:"Glass",  desc:"Smelt from sand. See-through building block; craft into panes."},
  10:{cat:"Stone", desc:"Classic red brick. Sturdy, decorative walls."},
  11:{cat:"Ore",   desc:"Mine underground. Smelt or crack into coal for torches & fuel."},
  12:{cat:"Ore",   desc:"Mine underground. Smelt into iron ingots for strong tools."},
  13:{cat:"Ore",   desc:"Deeper and rarer. Smelt into gold — glowstone and shiny blocks."},
  14:{cat:"Ore",   desc:"Deepest, rarest. Yields diamond — the best tools and blocks."},
  15:{cat:"Stone", desc:"From mining stone. The workhorse building block; makes furnaces."},
  16:{cat:"Stone", desc:"Refined cobble. Clean walls; base for mossy variant."},
  17:{cat:"Stone", desc:"Aged, green-tinged brick. Great for ruins and gardens."},
  18:{cat:"Stone", desc:"Crafted from sand. Warm-toned building block; can be chiseled."},
  19:{cat:"Stone", desc:"Brick darkened with coal. Moody, dramatic builds."},
  20:{cat:"Light", desc:"Your main light source. Place in caves to keep them lit and safe."},
  21:{cat:"Light", desc:"Brightest block. A permanent glow — craft from gold or find in caverns."},
  22:{cat:"Wood",  desc:"Pale birch log. A lighter wood palette for building."},
  23:{cat:"Wood",  desc:"Dark spruce log. A rich, deep wood tone."},
  24:{cat:"Stone", desc:"Speckled pink-grey stone. Found underground; polish it smooth."},
  25:{cat:"Stone", desc:"Cool grey speckled stone. Polish for a clean finish."},
  26:{cat:"Stone", desc:"Bright white speckled stone. Polish for marble-like builds."},
  27:{cat:"Nature",desc:"Loose grey stone. Soft; can yield flint."},
  28:{cat:"Nature",desc:"Grey-blue clay. Smelt into terracotta or bricks."},
  29:{cat:"Nature",desc:"Soft white snow. Pack it into solid snow blocks."},
  30:{cat:"Stone", desc:"Nearly unbreakable dark block. Forms where water meets deep heat."},
  36:{cat:"Stone", desc:"Fired clay. Warm earthy building block."},
  37:{cat:"Glass", desc:"Slippery translucent block. Cold-themed builds."},
  40:{cat:"Stone", desc:"Smelted cobble. Smooth grey — a clean modern look."},
  41:{cat:"Utility",desc:"A workbench. (Crafting works anywhere here, but it's a landmark.)"},
  42:{cat:"Utility",desc:"A furnace. Smelting recipes are in your recipe book."},
  43:{cat:"Utility",desc:"Storage chest. A decorative storage-themed block."},
  44:{cat:"Utility",desc:"Bookshelf. Decorative; made from books and planks."},
  45:{cat:"Utility",desc:"Ladder. Place on walls to climb (climb-enabled)."},
  46:{cat:"Storage",desc:"Compressed iron. Store 9 ingots; shiny metallic block."},
  47:{cat:"Storage",desc:"Compressed gold. Store 9 ingots; bright gold block."},
  48:{cat:"Storage",desc:"Compressed diamond. Store 9 gems; stunning build accent."},
  49:{cat:"Glass",  desc:"Thin glass pane. Windows without full blocks."},
};

function buildBlockFilters(){
  blockFilters.innerHTML="";
  ["All",...CAT_ORDER].forEach(cat=>{
    const b=document.createElement("button");
    b.className="block-filter"+(cat===blockFilter?" active":"");
    b.textContent=cat;
    b.addEventListener("click",()=>{ blockFilter=cat; buildBlockFilters(); renderBlocks(); });
    blockFilters.appendChild(b);
  });
}

export function renderBlocks(){
  buildBlockFilters();
  const q=(blockSearch.value||"").trim().toLowerCase();
  blockList.innerHTML="";
  const ids=Object.keys(BLOCKS).map(Number).filter(id=>id!==0);
  const shown=ids.filter(id=>{
    const cat=blockCategory(id);
    if(blockFilter!=="All" && cat!==blockFilter) return false;
    if(q && !thingName(id).toLowerCase().includes(q)) return false;
    return true;
  });
  
  shown.sort((a,b)=>{
    const ca=CAT_ORDER.indexOf(blockCategory(a)), cb=CAT_ORDER.indexOf(blockCategory(b));
    return ca!==cb ? ca-cb : a-b;
  });
  if(shown.length===0){ blockList.innerHTML='<div class="inv-empty">No blocks match.</div>'; return; }
  for(const id of shown){
    const have=invCount(id);
    const entry=document.createElement("div");
    entry.className="block-entry";
    entry.innerHTML=`<div class="b-swatch-container">${swatch3DMarkup(id)}</div>
      <div class="b-info">
        <div class="b-name">${thingName(id)}</div>
        <span class="b-tag">${blockCategory(id)}</span>
        <div class="b-desc">${blockDesc(id)}</div>
        <div class="b-desc" style="opacity:.7">${blockSource(id)}</div>
        ${have>0?`<div class="b-have">✓ you have ${have}</div>`:""}
      </div>`;
    blockList.appendChild(entry);
  }
}

function renderManual(){
  const m=document.getElementById("manualBody");
  if(m.dataset.built) return;
  m.dataset.built="1";
  m.innerHTML=`
    <h3>Welcome to Voxel</h3>
    <p>You're in an endless blocky world. Mine what you find, gather materials, craft new things, and build whatever you like. Your world saves automatically to this browser.</p>

    <h3>Moving around</h3>
    <ul>
      <li><span class="m-key">W A S D</span> walk &nbsp; <span class="m-key">Space</span> jump &nbsp; <span class="m-key">Shift</span> sprint</li>
      <li><span class="m-key">Mouse</span> look around</li>
      <li><span class="m-key">F</span> toggle fly mode (fly up with <span class="m-key">Space</span>, down with <span class="m-key">C</span>)</li>
      <li><span class="m-key">Esc</span> pause &nbsp; — from the pause menu you can teleport to the surface if you get lost underground</li>
    </ul>

    <h3>Mining &amp; building</h3>
    <ul>
      <li><span class="m-key">Left-click &amp; hold</span> to mine the block you're aiming at</li>
      <li><span class="m-key">Right-click</span> to place the block selected in your hotbar</li>
      <li><span class="m-key">1–8</span> or the <span class="m-key">mouse wheel</span> to pick which block to place</li>
    </ul>

    <h3>Staying alive — health &amp; hunger</h3>
    <p>You have hearts and hunger shown above the hotbar. Keep fed to heal.</p>
  `;
}

// ---- Mobile Touch Setup ----------------------------------------------------
function setupTouchControls(placeBlockCallback, miningStateRef){
  const stick=document.getElementById("stick"), nub=document.getElementById("nub");
  let sid=null, sc={x:0,y:0};
  stick.addEventListener("touchstart",e=>{
    const t=e.changedTouches[0]; sid=t.identifier;
    const r=stick.getBoundingClientRect(); sc={x:r.left+r.width/2,y:r.top+r.height/2};
    e.preventDefault();
  },{passive:false});
  
  window.addEventListener("touchmove",e=>{
    for(const t of e.changedTouches){
      if(t.identifier===sid){
        let dx=t.clientX-sc.x, dy=t.clientY-sc.y;
        const mag=Math.hypot(dx,dy), max=48;
        if(mag>max){ dx=dx/mag*max; dy=dy/mag*max; }
        nub.style.transform=`translate(${dx}px,${dy}px)`;
        touch.move.x=dx/max; touch.move.y=dy/max;
      }
    }
  },{passive:false});
  
  window.addEventListener("touchend",e=>{
    for(const t of e.changedTouches){
      if(t.identifier===sid){ sid=null; touch.move.x=0; touch.move.y=0; nub.style.transform=""; }
    }
  });

  let lid=null, lx=0, ly=0;
  webgl.renderer.domElement.addEventListener("touchstart",e=>{
    const t=e.changedTouches[0];
    if(t.clientX>window.innerWidth*0.4){ lid=t.identifier; lx=t.clientX; ly=t.clientY; }
  },{passive:false});
  
  webgl.renderer.domElement.addEventListener("touchmove",e=>{
    for(const t of e.changedTouches){
      if(t.identifier===lid){
        const s=0.005;
        player.yaw-=(t.clientX-lx)*s; player.pitch-=(t.clientY-ly)*s;
        const lim=Math.PI/2-0.01; player.pitch=Math.max(-lim,Math.min(lim,player.pitch));
        lx=t.clientX; ly=t.clientY;
      }
    }
  },{passive:false});
  
  webgl.renderer.domElement.addEventListener("touchend",e=>{ 
    for(const t of e.changedTouches) if(t.identifier===lid) lid=null; 
  });

  const jb=document.getElementById("btnJump");
  jb.addEventListener("touchstart",e=>{touch.jump=true;e.preventDefault();},{passive:false});
  jb.addEventListener("touchend",e=>{touch.jump=false;});
  
  const mb=document.getElementById("btnMine");
  mb.addEventListener("touchstart",e=>{ 
    if(!attackMob()) miningStateRef.held=true; 
    e.preventDefault();
  },{passive:false});
  mb.addEventListener("touchend",e=>{ miningStateRef.held=false; });
  
  document.getElementById("btnPlace").addEventListener("touchstart",e=>{ placeBlockCallback(); e.preventDefault();},{passive:false});
  document.getElementById("btnCraft").addEventListener("touchstart",e=>{ craftOpen?closeCraft():openCraft(); e.preventDefault();},{passive:false});
  document.getElementById("btnEat").addEventListener("touchstart",e=>{ eatSelected(); e.preventDefault();},{passive:false});
}

// ---- Firebase Cloud Sync HUD UI Setup --------------------------------------
function setupFirebaseUI() {
  const statusEl = document.getElementById("cloudStatus");
  const authFormEl = document.getElementById("cloudAuthForm");
  const loggedInEl = document.getElementById("cloudLoggedIn");
  const unconfiguredEl = document.getElementById("cloudUnconfigured");

  const authCard = document.getElementById("authCard");
  const lobbyCard = document.getElementById("lobbyCard");
  const lobbyUserName = document.getElementById("lobbyUserName");

  const loginBtn = document.getElementById("cloudLoginBtn");
  const signupBtn = document.getElementById("cloudSignupBtn");
  const anonBtn = document.getElementById("cloudAnonBtn");
  const logoutBtn = document.getElementById("cloudLogoutBtn");
  const syncNowBtn = document.getElementById("cloudSyncNowBtn");

  const emailInp = document.getElementById("cloudEmail");
  const passInp = document.getElementById("cloudPassword");
  const authErrorEl = document.getElementById("cloudAuthError");

  const keepCloudBtn = document.getElementById("syncKeepCloud");
  const keepLocalBtn = document.getElementById("syncKeepLocal");

  let cloudSavePending = null;

  const showError = (msg) => {
    if (authErrorEl) {
      authErrorEl.textContent = msg;
      setTimeout(() => { authErrorEl.textContent = ""; }, 6000);
    }
  };

  const onStatusChange = (status) => {
    if (status.state === 'unconfigured') {
      if (statusEl) statusEl.textContent = status.message;
      unconfiguredEl?.classList.remove("hidden");
      authCard?.classList.add("hidden");
      lobbyCard?.classList.remove("hidden");
      if (lobbyUserName) lobbyUserName.textContent = "Offline (Local Storage)";
    } else if (status.state === 'connecting') {
      if (statusEl) statusEl.textContent = status.message;
    } else if (status.state === 'logged_in') {
      if (statusEl) statusEl.innerHTML = status.message;
      authFormEl?.classList.add("hidden");
      loggedInEl?.classList.remove("hidden");
      authCard?.classList.add("hidden");
      lobbyCard?.classList.remove("hidden");
      if (lobbyUserName) {
        lobbyUserName.textContent = status.user.isAnonymous ? "Guest" : status.user.email;
      }
    } else if (status.state === 'logged_out') {
      if (statusEl) statusEl.textContent = status.message;
      authFormEl?.classList.remove("hidden");
      loggedInEl?.classList.add("hidden");
      authCard?.classList.remove("hidden");
      lobbyCard?.classList.add("hidden");
    } else {
      if (statusEl) statusEl.textContent = status.message;
    }
  };

  const onSyncConflict = (cloudData) => {
    cloudSavePending = cloudData;
    if (syncModal) syncModal.classList.remove("hidden");
  };

  // Trigger Firebase configuration init
  initFirebase(onStatusChange, onSyncConflict);

  // Bind Buttons
  loginBtn?.addEventListener("click", () => {
    const email = emailInp.value.trim();
    const password = passInp.value;
    if (!email || !password) return showError("Please enter email and password.");
    loginWithEmail(email, password).catch(err => showError(err.message));
  });

  signupBtn?.addEventListener("click", () => {
    const email = emailInp.value.trim();
    const password = passInp.value;
    if (!email || !password) return showError("Please enter email and password.");
    if (password.length < 6) return showError("Password must be at least 6 characters.");
    signupWithEmail(email, password).catch(err => showError(err.message));
  });

  anonBtn?.addEventListener("click", () => {
    loginAnonymously().catch(err => showError(err.message));
  });

  logoutBtn?.addEventListener("click", () => {
    logoutUser().catch(console.error);
  });

  syncNowBtn?.addEventListener("click", () => {
    manuallySyncLocalToCloud(onStatusChange);
  });

  keepCloudBtn?.addEventListener("click", () => {
    resolveSyncConflict(true, cloudSavePending);
  });

  keepLocalBtn?.addEventListener("click", () => {
    resolveSyncConflict(false, cloudSavePending);
    if (syncModal) syncModal.classList.add("hidden");
  });
}

// ---- Save / Load Helpers ---------------------------------------------------
export function saveWorld(){
  let minedBlocks = 0;
  let placedBlocks = 0;
  const edits = world.edits || {};
  for (const key in edits) {
    if (edits[key] === 0) minedBlocks++;
    else placedBlocks++;
  }

  const payload={
    edits: world.edits,
    chests: world.chests,
    furnaces: world.furnaces,
    inventory,
    hotbar,
    player:{
      x:player.pos.x, y:player.pos.y, z:player.pos.z,
      yaw:player.yaw, pitch:player.pitch, flying:player.flying,
      health:player.health, hunger:player.hunger
    },
    avatar: player.avatar,
    survival: game.survival,
    timeOfDay: game.timeOfDay,
    minedBlocks,
    placedBlocks,
    username: document.getElementById("lobbyUserName")?.textContent || "Guest",
    lastUpdated: new Date().toISOString()
  };
  try{ 
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); 
    toast("world saved"); 
  } catch(e){}
  
  // Save to Firestore (non-blocking)
  saveWorldToCloud(payload);
}

export function scheduleSave(){
  if(game.saveTimer) clearTimeout(game.saveTimer);
  game.saveTimer = setTimeout(saveWorld, 1200);
}

export function loadWorld(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const p=JSON.parse(raw);
    world.edits=p.edits||{};
    world.chests=p.chests||{};
    world.furnaces=p.furnaces||{};
    if(p.inventory) Object.assign(inventory,p.inventory);
    if(Array.isArray(p.hotbar) && p.hotbar.length===8) {
      for(let i=0; i<8; i++) hotbar[i] = p.hotbar[i];
    }
    if(typeof p.survival==="boolean") game.survival=p.survival;
    if(typeof p.timeOfDay==="number") game.timeOfDay=p.timeOfDay;
    if(p.player){
      player.pos.set(p.player.x, p.player.y, p.player.z);
      player.yaw=p.player.yaw; player.pitch=p.player.pitch;
      player.flying=!!p.player.flying;
      if(typeof p.player.health==="number") player.health=p.player.health;
      if(typeof p.player.hunger==="number") player.hunger=p.player.hunger;
    }
    if(p.avatar){
      Object.assign(player.avatar, p.avatar);
      const headSel = document.getElementById("avatarHead");
      const shirtSel = document.getElementById("avatarShirtColor");
      const pantsSel = document.getElementById("avatarPantsColor");
      const skinSel = document.getElementById("avatarSkinColor");
      if (headSel) {
        headSel.value = player.avatar.headType;
        shirtSel.value = player.avatar.shirtColor;
        pantsSel.value = player.avatar.pantsColor;
        skinSel.value = player.avatar.skinColor;
      }
      updateLobbyAvatarPreview();
    }
    return true;
  } catch(e) {
    return false;
  }
}

// Setup before unload listener
window.addEventListener("beforeunload", saveWorld);

// ---- Chest & Furnace Systems -----------------------------------------------
export let chestOpen = false;
export let furnaceOpen = false;
let activeChestCoords = null;
let activeFurnaceCoords = null;

let chestScreen = null;
let furnaceScreen = null;

const chestPlayerGrid = () => document.getElementById("chestPlayerGrid");
const chestGrid = () => document.getElementById("chestGrid");
const furnaceInventoryGrid = () => document.getElementById("furnaceInventoryGrid");
const furnaceInputSlot = () => document.getElementById("furnaceInputSlot");
const furnaceFuelSlot = () => document.getElementById("furnaceFuelSlot");
const furnaceOutputSlot = () => document.getElementById("furnaceOutputSlot");
const furnaceFlame = () => document.getElementById("furnaceFlame");
const furnaceSmeltProgress = () => document.getElementById("furnaceSmeltProgress");

export function openChest(x, y, z) {
  Object.keys(keys).forEach(k => keys[k] = false);
  chestOpen = true;
  activeChestCoords = `${x},${y},${z}`;
  
  world.chests = world.chests || {};
  if (!world.chests[activeChestCoords]) {
    world.chests[activeChestCoords] = Array.from({length: 27}, () => ({id: 0, count: 0}));
  }
  
  if (chestScreen) chestScreen.classList.remove("hidden");
  document.exitPointerLock();
  renderChestGUI();
}

export function closeChest() {
  chestOpen = false;
  activeChestCoords = null;
  if (chestScreen) chestScreen.classList.add("hidden");
  if (!touch.isTouch && game.running) {
    webgl.renderer.domElement.requestPointerLock();
  }
}

function renderChestGUI() {
  const pGrid = chestPlayerGrid();
  const cGrid = chestGrid();
  if (!pGrid || !cGrid) return;
  
  pGrid.innerHTML = "";
  cGrid.innerHTML = "";
  
  // Render Player Inventory
  const ids = Object.keys(inventory).map(Number).filter(id => invCount(id) > 0);
  if (ids.length === 0) {
    pGrid.innerHTML = '<div class="inv-empty" style="font-size:10px;">Empty inventory</div>';
  } else {
    ids.sort((a,b) => a-b);
    for (const id of ids) {
      const cell = document.createElement("div");
      cell.className = "inv-cell clickable";
      cell.innerHTML = `
        ${swatch3DMarkup(id)}
        <span class="count">${invCount(id)}</span>
        <span class="tip">${thingName(id)} (Click to store)</span>
      `;
      cell.addEventListener("click", () => {
        const chest = world.chests[activeChestCoords];
        let slot = chest.find(s => s.id === id && s.count < 64);
        if (!slot) slot = chest.find(s => s.id === 0);
        if (slot) {
          slot.id = id;
          slot.count = (slot.count || 0) + 1;
          removeItem(id, 1);
          playPlaceSound(id);
          renderChestGUI();
          refreshCounts();
          scheduleSave();
        }
      });
      pGrid.appendChild(cell);
    }
  }
  
  // Render Chest Storage (27 slots)
  const chest = world.chests[activeChestCoords];
  chest.forEach((slot, idx) => {
    const cell = document.createElement("div");
    cell.className = "inv-cell clickable";
    cell.style.minHeight = "40px";
    
    if (slot.id !== 0) {
      cell.innerHTML = `
        ${swatch3DMarkup(slot.id)}
        <span class="count">${slot.count}</span>
        <span class="tip">${thingName(slot.id)} (Click to retrieve)</span>
      `;
      cell.addEventListener("click", () => {
        const id = slot.id;
        addItem(id, 1);
        slot.count--;
        if (slot.count <= 0) {
          slot.id = 0;
          slot.count = 0;
        }
        playPlaceSound(id);
        renderChestGUI();
        refreshCounts();
        scheduleSave();
      });
    } else {
      cell.innerHTML = `<span style="font-size:8px; color:rgba(255,255,255,0.15); font-weight:700;">${idx+1}</span>`;
      cell.style.border = "1px solid rgba(214,178,120,0.15)";
      cell.style.background = "rgba(0,0,0,0.2)";
    }
    cGrid.appendChild(cell);
  });
}

function getFuelBurnTime(id) {
  if (id === 11 || id === 101 || id === 120) return 80;
  if (id === 5 || id === 22 || id === 23) return 15;
  if (id === 7 || id === 31 || id === 32) return 15;
  return 0;
}

function getSmeltResult(id) {
  if (id === 133) return { out: 134, label: "Cooked Meat" };
  if (id === 12) return { out: 102, label: "Iron Ingot" };
  if (id === 13) return { out: 103, label: "Gold Ingot" };
  if (id === 14) return { out: 104, label: "Diamond" };
  if (id === 4) return { out: 9, label: "Glass" };
  if (id === 15) return { out: 3, label: "Stone" };
  if (id === 3) return { out: 40, label: "Smooth Stone" };
  return null;
}

export function openFurnace(x, y, z) {
  Object.keys(keys).forEach(k => keys[k] = false);
  furnaceOpen = true;
  activeFurnaceCoords = `${x},${y},${z}`;
  
  world.furnaces = world.furnaces || {};
  if (!world.furnaces[activeFurnaceCoords]) {
    world.furnaces[activeFurnaceCoords] = {
      inputId: 0, inputCount: 0,
      fuelId: 0, fuelCount: 0,
      outputId: 0, outputCount: 0,
      smeltProgress: 0,
      burnTime: 0,
      maxBurnTime: 0
    };
  }
  
  if (furnaceScreen) furnaceScreen.classList.remove("hidden");
  document.exitPointerLock();
  updateFurnaceGUI();
}

export function closeFurnace() {
  furnaceOpen = false;
  activeFurnaceCoords = null;
  if (furnaceScreen) furnaceScreen.classList.add("hidden");
  if (!touch.isTouch && game.running) {
    webgl.renderer.domElement.requestPointerLock();
  }
}

function updateFurnaceGUI() {
  const f = world.furnaces[activeFurnaceCoords];
  if (!f) return;
  
  const inSlot = furnaceInputSlot();
  const fuSlot = furnaceFuelSlot();
  const outSlot = furnaceOutputSlot();
  const flame = furnaceFlame();
  const prog = furnaceSmeltProgress();
  const invGrid = furnaceInventoryGrid();
  
  if (!inSlot || !fuSlot || !outSlot || !flame || !prog || !invGrid) return;
  
  if (f.inputId !== 0) {
    inSlot.innerHTML = `
      ${swatch3DMarkup(f.inputId)}
      <span class="count">${f.inputCount}</span>
      <span class="tip">${thingName(f.inputId)} (Click to take)</span>
    `;
    inSlot.style.border = "2px solid var(--gold)";
    inSlot.onclick = () => {
      addItem(f.inputId, 1);
      f.inputCount--;
      if (f.inputCount <= 0) { f.inputId = 0; f.inputCount = 0; }
      playPlaceSound(f.inputId);
      updateFurnaceGUI();
      refreshCounts();
      scheduleSave();
    };
  } else {
    inSlot.innerHTML = `<span style="font-size:9px; color:rgba(255,255,255,0.2);">IN</span>`;
    inSlot.style.border = "2px dashed rgba(214,178,120,0.3)";
    inSlot.onclick = null;
  }
  
  if (f.fuelId !== 0) {
    fuSlot.innerHTML = `
      ${swatch3DMarkup(f.fuelId)}
      <span class="count">${f.fuelCount}</span>
      <span class="tip">${thingName(f.fuelId)} (Click to take)</span>
    `;
    fuSlot.style.border = "2px solid var(--gold)";
    fuSlot.onclick = () => {
      addItem(f.fuelId, 1);
      f.fuelCount--;
      if (f.fuelCount <= 0) { f.fuelId = 0; f.fuelCount = 0; }
      playPlaceSound(f.fuelId);
      updateFurnaceGUI();
      refreshCounts();
      scheduleSave();
    };
  } else {
    fuSlot.innerHTML = `<span style="font-size:9px; color:rgba(255,255,255,0.2);">FUEL</span>`;
    fuSlot.style.border = "2px dashed rgba(214,178,120,0.3)";
    fuSlot.onclick = null;
  }
  
  if (f.outputId !== 0) {
    outSlot.innerHTML = `
      ${swatch3DMarkup(f.outputId)}
      <span class="count">${f.outputCount}</span>
      <span class="tip">${thingName(f.outputId)} (Click to take all)</span>
    `;
    outSlot.onclick = () => {
      addItem(f.outputId, f.outputCount);
      const outId = f.outputId;
      f.outputId = 0;
      f.outputCount = 0;
      playPlaceSound(outId);
      updateFurnaceGUI();
      refreshCounts();
      scheduleSave();
    };
  } else {
    outSlot.innerHTML = `<span style="font-size:9px; color:rgba(255,255,255,0.2);">OUT</span>`;
    outSlot.onclick = null;
  }
  
  flame.style.color = f.burnTime > 0 ? "#ff5722" : "#888";
  flame.style.textShadow = f.burnTime > 0 ? "0 0 8px #ff5722" : "none";
  
  const percent = (f.smeltProgress / 8.0) * 100;
  prog.style.width = `${Math.min(100, percent)}%`;
  
  invGrid.innerHTML = "";
  const ids = Object.keys(inventory).map(Number).filter(id => invCount(id) > 0);
  if (ids.length === 0) {
    invGrid.innerHTML = '<div class="inv-empty" style="font-size:10px;">Empty inventory</div>';
  } else {
    ids.sort((a,b) => a-b);
    for (const id of ids) {
      const cell = document.createElement("div");
      cell.className = "inv-cell clickable";
      cell.innerHTML = `
        ${swatch3DMarkup(id)}
        <span class="count">${invCount(id)}</span>
        <span class="tip">${thingName(id)}</span>
      `;
      cell.addEventListener("click", () => {
        const smeltable = getSmeltResult(id);
        const fuelVal = getFuelBurnTime(id);
        
        if (smeltable) {
          if (f.inputId === 0 || f.inputId === id) {
            f.inputId = id;
            f.inputCount = (f.inputCount || 0) + 1;
            removeItem(id, 1);
            playPlaceSound(id);
            updateFurnaceGUI();
            refreshCounts();
            scheduleSave();
          } else {
            toast("Input slot occupied");
          }
        } else if (fuelVal > 0) {
          if (f.fuelId === 0 || f.fuelId === id) {
            f.fuelId = id;
            f.fuelCount = (f.fuelCount || 0) + 1;
            removeItem(id, 1);
            playPlaceSound(id);
            updateFurnaceGUI();
            refreshCounts();
            scheduleSave();
          } else {
            toast("Fuel slot occupied");
          }
        } else {
          toast("Not smelting item / fuel");
        }
      });
      invGrid.appendChild(cell);
    }
  }
}

export function tickFurnaces(dt) {
  if (!world.furnaces) return;
  
  for (const coords in world.furnaces) {
    const f = world.furnaces[coords];
    
    if (f.burnTime > 0) {
      f.burnTime -= dt;
      if (f.burnTime < 0) f.burnTime = 0;
    }
    
    const smeltable = getSmeltResult(f.inputId);
    
    if (f.burnTime <= 0 && f.fuelCount > 0 && f.inputCount > 0 && smeltable) {
      const canOutput = f.outputCount === 0 || (f.outputId === smeltable.out && f.outputCount < 64);
      if (canOutput) {
        const duration = getFuelBurnTime(f.fuelId);
        if (duration > 0) {
          f.burnTime = duration;
          f.maxBurnTime = duration;
          f.fuelCount--;
          if (f.fuelCount <= 0) { f.fuelId = 0; f.fuelCount = 0; }
          scheduleSave();
        }
      }
    }
    
    if (f.burnTime > 0 && f.inputCount > 0 && smeltable) {
      const canOutput = f.outputCount === 0 || (f.outputId === smeltable.out && f.outputCount < 64);
      if (canOutput) {
        f.smeltProgress += dt;
        if (f.smeltProgress >= 8.0) {
          f.smeltProgress = 0;
          f.inputCount--;
          if (f.inputCount <= 0) { f.inputId = 0; f.inputCount = 0; }
          f.outputId = smeltable.out;
          f.outputCount = (f.outputCount || 0) + 1;
          scheduleSave();
        }
      } else {
        f.smeltProgress = 0;
      }
    } else {
      f.smeltProgress = Math.max(0, f.smeltProgress - dt * 2.0);
    }
    
    if (furnaceOpen && activeFurnaceCoords === coords) {
      updateFurnaceGUI();
    }
  }
}

// Setup before unload listener
window.addEventListener("beforeunload", saveWorld);

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
