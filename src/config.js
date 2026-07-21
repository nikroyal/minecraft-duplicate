import * as THREE from 'three';

// ---- Firebase Config ----
// To connect to your Firebase project, replace the placeholder below with your web app's config object from the Firebase Console.
export const firebaseConfig = {
  apiKey: "AIzaSyAHx3wJ5UtJEnG1ologtiSlIJ8wVq7fIXQ",
  authDomain: "minecraft-duplicate.firebaseapp.com",
  projectId: "minecraft-duplicate",
  storageBucket: "minecraft-duplicate.firebasestorage.app",
  messagingSenderId: "547851689112",
  appId: "1:547851689112:web:6f69290aea8cf13ccf44ed"
};

// Check if firebase is loaded and configured
export const isFirebaseConfigured = Boolean(
  firebaseConfig && 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "YOUR_API_KEY"
);

// ---- Block registry --------------------------------------------------------
export const AIR = 0;
export const BLOCKS = {
  1: { name: "Grass",  top:0x6aa84f, side:0x7a6a4a, bottom:0x5a4a34, solid:true, hardness:0.6 },
  2: { name: "Dirt",   all:0x6b4f34, solid:true, hardness:0.6 },
  3: { name: "Stone",  all:0x8a8a8a, solid:true, hardness:2.2 },
  4: { name: "Sand",   all:0xd9c88f, solid:true, hardness:0.5 },
  5: { name: "Wood",   top:0xa9834f, side:0x7a5a34, bottom:0xa9834f, solid:true, hardness:1.6 },
  6: { name: "Leaves", all:0x3f7a3f, solid:true, alpha:true, cutout:true, hardness:0.25 },
  7: { name: "Plank",  all:0xb08a52, solid:true, hardness:1.4 },
  8: { name: "Water",  all:0x3b6ea5, solid:false, alpha:true, hardness:999, liquid:true },
  9: { name: "Glass",  all:0xbfe3ef, solid:true, alpha:true, hardness:0.4 },
  10:{ name: "Brick",  all:0x9c4a3a, solid:true, hardness:3.0 },
  // --- ores (found underground / in caves) ---
  11:{ name: "Coal Ore",   all:0x8a8a8a, solid:true, hardness:2.6, ore:true },
  12:{ name: "Iron Ore",   all:0x8a8a8a, solid:true, hardness:3.0, ore:true },
  13:{ name: "Gold Ore",   all:0x8a8a8a, solid:true, hardness:3.2, ore:true },
  14:{ name: "Diamond Ore", all:0x8a8a8a, solid:true, hardness:4.5, ore:true },
  // --- building blocks ---
  15:{ name: "Cobble",     all:0x808080, solid:true, hardness:2.4 },
  16:{ name: "Stone Brick", all:0x8f8f8f, solid:true, hardness:2.8 },
  17:{ name: "Mossy Brick", all:0x6f7a5a, solid:true, hardness:2.8 },
  18:{ name: "Sandstone",  all:0xd9c88f, solid:true, hardness:2.0 },
  19:{ name: "Dark Brick", all:0x5a3a34, solid:true, hardness:3.2 },
  // --- light sources ---
  20:{ name: "Torch",  all:0xffd070, solid:false, alpha:true, cutout:true, hardness:0.1, light:14 },
  21:{ name: "Glowstone", all:0xf7e08a, solid:true, hardness:1.0, light:15 },

  // === raw materials ===
  22:{ name: "Birch Wood",  top:0xe8dcc0, side:0xd8cba8, bottom:0xe8dcc0, solid:true, hardness:1.6 },
  23:{ name: "Spruce Wood", top:0x5a3f28, side:0x4a3420, bottom:0x5a3f28, solid:true, hardness:1.6 },
  24:{ name: "Granite",  all:0xa06a54, solid:true, hardness:2.4 },
  25:{ name: "Andesite", all:0x8a8a90, solid:true, hardness:2.4 },
  26:{ name: "Diorite",  all:0xdcdcdc, solid:true, hardness:2.4 },
  27:{ name: "Gravel",   all:0x8a8078, solid:true, hardness:0.7 },
  28:{ name: "Clay",     all:0xa0a6b0, solid:true, hardness:0.8 },
  29:{ name: "Snow",     all:0xf4f8ff, solid:true, hardness:0.3 },
  30:{ name: "Obsidian", all:0x1a1428, solid:true, hardness:9.0 },

  // === refined building blocks ===
  31:{ name: "Birch Plank",  all:0xe4d8b8, solid:true, hardness:1.4 },
  32:{ name: "Spruce Plank", all:0x6a4f34, solid:true, hardness:1.4 },
  33:{ name: "Polished Granite",  all:0xb47a64, solid:true, hardness:2.4 },
  34:{ name: "Polished Andesite", all:0x9a9aa0, solid:true, hardness:2.4 },
  35:{ name: "Polished Diorite",  all:0xececec, solid:true, hardness:2.4 },
  36:{ name: "Terracotta", all:0xb06a4a, solid:true, hardness:2.0 },
  37:{ name: "Ice",        all:0x9cc8f0, solid:true, alpha:true, hardness:0.5 },
  38:{ name: "Packed Snow", all:0xeef4ff, solid:true, hardness:0.6 },
  39:{ name: "Chiseled Sandstone", all:0xcab878, solid:true, hardness:2.0 },
  40:{ name: "Smooth Stone", all:0x9a9a9a, solid:true, hardness:2.2 },

  // === storage/functional blocks ===
  41:{ name: "Crafting Table", top:0x9a6a3a, side:0x8a5a2a, bottom:0xb08a52, solid:true, hardness:1.6, station:"craft" },
  42:{ name: "Furnace",  top:0x6a6a6a, side:0x5a5a5a, bottom:0x5a5a5a, solid:true, hardness:3.0, station:"smelt" },
  43:{ name: "Chest",    top:0x9a7040, side:0x8a6030, bottom:0x8a6030, solid:true, hardness:1.6, station:"chest" },
  44:{ name: "Bookshelf", top:0xb08a52, side:0x9a6a3a, bottom:0xb08a52, solid:true, hardness:1.4 },
  45:{ name: "Ladder",   all:0x9a7b4a, solid:false, alpha:true, cutout:true, hardness:0.4, climb:true },
  46:{ name: "Iron Block", all:0xe8e8e8, solid:true, hardness:5.0 },
  47:{ name: "Gold Block", all:0xf2d24a, solid:true, hardness:3.0 },
  48:{ name: "Diamond Block", all:0x6fe6e0, solid:true, hardness:5.0 },
  49:{ name: "Glass Pane", all:0xcfe8f0, solid:true, alpha:true, cutout:true, hardness:0.4 },

  // === colored wool ===
  50:{ name: "White Wool",  all:0xf0f0f0, solid:true, hardness:0.8 },
  51:{ name: "Red Wool",    all:0xb03030, solid:true, hardness:0.8 },
  52:{ name: "Blue Wool",   all:0x3050b0, solid:true, hardness:0.8 },
  53:{ name: "Green Wool",  all:0x40904a, solid:true, hardness:0.8 },
  54:{ name: "Yellow Wool", all:0xe0c040, solid:true, hardness:0.8 },
  55:{ name: "Black Wool",  all:0x2a2a2a, solid:true, hardness:0.8 },
  89:{ name: "Farmland",    top:0x5c4033, side:0x6b4f34, bottom:0x6b4f34, solid:true, hardness:0.6 },
  90:{ name: "Wheat Crop (Seeded)", all:0x7a6a4a, solid:false, alpha:true, cutout:true, hardness:0.1 },
  91:{ name: "Wheat Crop (Growing)", all:0x6aa84f, solid:false, alpha:true, cutout:true, hardness:0.1 },
  92:{ name: "Wheat Crop (Ripe)", all:0xd8c060, solid:false, alpha:true, cutout:true, hardness:0.1 },
};

// === Shape variants ===
export const VARIANTS = {};
export const SHAPE_OF = {};
let _vid = 200;

export const SHAPE_SOURCE = [
  [7,"Oak Plank"],[31,"Birch Plank"],[32,"Spruce Plank"],
  [15,"Cobble"],[16,"Stone Brick"],[17,"Mossy Brick"],[18,"Sandstone"],
  [3,"Stone"],[40,"Smooth Stone"],[24,"Granite"],[25,"Andesite"],[26,"Diorite"],
  [33,"Pol. Granite"],[34,"Pol. Andesite"],[35,"Pol. Diorite"],
  [10,"Brick"],[19,"Dark Brick"],[39,"Chiseled Sandstone"],[36,"Terracotta"],
];

export const STAIR_ID = {};
export const SLAB_ID = {};
export const WALL_ID = {};

for(const [pid,label] of SHAPE_SOURCE){
  const p = BLOCKS[pid];
  const base = { solid:true, hardness:p.hardness||2, variantOf:pid };
  const col = p.all!==undefined ? {all:p.all} : {top:p.top,side:p.side,bottom:p.bottom};
  
  // stairs
  const sid=_vid++; BLOCKS[sid]={ name:`${label} Stairs`, ...col, ...base, shape:"stairs" };
  VARIANTS[sid]={parent:pid,shape:"stairs"}; SHAPE_OF[sid]="stairs"; STAIR_ID[pid]=sid;
  
  // slab
  const slid=_vid++; BLOCKS[slid]={ name:`${label} Slab`, ...col, ...base, shape:"slab" };
  VARIANTS[slid]={parent:pid,shape:"slab"}; SHAPE_OF[slid]="slab"; SLAB_ID[pid]=slid;
  
  // wall
  const wid=_vid++; BLOCKS[wid]={ name:`${label} Wall`, ...col, ...base, shape:"wall" };
  VARIANTS[wid]={parent:pid,shape:"wall"}; SHAPE_OF[wid]="wall"; WALL_ID[pid]=wid;
}

export function parentTiles(childId){ const v=VARIANTS[childId]; return v?BLOCK_TILES[v.parent]:null; }

export const _extraTiles = [];
export function BLOCK_TILES_EXTRA(id,color){ _extraTiles.push([id,color]); }

// === Fences / Gates / Carpets / Stained glass ===
export const FENCE_ID = {};
export const GATE_ID = {};
export const CARPET_ID = {};
export const STAINGLASS_ID = {};
export const STAINPANE_ID = {};
export const TRAPDOOR_ID = {};

const FENCE_SOURCE = [[7,"Oak"],[31,"Birch"],[32,"Spruce"]];
for(const [pid,label] of FENCE_SOURCE){
  const p=BLOCKS[pid], col=p.all!==undefined?{all:p.all}:{top:p.top,side:p.side,bottom:p.bottom};
  const fid=_vid++; BLOCKS[fid]={name:`${label} Fence`,...col,solid:true,hardness:p.hardness,variantOf:pid,shape:"fence"}; VARIANTS[fid]={parent:pid,shape:"fence"}; SHAPE_OF[fid]="fence"; FENCE_ID[pid]=fid;
  const gid=_vid++; BLOCKS[gid]={name:`${label} Gate`,...col,solid:true,hardness:p.hardness,variantOf:pid,shape:"gate"}; VARIANTS[gid]={parent:pid,shape:"gate"}; SHAPE_OF[gid]="gate"; GATE_ID[pid]=gid;
  const tid=_vid++; BLOCKS[tid]={name:`${label} Trapdoor`,...col,solid:true,hardness:p.hardness,variantOf:pid,shape:"trapdoor"}; VARIANTS[tid]={parent:pid,shape:"trapdoor"}; SHAPE_OF[tid]="trapdoor"; TRAPDOOR_ID[pid]=tid;
}

const WOOL_IDS = [[50,"White"],[51,"Red"],[52,"Blue"],[53,"Green"],[54,"Yellow"],[55,"Black"]];
for(const [pid,label] of WOOL_IDS){
  const p=BLOCKS[pid];
  const cid=_vid++; BLOCKS[cid]={name:`${label} Carpet`,all:p.all,solid:true,hardness:0.4,variantOf:pid,shape:"carpet"}; VARIANTS[cid]={parent:pid,shape:"carpet"}; SHAPE_OF[cid]="carpet"; CARPET_ID[pid]=cid;
}

const GLASS_COLORS = [[0xf0f0f0,"White",126],[0xb03030,"Red",121],[0x3050b0,"Blue",122],[0x40904a,"Green",123],[0xe0c040,"Yellow",124],[0x2a2a2a,"Black",125]];
for(const [color,label,dye] of GLASS_COLORS){
  const gid=_vid++; BLOCKS[gid]={name:`${label} Glass`,all:color,solid:true,alpha:true,hardness:0.4,shape:"glass",tint:color,tintTile:"glass"}; STAINGLASS_ID[dye]=gid;
  const pid=_vid++; BLOCKS[pid]={name:`${label} Glass Pane`,all:color,solid:true,alpha:true,cutout:true,hardness:0.4,shape:"pane",tint:color,tintTile:"glass_pane"}; STAINPANE_ID[gid]=pid;
}

export const MAX_LIGHT = 15;

// ---- Items registry ---------------------------------------------------------
export const ITEMS = {
  100: { name: "Stick",       color: 0x9a7b4a },
  101: { name: "Coal",        color: 0x2a2a2a },
  102: { name: "Iron Ingot",  color: 0xd8d8d8 },
  103: { name: "Gold Ingot",  color: 0xf2d24a },
  104: { name: "Diamond",     color: 0x6fe6e0 },
  105: { name: "Wood Pickaxe",  color: 0x9a7b4a, tool:"pickaxe", tier:1 },
  106: { name: "Stone Pickaxe", color: 0x8a8a8a, tool:"pickaxe", tier:2 },
  107: { name: "Iron Pickaxe",  color: 0xd8d8d8, tool:"pickaxe", tier:3 },
  108: { name: "Diamond Pickaxe", color: 0x6fe6e0, tool:"pickaxe", tier:4 },
  109: { name: "Wood Shovel",   color: 0x9a7b4a, tool:"shovel", tier:1 },
  110: { name: "Stone Shovel",  color: 0x8a8a8a, tool:"shovel", tier:2 },
  111: { name: "Iron Shovel",   color: 0xd8d8d8, tool:"shovel", tier:3 },
  112: { name: "Wood Axe",  color: 0x9a7b4a, tool:"axe", tier:1 },
  113: { name: "Stone Axe", color: 0x8a8a8a, tool:"axe", tier:2 },
  114: { name: "Iron Axe",  color: 0xd8d8d8, tool:"axe", tier:3 },
  115: { name: "String",  color: 0xe0e0e0 },
  116: { name: "Paper",   color: 0xf4f0e0 },
  117: { name: "Book",    color: 0x8a3a3a },
  118: { name: "Flint",   color: 0x3a3a3a },
  119: { name: "Brick Item", color: 0x9c4a3a },
  120: { name: "Charcoal", color: 0x3a3a3a },
  121: { name: "Red Dye",    color: 0xb03030 },
  122: { name: "Blue Dye",   color: 0x3050b0 },
  123: { name: "Green Dye",  color: 0x40904a },
  124: { name: "Yellow Dye", color: 0xe0c040 },
  125: { name: "Black Dye",  color: 0x2a2a2a },
  126: { name: "White Dye",  color: 0xf0f0f0 },
  130: { name: "Apple",       color: 0xd83030, food:4, heal:0 },
  131: { name: "Berries",     color: 0x9c2050, food:2, heal:0 },
  132: { name: "Mushroom",    color: 0xc08050, food:2, heal:0 },
  133: { name: "Raw Meat",    color: 0xc06858, food:2, heal:0 },
  134: { name: "Cooked Meat", color: 0x9a5030, food:6, heal:1 },
  135: { name: "Bread",       color: 0xc8a050, food:5, heal:0 },
  136: { name: "Wheat",       color: 0xd8c060 },
  137: { name: "Golden Apple",color: 0xf2d24a, food:8, heal:6 },
  138: { name: "Wheat Seeds", color: 0x8a7a50 },
  140: { name: "Wood Hoe",     color: 0x9a7b4a, tool: "hoe", tier: 1 },
  141: { name: "Stone Hoe",    color: 0x8a8a8a, tool: "hoe", tier: 2 },
  142: { name: "Iron Hoe",     color: 0xd8d8d8, tool: "hoe", tier: 3 },
  143: { name: "Diamond Shovel",color: 0x6fe6e0, tool: "shovel", tier: 4 },
  144: { name: "Diamond Axe",   color: 0x6fe6e0, tool: "axe", tier: 4 },
  145: { name: "Diamond Hoe",   color: 0x6fe6e0, tool: "hoe", tier: 4 },
};

// Automatically assign id property to all ITEMS entries for safe reference
for (const id in ITEMS) {
  if (ITEMS[id]) ITEMS[id].id = Number(id);
}

export function isFood(id){ return Boolean(id > 0 && ITEMS[id] && typeof ITEMS[id].food === 'number' && ITEMS[id].food > 0); }
export function thingName(id){ 
  if(!id) return "Air";
  return (BLOCKS[id] && BLOCKS[id].name) || (ITEMS[id] && ITEMS[id].name) || "?"; 
}
export function thingColor(id, face=0){
  const b=BLOCKS[id];
  if(b){
    if(b.all!==undefined) return b.all;
    if(face===0) return b.top!==undefined?b.top:0x888888;
    if(face===1) return b.bottom!==undefined?b.bottom:(b.side!==undefined?b.side:b.top!==undefined?b.top:0x888888);
    return b.side!==undefined?b.side:0x888888;
  }
  const it=ITEMS[id];
  if(it) return it.color||0x888888;
  return 0x888888;
}
export function isPlaceable(id){ return Boolean(BLOCKS[id] && id < 90); }
export function isTool(id){ return Boolean(ITEMS[id] && ITEMS[id].tool); }

// ---- Recipes ----------------------------------------------------------------
export const RECIPES = [];
(function buildRecipes(){
  const R=(inp,out,qty,name,hint)=> RECIPES.push({in:inp,out,qty,name,hint});

  const woods=[[5,7,"Oak"],[22,31,"Birch"],[23,32,"Spruce"]];
  for(const [log,plank,label] of woods)
    R({[log]:1}, plank, 4, `${label} Planks`, `1 ${label} Wood → 4 Planks`);

  for(const [,plank,label] of woods)
    R({[plank]:2}, 100, 4, `Sticks (${label})`, `2 ${label} Planks → 4 Sticks`);

  R({11:1},101,1,"Coal","Coal Ore → Coal");
  R({12:1},102,1,"Iron Ingot","Iron Ore → Iron Ingot");
  R({13:1},103,1,"Gold Ingot","Gold Ore → Gold Ingot");
  R({14:1},104,1,"Diamond","Diamond Ore → Diamond");
  R({4:1},9,1,"Glass","Sand → Glass (smelt)");
  R({27:1},118,1,"Flint","Gravel → Flint");
  R({28:1},36,1,"Terracotta","Clay → Terracotta (smelt)");
  R({15:1},40,1,"Smooth Stone","Cobble → Smooth Stone (smelt)");
  R({23:1},120,1,"Charcoal","Spruce Wood → Charcoal (smelt)");
  R({28:2},119,2,"Brick Item","2 Clay → 2 Bricks (smelt)");

  R({3:1},15,1,"Cobble","Stone → Cobble");
  R({15:4},16,4,"Stone Brick","4 Cobble → 4 Stone Bricks");
  R({16:1,6:1},17,1,"Mossy Brick","Stone Brick + Leaves → Mossy");
  R({40:4},16,4,"Stone Brick (smooth)","4 Smooth Stone → 4 Bricks");
  
  const polish=[[24,33,"Granite"],[25,34,"Andesite"],[26,35,"Diorite"]];
  for(const [raw,pol,label] of polish)
    R({[raw]:4}, pol, 4, `Polished ${label}`, `4 ${label} → 4 Polished`);

  R({4:4},18,4,"Sandstone","4 Sand → 4 Sandstone");
  R({18:4},39,4,"Chiseled Sandstone","4 Sandstone → 4 Chiseled");
  R({10:1,101:1},19,1,"Dark Brick","Brick Block + Coal → Dark Brick");
  R({119:4},10,1,"Brick Block","4 Brick Items → Brick Block");

  R({29:4},38,4,"Packed Snow","4 Snow → 4 Packed Snow");

  R({100:1,101:1},20,4,"Torch (coal)","Stick + Coal → 4 Torches");
  R({100:1,120:1},20,4,"Torch (charcoal)","Stick + Charcoal → 4 Torches");
  R({103:4},21,1,"Glowstone","4 Gold Ingots → Glowstone");

  for(const [mat,label] of SHAPE_SOURCE){
    if(STAIR_ID[mat]) R({[mat]:6}, STAIR_ID[mat], 4, `${label} Stairs`, `6 ${label} → 4 Stairs`);
    if(SLAB_ID[mat])  R({[mat]:3}, SLAB_ID[mat],  6, `${label} Slab`,   `3 ${label} → 6 Slabs`);
    if(WALL_ID[mat])  R({[mat]:6,100:1}, WALL_ID[mat], 6, `${label} Wall`, `6 ${label} + Stick → 6 Walls`);
    if(SLAB_ID[mat])  R({[SLAB_ID[mat]]:2}, mat, 1, `${label} (from slabs)`, `2 Slabs → 1 ${label}`);
  }

  R({7:4},41,1,"Crafting Table","4 Planks → Crafting Table");
  R({15:8},42,1,"Furnace","8 Cobble → Furnace");
  R({7:8},43,1,"Chest","8 Planks → Chest");
  R({6:3},116,3,"Paper","3 Leaves → 3 Paper");
  R({116:3,115:1},117,1,"Book","3 Paper + String → Book");
  R({117:3,7:6},44,1,"Bookshelf","3 Books + 6 Planks → Bookshelf");
  R({100:7},45,3,"Ladder","7 Sticks → 3 Ladders");
  R({9:6},49,16,"Glass Pane","6 Glass → 16 Panes");

  R({102:9},46,1,"Iron Block","9 Iron Ingots → Iron Block");
  R({103:9},47,1,"Gold Block","9 Gold Ingots → Gold Block");
  R({104:9},48,1,"Diamond Block","9 Diamonds → Diamond Block");
  R({46:1},102,9,"Iron (uncompress)","Iron Block → 9 Ingots");
  R({47:1},103,9,"Gold (uncompress)","Gold Block → 9 Ingots");
  R({48:1},104,9,"Diamond (uncompress)","Diamond Block → 9 Diamonds");

  R({136:3}, 135, 1, "Bread", "3 Wheat → Bread");

  const toolMats=[[7,"Wood"],[15,"Stone"],[102,"Iron"],[104,"Diamond"]];
  const pick=[105,106,107,108], shov=[109,110,111,143], axe=[112,113,114,144], hoe=[140,141,142,145];
  toolMats.forEach(([mat,label],ti)=>{
    if(pick[ti]) R({[mat]:3,100:2}, pick[ti], 1, `${label} Pickaxe`, `3 ${label} + 2 Sticks`);
    if(shov[ti]) R({[mat]:1,100:2}, shov[ti], 1, `${label} Shovel`, `1 ${label} + 2 Sticks`);
    if(axe[ti])  R({[mat]:3,100:3}, axe[ti], 1, `${label} Axe`, `3 ${label} + 3 Sticks`);
    if(hoe[ti])  R({[mat]:2,100:2}, hoe[ti], 1, `${label} Hoe`, `2 ${label} + 2 Sticks`);
  });

  R({6:1},123,1,"Green Dye","Leaves → Green Dye");
  R({101:1},125,1,"Black Dye","Coal → Black Dye");
  R({29:1},126,1,"White Dye","Snow → White Dye");
  R({4:2},124,1,"Yellow Dye","2 Sand → Yellow Dye (ochre)");
  R({119:1},121,1,"Red Dye","Brick → Red Dye");
  
  R({115:4},50,1,"White Wool","4 String → White Wool");
  const woolDye=[[121,51,"Red"],[122,52,"Blue"],[123,53,"Green"],[124,54,"Yellow"],[125,55,"Black"]];
  for(const [dye,wool,label] of woolDye)
    R({50:1,[dye]:1}, wool, 1, `${label} Wool`, `White Wool + ${label} Dye`);

  R({6:2},115,2,"String","2 Leaves → 2 String");

  R({130:1,103:4},137,1,"Golden Apple","Apple + 4 Gold → Golden Apple");

  for(const [pid,label] of FENCE_SOURCE){
    if(FENCE_ID[pid]) R({[pid]:2,100:4}, FENCE_ID[pid], 3, `${label} Fence`, `2 Planks + 4 Sticks → 3 Fences`);
    if(GATE_ID[pid])  R({[pid]:4,100:2}, GATE_ID[pid], 1, `${label} Gate`, `4 Planks + 2 Sticks → Gate`);
    if(TRAPDOOR_ID[pid]) R({[pid]:4,102:1}, TRAPDOOR_ID[pid], 2, `${label} Trapdoor`, `4 Planks + Iron → 2 Trapdoors`);
  }
  
  for(const [pid,label] of WOOL_IDS){
    if(CARPET_ID[pid]) R({[pid]:3}, CARPET_ID[pid], 4, `${label} Carpet`, `3 ${label} Wool → 4 Carpet`);
  }
  
  for(const [color,label,dye] of GLASS_COLORS){
    const gid=STAINGLASS_ID[dye];
    if(gid){
      R({9:8,[dye]:1}, gid, 8, `${label} Glass`, `8 Glass + ${label} Dye → 8`);
      const pane=STAINPANE_ID[gid];
      if(pane) R({[gid]:6}, pane, 16, `${label} Glass Pane`, `6 ${label} Glass → 16 Panes`);
    }
  }
})();

export function resolveRecipe(bag){
  const bKeys = Object.keys(bag).filter(id => bag[id] > 0);
  for(const r of RECIPES){
    const rIds = Object.keys(r.in);
    if(rIds.length !== bKeys.length) continue;
    let ok = true;
    for(const id of rIds){ if((bag[id]||0) < r.in[id]){ ok = false; break; } }
    if(ok) return r;
  }
  return null;
}

export function craftableRecipes(inv){
  return RECIPES.map(r=>({ recipe:r, canMake: Object.keys(r.in).every(id=>(inv[id]||0)>=r.in[id]) }));
}

export function faceColor(id, face){
  const b = BLOCKS[id];
  if (!b) return 0xff00ff;
  if (b.all !== undefined) return b.all;
  if (face===0) return b.top!==undefined?b.top:0x888888;
  if (face===1) return b.bottom!==undefined?(b.bottom):(b.side!==undefined?b.side:b.top!==undefined?b.top:0x888888);
  return b.side!==undefined?b.side:0x888888;
}

export function isSolid(id){ return Boolean(id !== AIR && BLOCKS[id] && BLOCKS[id].solid); }
export function isOpaque(id){ return Boolean(id !== AIR && BLOCKS[id] && !BLOCKS[id].alpha && !BLOCKS[id].cutout); }

// ---- Texture Atlas Config ----
export const TILE = 16;
export const ATLAS_COLS = 8;
export const TILE_NAMES = [
  "grass_top","grass_side","dirt","stone","sand",
  "wood_top","wood_side","leaves","plank","water","glass","brick",
  "coal_ore","iron_ore","gold_ore","diamond_ore",
  "cobble","stone_brick","mossy_brick","sandstone","dark_brick",
  "torch","glowstone",
  "birch_top","birch_side","spruce_top","spruce_side",
  "granite","andesite","diorite","gravel","clay","snow","obsidian",
  "birch_plank","spruce_plank","pol_granite","pol_andesite","pol_diorite",
  "terracotta","ice","packed_snow","chiseled_sandstone","smooth_stone",
  "craft_top","craft_side","furnace_top","furnace_side","chest_top","chest_side",
  "bookshelf","ladder","iron_block","gold_block","diamond_block","glass_pane",
  "wool_white","wool_red","wool_blue","wool_green","wool_yellow","wool_black"
];
export const TILE_IDX = {}; TILE_NAMES.forEach((n,i)=>TILE_IDX[n]=i);
export const ATLAS_ROWS = Math.ceil(TILE_NAMES.length/ATLAS_COLS);

export const BLOCK_TILES = {
  1:{top:"grass_top", bottom:"dirt", side:"grass_side"},
  2:{all:"dirt"}, 3:{all:"stone"}, 4:{all:"sand"},
  5:{top:"wood_top", bottom:"wood_top", side:"wood_side"},
  6:{all:"leaves"}, 7:{all:"plank"}, 8:{all:"water"},
  9:{all:"glass"}, 10:{all:"brick"},
  11:{all:"coal_ore"}, 12:{all:"iron_ore"}, 13:{all:"gold_ore"}, 14:{all:"diamond_ore"},
  15:{all:"cobble"}, 16:{all:"stone_brick"}, 17:{all:"mossy_brick"},
  18:{all:"sandstone"}, 19:{all:"dark_brick"}, 20:{all:"torch"}, 21:{all:"glowstone"},
  22:{top:"birch_top",side:"birch_side",bottom:"birch_top"},
  23:{top:"spruce_top",side:"spruce_side",bottom:"spruce_top"},
  24:{all:"granite"}, 25:{all:"andesite"}, 26:{all:"diorite"},
  27:{all:"gravel"}, 28:{all:"clay"}, 29:{all:"snow"}, 30:{all:"obsidian"},
  31:{all:"birch_plank"}, 32:{all:"spruce_plank"},
  33:{all:"pol_granite"}, 34:{all:"pol_andesite"}, 35:{all:"pol_diorite"},
  36:{all:"terracotta"}, 37:{all:"ice"}, 38:{all:"packed_snow"},
  39:{all:"chiseled_sandstone"}, 40:{all:"smooth_stone"},
  41:{top:"craft_top",side:"craft_side",bottom:"plank"},
  42:{top:"furnace_top",side:"furnace_side",bottom:"furnace_side"},
  43:{top:"chest_top",side:"chest_side",bottom:"chest_side"},
  44:{top:"plank",side:"bookshelf",bottom:"plank"},
  45:{all:"ladder"},
  46:{all:"iron_block"}, 47:{all:"gold_block"}, 48:{all:"diamond_block"},
  49:{all:"glass_pane"},
  50:{all:"wool_white"}, 51:{all:"wool_red"}, 52:{all:"wool_blue"},
  53:{all:"wool_green"}, 54:{all:"wool_yellow"}, 55:{all:"wool_black"},
  89:{top:"dirt",side:"dirt",bottom:"dirt"},
  90:{all:"leaves"}, 91:{all:"leaves"}, 92:{all:"leaves"}
};

export function tileFor(id, face){
  let t = BLOCK_TILES[id];
  if (!t && VARIANTS[id]) {
    t = BLOCK_TILES[VARIANTS[id].parent];
  }
  if (!t) {
    const b = BLOCKS[id];
    if (b && b.tintTile) return b.tintTile;
    return "stone";
  }
  
  if (t.all) return t.all;
  if (face === 0) return t.top || t.side || t.all || "stone";
  if (face === 1) return t.bottom || t.side || t.top || t.all || "stone";
  return t.side || t.top || t.all || "stone";
}

export function tileUV(name){
  const i=TILE_IDX[name]!==undefined?TILE_IDX[name]:(TILE_IDX.stone||0);
  const col=i%ATLAS_COLS, row=(i/ATLAS_COLS)|0;
  const inset=0.01/TILE;
  const u0=col/ATLAS_COLS + inset, u1=(col+1)/ATLAS_COLS - inset;
  const v0=1-((row+1)/ATLAS_ROWS) + inset, v1=1-(row/ATLAS_ROWS) - inset;
  return {u0,u1,v0,v1};
}

export function trng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
export function shade(hex,f){
  const factor = Math.max(0, Math.min(1.5, f));
  const r=Math.min(255,((hex>>16)&255)*factor)|0, g=Math.min(255,((hex>>8)&255)*factor)|0, b=Math.min(255,(hex&255)*factor)|0;
  return `rgb(${r},${g},${b})`;
}

// ---- World generation configs ----
export const CHUNK = 16;
export const HEIGHT = 48;
export const RENDER_DIST = 5;
export const SEED = 1337;
export const SEA = 12;

export function keyOf(cx, cz){ return cx + "," + cz; }

export function hash2(x, z, s){
  let h = (Math.imul(x,374761393) + Math.imul(z,668265263) + Math.imul(s,2246822519|0)) >>> 0;
  h = Math.imul(h ^ (h>>>13), 1274126177) >>> 0;
  return ((h ^ (h>>>16)) >>> 0) / 4294967296;
}
export function smooth(t){ return t*t*(3-2*t); }
export function vnoise(x, z, s){
  const xi=Math.floor(x), zi=Math.floor(z);
  const xf=x-xi, zf=z-zi;
  const v00=hash2(xi,zi,s),   v10=hash2(xi+1,zi,s);
  const v01=hash2(xi,zi+1,s), v11=hash2(xi+1,zi+1,s);
  const u=smooth(xf), v=smooth(zf);
  return (v00*(1-u)+v10*u)*(1-v) + (v01*(1-u)+v11*u)*v;
}
export function fbm(x, z){
  let a=0, amp=1, freq=1, norm=0;
  for(let o=0;o<4;o++){ a += vnoise(x*freq*0.05, z*freq*0.05, SEED+o)*amp; norm+=amp; amp*=0.5; freq*=2; }
  return a/norm;
}
export function hash3(x,y,z,s){
  let h=(Math.imul(x,374761393) + Math.imul(y,668265263) + Math.imul(z,2246822519|0) + Math.imul(s,3266489917|0))>>>0;
  h=Math.imul(h^(h>>>13), 1274126177)>>>0;
  return ((h^(h>>>16))>>>0)/4294967296;
}
export function vnoise3(x,y,z,s){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);
  const xf=Math.max(0, Math.min(1, x-xi)), yf=Math.max(0, Math.min(1, y-yi)), zf=Math.max(0, Math.min(1, z-zi));
  const u=smooth(xf),v=smooth(yf),w=smooth(zf);
  function L(a,b,t){return a+(b-a)*t;}
  const c000=hash3(xi,yi,zi,s),   c100=hash3(xi+1,yi,zi,s);
  const c010=hash3(xi,yi+1,zi,s), c110=hash3(xi+1,yi+1,zi,s);
  const c001=hash3(xi,yi,zi+1,s), c101=hash3(xi+1,yi,zi+1,s);
  const c011=hash3(xi,yi+1,zi+1,s),c111=hash3(xi+1,yi+1,zi+1,s);
  const x00=L(c000,c100,u), x10=L(c010,c110,u), x01=L(c001,c101,u), x11=L(c011,c111,u);
  const y0=L(x00,x10,v), y1=L(x01,x11,v);
  return L(y0,y1,w);
}
export function isCave(wx,wy,wz){
  const maxH = surfaceHeight(wx, wz);
  if(wy < 3 || wy > Math.min(maxH - 2, SEA + 24)) return false;
  const a=vnoise3(wx*0.09, wy*0.14, wz*0.09, SEED+11);
  const b=vnoise3(wx*0.09, wy*0.14, wz*0.09, SEED+22);
  return Math.abs(a-0.5)<0.09 && Math.abs(b-0.5)<0.12;
}
export function surfaceHeight(wx, wz){
  const base = fbm(wx, wz);
  return Math.floor(6 + base*22);
}
