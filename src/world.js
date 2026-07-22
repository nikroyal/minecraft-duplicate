import * as THREE from 'three';
import { world, player, webgl, game, inventory, crops } from './state.js';
import { uiState, setChestOpen, setFurnaceOpen } from './ui.js';
import { 
  CHUNK, HEIGHT, RENDER_DIST, SEA, SEED, MAX_LIGHT, AIR, BLOCKS, VARIANTS, ITEMS,
  keyOf, hash2, hash3, vnoise3, surfaceHeight, isCave,
  isSolid, isOpaque, tileFor, tileUV, trng, shade, TILE, ATLAS_COLS, ATLAS_ROWS
} from './config.js';

// Streaming queue
export let genQueue = [];

export class Chunk {
  constructor(cx, cz){
    this.cx=cx; this.cz=cz;
    this.data = new Uint8Array(CHUNK*HEIGHT*CHUNK);
    this.light = new Uint8Array(CHUNK*HEIGHT*CHUNK); // 0..15 light level per block
    this.opaqueMesh=null; this.cutoutMesh=null; this.waterMesh=null; this.alphaMesh=null;
    this.dirty=true; this.generated=false; this.lit=false;
  }
  idx(x,y,z){ return (y*CHUNK + z)*CHUNK + x; }
  get(x,y,z){
    if(x<0||x>=CHUNK||z<0||z>=CHUNK||y<0||y>=HEIGHT) return AIR;
    return this.data[this.idx(x,y,z)];
  }
  set(x,y,z,v){
    if(x>=0&&x<CHUNK&&z>=0&&z<CHUNK&&y>=0&&y<HEIGHT) this.data[this.idx(x,y,z)] = v;
  }
  getLight(x,y,z){
    if(y<0) return 0;
    if(y>=HEIGHT) return MAX_LIGHT;
    if(x<0||x>=CHUNK||z<0||z>=CHUNK) {
      const wx = this.cx * CHUNK + x;
      const wz = this.cz * CHUNK + z;
      return getLightGlobal(wx, y, wz);
    }
    return this.light[this.idx(x,y,z)];
  }
  setLight(x,y,z,v){
    if(x>=0&&x<CHUNK&&z>=0&&z<CHUNK&&y>=0&&y<HEIGHT) this.light[this.idx(x,y,z)] = v;
  }
}

function oreAt(wx,wy,wz){
  const r=hash3(wx,wy,wz,SEED+300);
  const vein=vnoise3(wx*0.18, wy*0.18, wz*0.18, SEED+301);
  if(vein<0.55) return 0;                 // most stone stays plain
  if(wy<8){
    if(r>0.97) return 14;                  // diamond (deep, rare)
    if(r>0.90) return 13;                  // gold
    if(r>0.75) return 12;                  // iron
    if(r>0.45) return 11;                  // coal
  } else if(wy<16){
    if(r>0.92) return 13;                  // gold
    if(r>0.75) return 12;                  // iron
    if(r>0.45) return 11;                  // coal
  } else {
    if(r>0.72) return 12;                  // iron
    if(r>0.42) return 11;                  // coal
  }
  return 0;
}

function carveStructures(ch, ox, oz){
  const key=hash2(ch.cx, ch.cz, SEED+500);
  // ~8% of chunks get a hidden cavern
  if(key>0.92){
    const cxl=4+((hash2(ch.cx,ch.cz,1)*8)|0);
    const czl=4+((hash2(ch.cx,ch.cz,2)*8)|0);
    const cy =6+((hash2(ch.cx,ch.cz,3)*8)|0);
    const rad=3+((hash2(ch.cx,ch.cz,4)*3)|0);
    for(let dx=-rad;dx<=rad;dx++)
    for(let dy=-rad;dy<=rad;dy++)
    for(let dz=-rad;dz<=rad;dz++){
      if(dx*dx+dy*dy*1.4+dz*dz > rad*rad) continue;
      const x=cxl+dx, y=cy+dy, z=czl+dz;
      if(x>=0&&x<CHUNK&&z>=0&&z<CHUNK&&y>=1&&y<HEIGHT) ch.set(x,y,z,AIR);
    }
    // glowstone cluster on the cavern floor as a reward/landmark
    const fx=cxl, fz=czl, fy=cy-rad+1;
    if(fx>=0&&fx<CHUNK&&fz>=0&&fz<CHUNK&&fy>=1&&fy<HEIGHT){
      ch.set(fx,fy,fz,21);
      if(fx+1<CHUNK) ch.set(fx+1,fy,fz,21);
    }
  }
}

export function getChunk(cx,cz){ return world.chunks.get(keyOf(cx,cz)); }

export function generateChunk(ch){
  const ox = ch.cx*CHUNK, oz = ch.cz*CHUNK;
  for(let x=0;x<CHUNK;x++){
    for(let z=0;z<CHUNK;z++){
      const wx=ox+x, wz=oz+z;
      const h = surfaceHeight(wx, wz);
      for(let y=0;y<=Math.max(h,SEA);y++){
        let b=AIR;
        if(y===0){
          b=30; // Bedrock / Obsidian bottom layer to prevent falling through map
        } else if(y<=h){
          if(y===h){ b = (h<=SEA+1)?4:1; }        // sand near water, else grass
          else if(y>h-4) b=2;                       // dirt
          else b=3;                                 // stone
        } else if(y<=SEA){
          b=8; // water
          if(y===SEA || x===0 || x===CHUNK-1 || z===0 || z===CHUNK-1 || y===h+1){
            queueWater(wx, y, wz);
          }
        }
        
        // carve caves (keep bedrock intact)
        if(b!==AIR && b!==8 && b!==30 && y<h && isCave(wx,y,wz)){ b=AIR; }
        
        // ores in stone
        if(b===3){
          const ore=oreAt(wx,y,wz);
          if(ore) b=ore;
        }
        if(b!==AIR) ch.set(x,y,z,b);
      }
      
      // trees
      if(h>SEA+1 && ch.get(x,h,z)===1){
        const r = hash2(wx, wz, SEED+99);
        if(r>0.985 && x>1 && x<CHUNK-2 && z>1 && z<CHUNK-2){
          const th = 4 + Math.floor(hash2(wx,wz,7)*2);
          for(let t=1;t<=th;t++) ch.set(x,h+t,z,5);
          for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=th-1;dy<=th+1;dy++){
            if(Math.abs(dx)+Math.abs(dz) + Math.max(0,dy-th) <=3){
              const lx=x+dx, lz=z+dz, ly=h+dy;
              if(lx>=0&&lx<CHUNK&&lz>=0&&lz<CHUNK&&ly<HEIGHT&&ch.get(lx,ly,lz)===AIR)
                ch.set(lx,ly,lz,6);
            }
          }
        }
      }
    }
  }
  
  // pre-made structures
  carveStructures(ch, ox, oz);
  
  // apply persisted edits
  for(const k in world.edits){
    const [ex,ey,ez]=k.split(",").map(Number);
    if(Math.floor(ex/CHUNK)===ch.cx && Math.floor(ez/CHUNK)===ch.cz){
      const lx=((ex%CHUNK)+CHUNK)%CHUNK, lz=((ez%CHUNK)+CHUNK)%CHUNK;
      if(ey>=0&&ey<HEIGHT) ch.set(lx,ey,lz,world.edits[k]);
    }
  }
  ch.generated=true;
}

export function getBlock(wx,wy,wz){
  if(wy<0||wy>=HEIGHT) return AIR;
  const cx=Math.floor(wx/CHUNK), cz=Math.floor(wz/CHUNK);
  const ch=getChunk(cx,cz);
  if(!ch||!ch.generated) return AIR;
  const lx=((wx%CHUNK)+CHUNK)%CHUNK, lz=((wz%CHUNK)+CHUNK)%CHUNK;
  return ch.get(lx,wy,lz);
}

export function setBlock(wx,wy,wz,v, record, scheduleSaveCallback){
  const cx=Math.floor(wx/CHUNK), cz=Math.floor(wz/CHUNK);
  const ch=getChunk(cx,cz);
  if(!ch) return;
  const lx=((wx%CHUNK)+CHUNK)%CHUNK, lz=((wz%CHUNK)+CHUNK)%CHUNK;
  
  const prev = ch.get(lx, wy, lz);
  if (prev === 8 && v !== 8) {
    delete flowDist[wkey(wx, wy, wz)];
  }

  const key = wx + "," + wy + "," + wz;
  if (crops && crops[key]) {
    delete crops[key];
  }
  const cropAboveKey = wx + "," + (wy + 1) + "," + wz;
  if (v === 0 && crops && crops[cropAboveKey]) {
    delete crops[cropAboveKey];
  }

  if (v === 0) {
    if (prev === 43 && world.chests && world.chests[key]) {
      const slots = world.chests[key];
      delete world.chests[key];
      if (uiState.activeChestCoords === key) setChestOpen(false);
      slots.forEach(slot => {
        if (slot.id > 0 && slot.count > 0) {
          if (typeof window !== 'undefined' && typeof window.__spawnItemDrop === 'function') {
            window.__spawnItemDrop(slot.id, slot.count, wx + 0.5, wy + 0.5, wz + 0.5);
          } else {
            inventory[slot.id] = (inventory[slot.id] || 0) + slot.count;
          }
        }
      });
    }
    else if (prev === 42 && world.furnaces && world.furnaces[key]) {
      const f = world.furnaces[key];
      delete world.furnaces[key];
      if (uiState.activeFurnaceCoords === key) setFurnaceOpen(false);
      const items = [
        { id: f.inputId, count: f.inputCount },
        { id: f.fuelId, count: f.fuelCount },
        { id: f.outputId, count: f.outputCount }
      ];
      items.forEach(item => {
        if (item.id > 0 && item.count > 0) {
          if (typeof window !== 'undefined' && typeof window.__spawnItemDrop === 'function') {
            window.__spawnItemDrop(item.id, item.count, wx + 0.5, wy + 0.5, wz + 0.5);
          } else {
            inventory[item.id] = (inventory[item.id] || 0) + item.count;
          }
        }
      });
    }
  }

  ch.set(lx,wy,lz,v);
  ch.dirty=true;
  if(record){ 
    world.edits[wx+","+wy+","+wz]=v; 
    if(scheduleSaveCallback) scheduleSaveCallback(); 
  }
  
  // mark neighbours dirty if on a border
  if(lx===0)  markDirty(cx-1,cz);
  if(lx===CHUNK-1) markDirty(cx+1,cz);
  if(lz===0)  markDirty(cx,cz-1);
  if(lz===CHUNK-1) markDirty(cx,cz+1);
}

function markDirty(cx,cz){ const c=getChunk(cx,cz); if(c) c.dirty=true; }

// ---- Lighting --------------------------------------------------------------
export function lightTransparent(id){ return id===AIR || (BLOCKS[id] && BLOCKS[id].alpha); }

export function getLightGlobal(wx,wy,wz){
  if(wy<0) return 0;
  if(wy>=HEIGHT) return MAX_LIGHT;
  const ch=getChunk(Math.floor(wx/CHUNK), Math.floor(wz/CHUNK));
  if(!ch||!ch.generated) return 0;
  const lx=((wx%CHUNK)+CHUNK)%CHUNK, lz=((wz%CHUNK)+CHUNK)%CHUNK;
  return ch.getLight(lx,wy,lz);
}

export function computeChunkLight(ch){
  const ox=ch.cx*CHUNK, oz=ch.cz*CHUNK;
  ch.light.fill(0);
  const queue=[];
  
  // 1) sky light
  for(let x=0;x<CHUNK;x++)
  for(let z=0;z<CHUNK;z++){
    let sky=MAX_LIGHT;
    for(let y=HEIGHT-1;y>=0;y--){
      const id=ch.get(x,y,z);
      if(!lightTransparent(id)){ sky=0; }
      if(sky>0){ ch.setLight(x,y,z,sky); queue.push([x,y,z,sky]); }
    }
  }
  
  // 2) block light sources
  for(let y=0;y<HEIGHT;y++)
  for(let z=0;z<CHUNK;z++)
  for(let x=0;x<CHUNK;x++){
    const id=ch.get(x,y,z);
    const L=BLOCKS[id]&&BLOCKS[id].light?BLOCKS[id].light:0;
    if(L>0){ const cur=ch.getLight(x,y,z); if(L>cur){ ch.setLight(x,y,z,L); queue.push([x,y,z,L]); } }
  }
  
  // 3) seed border light
  for(let y=0;y<HEIGHT;y++){
    for(let z=0;z<CHUNK;z++){
      seedBorder(ch, -1, y, z, ox, oz, queue);
      seedBorder(ch, CHUNK, y, z, ox, oz, queue);
    }
    for(let x=0;x<CHUNK;x++){
      seedBorderZ(ch, x, y, -1, ox, oz, queue);
      seedBorderZ(ch, x, y, CHUNK, ox, oz, queue);
    }
  }
  
  // 4) BFS
  let head=0;
  while(head<queue.length){
    const [x,y,z,l]=queue[head++];
    if(l<=1) continue;
    const nl=l-1;
    const nb=[[x-1,y,z],[x+1,y,z],[x,y-1,z],[x,y+1,z],[x,y,z-1],[x,y,z+1]];
    for(const [nx,ny,nz] of nb){
      if(ny<0||ny>=HEIGHT) continue;
      if(nx<0||nx>=CHUNK||nz<0||nz>=CHUNK) continue;
      const id=ch.get(nx,ny,nz);
      if(!lightTransparent(id)) continue;
      if(ch.getLight(nx,ny,nz)<nl){ ch.setLight(nx,ny,nz,nl); queue.push([nx,ny,nz,nl]); }
    }
  }
  ch.lit=true;
}

function seedBorder(ch, lx, y, z, ox, oz, queue){
  const wx=ox+lx, wz=oz+z;
  const neighLight=getLightGlobal(wx,y,wz);
  if(neighLight<=1) return;
  const ix = lx<0?0:CHUNK-1;
  const id=ch.get(ix,y,z);
  if(!lightTransparent(id)) return;
  const nl=neighLight-1;
  if(ch.getLight(ix,y,z)<nl){ ch.setLight(ix,y,z,nl); queue.push([ix,y,z,nl]); }
}

function seedBorderZ(ch, x, y, lz, ox, oz, queue){
  const wx=ox+x, wz=oz+lz;
  const neighLight=getLightGlobal(wx,y,wz);
  if(neighLight<=1) return;
  const iz = lz<0?0:CHUNK-1;
  const id=ch.get(x,y,iz);
  if(!lightTransparent(id)) return;
  const nl=neighLight-1;
  if(ch.getLight(x,y,iz)<nl){ ch.setLight(x,y,iz,nl); queue.push([x,y,iz,nl]); }
}

export function relightAround(cx,cz){
  const c=getChunk(cx,cz); if(c&&c.generated){ computeChunkLight(c); c.dirty=true; }
  for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){
    const n=getChunk(cx+dx,cz+dz); if(n&&n.generated){ computeChunkLight(n); n.dirty=true; }
  }
}

// ---- Meshing ---------------------------------------------------------------
const FACES = [
  { n:[0,1,0], c:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]], f:0 }, // top
  { n:[0,-1,0],c:[[0,0,1],[0,0,0],[1,0,0],[1,0,1]], f:1 }, // bottom
  { n:[0,0,1], c:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]], f:2 }, // +z
  { n:[0,0,-1],c:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]], f:3 }, // -z
  { n:[1,0,0], c:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]], f:4 }, // +x
  { n:[-1,0,0], c:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]], f:5 }, // -x
];
const UV_ORDER=[[0,1],[0,0],[1,0],[1,1]];

// Vertex Ambient Occlusion (Smooth Lighting) calculation helper
function calcVertexAO(wx, wy, wz, faceNormal, cornerOffset) {
  const [nx, ny, nz] = faceNormal;
  const [cx, cy, cz] = cornerOffset;

  let dx1 = 0, dy1 = 0, dz1 = 0;
  let dx2 = 0, dy2 = 0, dz2 = 0;

  if (ny !== 0) {
    dx1 = cx === 1 ? 1 : -1;
    dz2 = cz === 1 ? 1 : -1;
  } else if (nx !== 0) {
    dy1 = cy === 1 ? 1 : -1;
    dz2 = cz === 1 ? 1 : -1;
  } else {
    dx1 = cx === 1 ? 1 : -1;
    dy2 = cy === 1 ? 1 : -1;
  }

  const s1Solid = isSolid(getBlock(wx + nx + dx1, wy + ny + dy1, wz + nz + dz1)) ? 1 : 0;
  const s2Solid = isSolid(getBlock(wx + nx + dx2, wy + ny + dy2, wz + nz + dz2)) ? 1 : 0;
  const cSolid  = isSolid(getBlock(wx + nx + dx1 + dx2, wy + ny + dy1 + dy2, wz + nz + dz1 + dz2)) ? 1 : 0;

  if (s1Solid === 1 && s2Solid === 1) return 0.48; // Corner occlusion shadow
  const count = s1Solid + s2Solid + cSolid;
  if (count === 3) return 0.55;
  if (count === 2) return 0.70;
  if (count === 1) return 0.85;
  return 1.0;
}

export function buildChunkMesh(ch){
  const ox=ch.cx*CHUNK, oz=ch.cz*CHUNK;
  const groups = {
    opaque:{pos:[],col:[],uv:[],norm:[],idx:[]},
    cutout:{pos:[],col:[],uv:[],norm:[],idx:[]},
    alpha :{pos:[],col:[],uv:[],norm:[],idx:[]},
  };

  for(let y=0;y<HEIGHT;y++)
  for(let z=0;z<CHUNK;z++)
  for(let x=0;x<CHUNK;x++){
    const id = ch.get(x,y,z);
    if(id===AIR || id===8) continue; // Water is handled by dedicated greedy meshing pass
    const bl = BLOCKS[id];
    if(!bl) continue;

    // Dedicated X-cross plant renderer for Wheat Crops (IDs 90, 91, 92)
    if (id === 90 || id === 91 || id === 92) {
      const g = groups.cutout;
      const h = id === 90 ? 0.4 : (id === 91 ? 0.75 : 1.0);
      const lvl = getLightGlobal(ox+x, y, oz+z);
      const ln = lvl / MAX_LIGHT;
      const lightB = 0.35 + Math.sqrt(ln) * 0.65;
      const warm = lvl > 8 ? (lvl - 8) / 7 : 0;
      let rC = lightB * (1 + warm * 0.12);
      let gC = lightB * (1 + warm * 0.04);
      let bC = lightB * (1 - warm * 0.08);

      const cropColor = id === 90 ? 0x7a6a4a : (id === 91 ? 0x50a040 : 0xd8c060);
      rC *= ((cropColor >> 16) & 255) / 255;
      gC *= ((cropColor >> 8) & 255) / 255;
      bC *= (cropColor & 255) / 255;

      const uv = tileUV("leaves");

      // Diagonal Quad 1
      const b1 = g.pos.length / 3;
      g.pos.push(ox+x, y, oz+z,  ox+x+1, y, oz+z+1,  ox+x+1, y+h, oz+z+1,  ox+x, y+h, oz+z);
      g.col.push(rC,gC,bC, rC,gC,bC, rC,gC,bC, rC,gC,bC);
      g.norm.push(0.707, 0, 0.707, 0.707, 0, 0.707, 0.707, 0, 0.707, 0.707, 0, 0.707);
      g.uv.push(uv.u0,uv.v0, uv.u1,uv.v0, uv.u1,uv.v1, uv.u0,uv.v1);
      g.idx.push(b1,b1+1,b1+2, b1,b1+2,b1+3, b1+2,b1+1,b1, b1+3,b1+2,b1);

      // Diagonal Quad 2
      const b2 = g.pos.length / 3;
      g.pos.push(ox+x+1, y, oz+z,  ox+x, y, oz+z+1,  ox+x, y+h, oz+z+1,  ox+x+1, y+h, oz+z);
      g.col.push(rC,gC,bC, rC,gC,bC, rC,gC,bC, rC,gC,bC);
      g.norm.push(-0.707, 0, 0.707, -0.707, 0, 0.707, -0.707, 0, 0.707, -0.707, 0, 0.707);
      g.uv.push(uv.u0,uv.v0, uv.u1,uv.v0, uv.u1,uv.v1, uv.u0,uv.v1);
      g.idx.push(b2,b2+1,b2+2, b2,b2+2,b2+3, b2+2,b2+1,b2, b2+3,b2+2,b2);
      continue;
    }

    const alpha = bl.alpha;
    const g = bl.cutout ? groups.cutout : (alpha ? groups.alpha : groups.opaque);

    // Compute preferred mounting wall face for ladders
    let wallFace = 3;
    if (id === 45) {
      if (isSolid(getBlock(ox+x, y, oz+z-1))) wallFace = 3;
      else if (isSolid(getBlock(ox+x-1, y, oz+z))) wallFace = 5;
      else if (isSolid(getBlock(ox+x+1, y, oz+z))) wallFace = 4;
      else if (isSolid(getBlock(ox+x, y, oz+z+1))) wallFace = 2;
    }

    for(const F of FACES){
      const nx=x+F.n[0], ny=y+F.n[1], nz=z+F.n[2];
      const neigh = getBlock(ox+nx, ny, oz+nz);
      let draw;
      if(id === 20) {
        draw = true; // Torch post
      } else if(id === 45) {
        draw = (F.f === wallFace); // Ladder
      } else if(id === 49 || bl.shape === "pane") {
        draw = (F.f === 3 || F.f === 5); // Glass pane
      } else if(id === 8) { // WATER
        if(neigh === 8 || isOpaque(neigh)) draw = false; // Don't draw inner water-to-water faces or faces touching solid opaque terrain
        else draw = true; // Draw water face against air or non-water transparent blocks
      } else if(bl.shape) {
        draw = true; // Always draw faces for custom shaped blocks (slabs, carpets, trapdoors, stairs, fences)
      } else if(alpha){
        if(neigh===AIR) draw=true;
        else if(isOpaque(neigh)) draw=false;
        else draw = (neigh!==id);
      } else {
        draw = !isOpaque(neigh);
      }
      if(!draw) continue;

      const base = g.pos.length/3;
      const dirS = F.f===0?1.0 : F.f===1?0.5 : (F.f===2||F.f===3)?0.82:0.68;
      const useOwnLight = (id === 20 || id === 45 || id === 49 || Boolean(bl.shape));
      const lvl = useOwnLight ? getLightGlobal(ox+x, y, oz+z) : getLightGlobal(ox+nx, ny, oz+nz);
      const ln = lvl/MAX_LIGHT;
      const lightB = 0.35 + Math.sqrt(ln)*0.65;
      const warm = lvl>8 ? (lvl-8)/7 : 0;
      const s = dirS*lightB;
      let rC = s*(1+warm*0.12), gC = s*(1+warm*0.04), bC = s*(1-warm*0.08);
      
      if(bl.tint!==undefined){
        rC *= ((bl.tint>>16)&255)/255; gC *= ((bl.tint>>8)&255)/255; bC *= (bl.tint&255)/255;
      }
      
      const uv = tileUV(tileFor(id, F.f));
      
      for(let k=0;k<4;k++){
        const c=F.c[k];
        let px = ox+x+c[0];
        let py = y+c[1];
        let pz = oz+z+c[2];

        // Sloped flowing water & sub-block geometry adjustments
        if (id === 8) {
          const dist = waterFlowDist(ox+x, y, oz+z);
          const topNeigh = getBlock(ox+x, y+1, oz+z);
          if (topNeigh !== 8 && c[1] === 1) {
            const hFactor = dist === 0 ? 1.0 : Math.max(0.25, 0.88 - dist * 0.12);
            py = y + hFactor;
          }
        } else if (id === 20) {
          px = ox + x + 0.4375 + c[0]*0.125;
          py = y + c[1]*0.625;
          pz = oz + z + 0.4375 + c[2]*0.125;
        } else if (id === 45) {
          if (F.f === 3) pz = oz + z + 0.05;
          if (F.f === 2) pz = oz + z + 0.95;
          if (F.f === 5) px = ox + x + 0.05;
          if (F.f === 4) px = ox + x + 0.95;
        } else if (id === 49 || bl.shape === "pane") {
          if (F.f === 3) pz = oz + z + 0.5;
          if (F.f === 2) pz = oz + z + 0.5;
          if (F.f === 5) px = ox + x + 0.5;
          if (F.f === 4) px = ox + x + 0.5;
        } else if (bl.shape === "slab") {
          if (c[1] === 1) py = y + 0.5;
        } else if (bl.shape === "carpet") {
          if (c[1] === 1) py = y + 0.0625;
        } else if (bl.shape === "trapdoor") {
          if (c[1] === 1) py = y + 0.1875;
        } else if (bl.shape === "wall" || bl.shape === "fence" || bl.shape === "gate") {
          px = ox + x + 0.375 + c[0]*0.25;
          pz = oz + z + 0.375 + c[2]*0.25;
        } else if (bl.shape === "stairs") {
          if (c[1] === 1 && c[2] === 0) py = y + 0.5;
        }

        // Apply Ambient Occlusion shadow per vertex
        const aoMult = calcVertexAO(ox+x, y, oz+z, F.n, c);
        let finalR = rC * aoMult;
        let finalG = gC * aoMult;
        let finalB = bC * aoMult;

        if (id === 8) {
          // Vibrant water color filter
          finalR *= 0.35;
          finalG *= 0.65;
          finalB *= 0.98;
        }

        g.pos.push(px, py, pz);
        g.col.push(finalR, finalG, finalB);
        g.norm.push(F.n[0], F.n[1], F.n[2]);
        const uc=UV_ORDER[k];
        g.uv.push(uc[0]?uv.u1:uv.u0, uc[1]?uv.v1:uv.v0);
      }
      g.idx.push(base,base+1,base+2, base,base+2,base+3);
    }
  }
  return groups;
}

// ---- Dedicated Water Renderer & Shader --------------------------------------
export function createWaterMaterial() {
  const vertexShader = `
    uniform float uTime;
    uniform bool uDebugFaces;
    attribute float aFaceType;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vFaceType;

    void main() {
      vUv = uv;
      vFaceType = aFaceType;
      vec3 pos = position;

      // Wave displacement only on top faces (normal.y > 0 = +Y normal, correct after winding fix)
      if (normal.y > 0.5) {
        float wave = sin(pos.x * 2.0 + uTime * 1.8) * cos(pos.z * 2.0 + uTime * 1.4) * 0.015;
        pos.y += wave;
      }

      vec4 worldPos = modelMatrix * vec4(pos, 1.0);
      vWorldPos = worldPos.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);

      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uCameraPos;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyColor;
    uniform vec3 uShallowColor;
    uniform vec3 uDeepColor;
    uniform float uTimeOfDay;
    uniform bool uDebugFaces;  // When true: color by face type for visual audit

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vFaceType;

    vec3 getWaterNormal(vec3 worldPos, vec3 N, float time, float faceType) {
      vec2 flowUV;
      if (faceType > 0.5 && faceType < 1.5) {
        // Vertical waterfall face (faceType==1): scroll texture downward
        flowUV = vec2(worldPos.x + worldPos.z, worldPos.y * 0.5 - time * 0.6);
      } else {
        // Top surface face (faceType==0): slowly scrolling horizontal UVs
        flowUV = worldPos.xz * 0.5 + vec2(time * 0.12, time * 0.10);
      }

      float n1 = sin(flowUV.x * 3.5 + flowUV.y * 2.8 + time * 1.2);
      float n2 = cos(flowUV.x * 4.2 - flowUV.y * 3.5 - time * 1.4);
      vec2 fineUV = flowUV * 2.2 - vec2(time * 0.4, time * 0.3);
      float n3 = sin(fineUV.x * 6.0 + fineUV.y * 5.0);

      vec2 bump = vec2(
        (n1 * 0.012 + n3 * 0.006) * abs(N.y) + (n2 * 0.012) * (1.0 - abs(N.y)),
        (n2 * 0.012 + n3 * 0.006) * abs(N.y) + (n1 * 0.012) * (1.0 - abs(N.y))
      );
      return normalize(vec3(N.x + bump.x, N.y, N.z + bump.y));
    }

    void main() {
      // DEBUG MODE: color faces by type for visual auditing
      // Top face (0) = bright green, Side face (1) = cyan, Bottom face (2) = orange
      // Any large planes appearing inside water volume = boundary desync bug
      if (uDebugFaces) {
        vec3 debugColor;
        if (vFaceType < 0.5) {
          debugColor = vec3(0.0, 1.0, 0.2);   // Green: top face (exposed surface)
        } else if (vFaceType < 1.5) {
          debugColor = vec3(0.0, 0.8, 1.0);   // Cyan: side face (waterfall/wall)
        } else {
          debugColor = vec3(1.0, 0.5, 0.0);   // Orange: bottom face
        }
        gl_FragColor = vec4(debugColor, 0.85);
        return;
      }

      vec3 V = normalize(uCameraPos - vWorldPos);
      vec3 N = getWaterNormal(vWorldPos, vNormal, uTime, vFaceType);

      // Schlick Fresnel: F0=0.02 (water IOR ~1.33)
      float dotNV = clamp(dot(N, V), 0.0, 1.0);
      float F0 = 0.02;
      float fresnel = F0 + (1.0 - F0) * pow(1.0 - dotNV, 5.0);

      float depthEst = clamp((40.0 - vWorldPos.y) * 0.025 + (1.0 - dotNV) * 0.2, 0.0, 1.0);
      vec3 baseWaterColor = mix(uShallowColor, uDeepColor, depthEst);

      float diff = max(dot(N, uSunDir), 0.35);
      vec3 litWaterColor = baseWaterColor * mix(0.80, 1.0, diff);

      vec3 colorWithReflection = mix(litWaterColor, uSkyColor, fresnel * 0.20);

      vec3 H = normalize(uSunDir + V);
      float spec = pow(max(dot(N, H), 0.0), 512.0);
      vec3 specularColor = uSunColor * spec * 0.30;

      vec3 finalColor = colorWithReflection + specularColor;
      float alpha = mix(0.40, 0.52, fresnel);

      gl_FragColor = vec4(finalColor, alpha);
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(0xfff5e0) },
      uSkyColor: { value: new THREE.Color(0x7ec0ee) },
      uShallowColor: { value: new THREE.Color(0x52d4ec) },
      uDeepColor: { value: new THREE.Color(0x2882c8) },
      uTimeOfDay: { value: 0.3 },
      uDebugFaces: { value: false },  // Toggle via window.__waterDebug = true
    },
    transparent: true,
    side: THREE.DoubleSide,   // Visible from both above AND below water surface
    depthWrite: false,
  });
}

// Dedicated Outer-Shell 6-Face Greedy Water Mesher
export function buildWaterGreedyMesh(ch) {
  const ox = ch.cx * CHUNK, oz = ch.cz * CHUNK;
  const pos = [], norm = [], uv = [], idx = [], faceType = [];

  // 1. Top (+Y) faces
  for (let y = 0; y < HEIGHT; y++) {
    const mask = new Array(CHUNK * CHUNK).fill(false);
    let hasMask = false;

    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        if (ch.get(x, y, z) === 8) {
          const topId = getBlock(ox + x, y + 1, oz + z);
          if (topId !== 8 && !isOpaque(topId)) {
            mask[z * CHUNK + x] = true;
            hasMask = true;
          }
        }
      }
    }
    if (!hasMask) continue;

    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        if (!mask[z * CHUNK + x]) continue;

        let w = 1;
        while (x + w < CHUNK && mask[z * CHUNK + (x + w)]) w++;

        let h = 1;
        let canExtend = true;
        while (z + h < CHUNK && canExtend) {
          for (let k = 0; k < w; k++) {
            if (!mask[(z + h) * CHUNK + (x + k)]) {
              canExtend = false;
              break;
            }
          }
          if (canExtend) h++;
        }

        for (let hz = 0; hz < h; hz++) {
          for (let wx = 0; wx < w; wx++) {
            mask[(z + hz) * CHUNK + (x + wx)] = false;
          }
        }

        const base = pos.length / 3;
        const yTop = y + 0.875;  // Minecraft water surface is 0.875 of block height
        // +Y top face: V0→V1→V2→V3 = (x,z)→(x,z+h)→(x+w,z+h)→(x+w,z)
        // edge1 = +Z, edge2 = +X  →  normal = Z×X = +Y ✓
        pos.push(
          ox + x,     yTop, oz + z,
          ox + x,     yTop, oz + z + h,
          ox + x + w, yTop, oz + z + h,
          ox + x + w, yTop, oz + z
        );
        norm.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0);
        uv.push(0, 0,  0, h,  w, h,  w, 0);
        faceType.push(0, 0, 0, 0);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        // Verify winding: cross product (Z×X)=(0,0,h)×(w,0,0)=(0*0-h*0, h*w-0*0, 0*0-0*w)=(0,hw,0)=+Y ✓
      }
    }
  }

  // 2. Bottom (-Y) faces
  for (let y = 0; y < HEIGHT; y++) {
    const mask = new Array(CHUNK * CHUNK).fill(false);
    let hasMask = false;

    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        if (ch.get(x, y, z) === 8) {
          const botId = getBlock(ox + x, y - 1, oz + z);
          if (botId !== 8 && !isOpaque(botId)) {
            mask[z * CHUNK + x] = true;
            hasMask = true;
          }
        }
      }
    }
    if (!hasMask) continue;

    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        if (!mask[z * CHUNK + x]) continue;

        let w = 1;
        while (x + w < CHUNK && mask[z * CHUNK + (x + w)]) w++;

        let h = 1;
        let canExtend = true;
        while (z + h < CHUNK && canExtend) {
          for (let k = 0; k < w; k++) {
            if (!mask[(z + h) * CHUNK + (x + k)]) {
              canExtend = false;
              break;
            }
          }
          if (canExtend) h++;
        }

        for (let hz = 0; hz < h; hz++) {
          for (let wx = 0; wx < w; wx++) {
            mask[(z + hz) * CHUNK + (x + wx)] = false;
          }
        }

        const base = pos.length / 3;
        // -Y bottom face: V0→V1→V2→V3 = (x,z+h)→(x+w,z+h)→(x+w,z)→(x,z)
        // edge1=(x+w,z+h)-(x,z+h)=(w,0,0)=+X, edge2=(x+w,z)-(x+w,z+h)=(0,0,-h)=-Z
        // normal = (+X)×(-Z) = -(X×Z) = -(-Y) = +... wait: X×Z=(0,-1,0)=-Y. -(-Y)=+Y. No.
        // We want -Y for bottom face. Use: edge1=+Z, edge2=+X → Z×X = +Y (wrong for -Y).
        // Correct for -Y: edge1=+X, edge2=+Z → X×Z = -Y ✓
        // So: V0=(x,z), V1=(x+w,z), V2=(x+w,z+h), V3=(x,z+h)
        pos.push(
          ox + x,     y, oz + z,
          ox + x + w, y, oz + z,
          ox + x + w, y, oz + z + h,
          ox + x,     y, oz + z + h
        );
        norm.push(0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0);
        uv.push(0, 0,  w, 0,  w, h,  0, h);
        faceType.push(2, 2, 2, 2); // face type 2 = bottom face
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }

  // 3. Side (+X & -X) vertical faces (Greedy Merged over Y and Z)
  // Side face top is capped at y+0.875 when the water block above is exposed
  // (top neighbour is not water), to match the water surface height.
  for (const nx of [1, -1]) {
    for (let x = 0; x < CHUNK; x++) {
      const mask = new Array(HEIGHT * CHUNK).fill(false);
      // surfaceRow[y*CHUNK+z] = true when block at (x,y,z) is the topmost water layer
      const surfaceRow = new Array(HEIGHT * CHUNK).fill(false);
      let hasMask = false;

      for (let y = 0; y < HEIGHT; y++) {
        for (let z = 0; z < CHUNK; z++) {
          if (ch.get(x, y, z) === 8) {
            const neighId = getBlock(ox + x + nx, y, oz + z);
            if (neighId !== 8 && !isOpaque(neighId)) {
              mask[y * CHUNK + z] = true;
              hasMask = true;
              // Mark as surface row if block above is not water
              const aboveId = getBlock(ox + x, y + 1, oz + z);
              if (aboveId !== 8) surfaceRow[y * CHUNK + z] = true;
            }
          }
        }
      }
      if (!hasMask) continue;

      for (let y = 0; y < HEIGHT; y++) {
        for (let z = 0; z < CHUNK; z++) {
          if (!mask[y * CHUNK + z]) continue;

          // Only merge cells that share the same surface status to avoid
          // mixing full-height and capped-height cells in one quad
          const isSurface = surfaceRow[y * CHUNK + z];

          let w = 1;
          while (z + w < CHUNK &&
                 mask[y * CHUNK + (z + w)] &&
                 surfaceRow[y * CHUNK + (z + w)] === isSurface) w++;

          let h = 1;
          let canExtend = true;
          while (y + h < HEIGHT && canExtend) {
            for (let k = 0; k < w; k++) {
              const mi = (y + h) * CHUNK + (z + k);
              if (!mask[mi] || surfaceRow[mi] !== isSurface) {
                canExtend = false;
                break;
              }
            }
            if (canExtend) h++;
          }

          for (let hy = 0; hy < h; hy++) {
            for (let wz = 0; wz < w; wz++) {
              mask[(y + hy) * CHUNK + (z + wz)] = false;
            }
          }

          const base = pos.length / 3;
          const px = ox + x + (nx > 0 ? 1 : 0);
          // Top of this quad: cap at 0.875 for surface rows, full 1.0 for submerged
          const yTop = y + h - 1 + (isSurface ? 0.875 : 1.0);
          // yBottom is always the integer y of the lowest row
          const yBot = y;

          if (nx > 0) {
            // +X East: edge1=+Y, edge2=+Z → Y×Z = +X ✓
            pos.push(
              px, yBot,  oz + z,
              px, yTop,  oz + z,
              px, yTop,  oz + z + w,
              px, yBot,  oz + z + w
            );
          } else {
            // -X West: edge1=+Y, edge2=-Z → Y×(-Z) = -X ✓
            pos.push(
              px, yBot,  oz + z + w,
              px, yTop,  oz + z + w,
              px, yTop,  oz + z,
              px, yBot,  oz + z
            );
          }
          const hv = yTop - yBot; // actual height for UVs
          norm.push(nx, 0, 0,  nx, 0, 0,  nx, 0, 0,  nx, 0, 0);
          uv.push(0, 0,  0, hv,  w, hv,  w, 0);
          faceType.push(1, 1, 1, 1);
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  // 4. Side (+Z & -Z) vertical faces (Greedy Merged over Y and X)
  // Same surface-cap logic: top row capped at y+0.875, submerged at y+1.0
  for (const nz of [1, -1]) {
    for (let z = 0; z < CHUNK; z++) {
      const mask = new Array(HEIGHT * CHUNK).fill(false);
      const surfaceRow = new Array(HEIGHT * CHUNK).fill(false);
      let hasMask = false;

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < CHUNK; x++) {
          if (ch.get(x, y, z) === 8) {
            const neighId = getBlock(ox + x, y, oz + z + nz);
            if (neighId !== 8 && !isOpaque(neighId)) {
              mask[y * CHUNK + x] = true;
              hasMask = true;
              const aboveId = getBlock(ox + x, y + 1, oz + z);
              if (aboveId !== 8) surfaceRow[y * CHUNK + x] = true;
            }
          }
        }
      }
      if (!hasMask) continue;

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < CHUNK; x++) {
          if (!mask[y * CHUNK + x]) continue;

          const isSurface = surfaceRow[y * CHUNK + x];

          let w = 1;
          while (x + w < CHUNK &&
                 mask[y * CHUNK + (x + w)] &&
                 surfaceRow[y * CHUNK + (x + w)] === isSurface) w++;

          let h = 1;
          let canExtend = true;
          while (y + h < HEIGHT && canExtend) {
            for (let k = 0; k < w; k++) {
              const mi = (y + h) * CHUNK + (x + k);
              if (!mask[mi] || surfaceRow[mi] !== isSurface) {
                canExtend = false;
                break;
              }
            }
            if (canExtend) h++;
          }

          for (let hy = 0; hy < h; hy++) {
            for (let wx = 0; wx < w; wx++) {
              mask[(y + hy) * CHUNK + (x + wx)] = false;
            }
          }

          const base = pos.length / 3;
          const pz = oz + z + (nz > 0 ? 1 : 0);
          const yTop = y + h - 1 + (isSurface ? 0.875 : 1.0);
          const yBot = y;
          const hv = yTop - yBot;

          if (nz > 0) {
            // +Z North: edge1=+Y, edge2=-X → Y×(-X) = +Z ✓
            pos.push(
              ox + x + w, yBot,  pz,
              ox + x + w, yTop,  pz,
              ox + x,     yTop,  pz,
              ox + x,     yBot,  pz
            );
          } else {
            // -Z South: edge1=+Y, edge2=+X → Y×X = -Z ✓
            pos.push(
              ox + x,     yBot,  pz,
              ox + x,     yTop,  pz,
              ox + x + w, yTop,  pz,
              ox + x + w, yBot,  pz
            );
          }
          norm.push(0, 0, nz,  0, 0, nz,  0, 0, nz,  0, 0, nz);
          uv.push(w, 0,  w, hv,  0, hv,  0, 0);
          faceType.push(1, 1, 1, 1);
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  return { pos, norm, uv, idx, faceType };
}

export function makeWaterMesh(g) {
  if (!g || g.idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position",  new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute("normal",    new THREE.Float32BufferAttribute(g.norm, 3));
  geo.setAttribute("uv",        new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setAttribute("aFaceType", new THREE.Float32BufferAttribute(g.faceType, 1));
  geo.setIndex(g.idx);

  if (!webgl.waterMat) {
    webgl.waterMat = createWaterMaterial();
  }
  const mesh = new THREE.Mesh(geo, webgl.waterMat);
  mesh.renderOrder = 15;
  mesh.frustumCulled = true;
  return mesh;
}

export function makeMesh(g, mode){
  if(g.idx.length===0) return null;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos,3));
  geo.setAttribute("color",    new THREE.Float32BufferAttribute(g.col,3));
  geo.setAttribute("uv",       new THREE.Float32BufferAttribute(g.uv,2));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(g.norm,3));
  geo.setIndex(g.idx);
  
  let mat;
  if(mode === "cutout"){
    if (!webgl.cutoutMat) {
      webgl.cutoutMat = new THREE.MeshLambertMaterial({ 
        map: webgl.atlasTex, vertexColors: true, side: THREE.DoubleSide, transparent: false, alphaTest: 0.5 
      });
    }
    mat = webgl.cutoutMat;
  } else if(mode === "alpha"){
    if (!webgl.alphaMat) {
      webgl.alphaMat = new THREE.MeshLambertMaterial({ 
        map: webgl.atlasTex, vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthWrite: true 
      });
    }
    mat = webgl.alphaMat;
  } else {
    if (!webgl.opaqueMat) {
      webgl.opaqueMat = new THREE.MeshLambertMaterial({ 
        map: webgl.atlasTex, vertexColors: true, side: THREE.FrontSide, transparent: false 
      });
    }
    mat = webgl.opaqueMat;
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = true;
  return mesh;
}

export function disposeMesh(m){ 
  if(m){ 
    webgl.scene.remove(m); 
    if (m.geometry) m.geometry.dispose(); 
    // Do NOT dispose shared materials!
  } 
}

export function updateChunkMesh(ch){
  const g = buildChunkMesh(ch);
  const wG = buildWaterGreedyMesh(ch);

  disposeMesh(ch.opaqueMesh); 
  disposeMesh(ch.cutoutMesh); 
  disposeMesh(ch.waterMesh);
  disposeMesh(ch.alphaMesh);

  ch.opaqueMesh = makeMesh(g.opaque, "opaque");
  ch.cutoutMesh = makeMesh(g.cutout, "cutout");
  ch.waterMesh  = makeWaterMesh(wG);
  ch.alphaMesh  = makeMesh(g.alpha, "alpha");

  if(ch.opaqueMesh) { ch.opaqueMesh.renderOrder = 0; webgl.scene.add(ch.opaqueMesh); }
  if(ch.cutoutMesh) { ch.cutoutMesh.renderOrder = 1; webgl.scene.add(ch.cutoutMesh); }
  if(ch.waterMesh)  { ch.waterMesh.renderOrder  = 10; webgl.scene.add(ch.waterMesh); }
  if(ch.alphaMesh)  { ch.alphaMesh.renderOrder  = 20; webgl.scene.add(ch.alphaMesh); }
  ch.dirty=false;
}

// ---- Chunk Streaming -------------------------------------------------------
export function updateChunkLoading(){
  const pcx=Math.floor(player.pos.x/CHUNK), pcz=Math.floor(player.pos.z/CHUNK);
  const needed=new Set();
  for(let dx=-RENDER_DIST;dx<=RENDER_DIST;dx++)
  for(let dz=-RENDER_DIST;dz<=RENDER_DIST;dz++){
    if(dx*dx+dz*dz > (RENDER_DIST+0.5)*(RENDER_DIST+0.5)) continue;
    const cx=pcx+dx, cz=pcz+dz, k=keyOf(cx,cz);
    needed.add(k);
    if(!world.chunks.has(k)){
      const ch=new Chunk(cx,cz);
      world.chunks.set(k,ch);
      genQueue.push(ch);
    }
  }
  genQueue.sort((a,b)=>{
    const da=(a.cx-pcx)**2+(a.cz-pcz)**2, db=(b.cx-pcx)**2+(b.cz-pcz)**2;
    return da-db;
  });
  for(const [k,ch] of world.chunks){
    if(!needed.has(k)){
      disposeMesh(ch.opaqueMesh); disposeMesh(ch.cutoutMesh); disposeMesh(ch.waterMesh); disposeMesh(ch.alphaMesh);
      world.chunks.delete(k);
    }
  }
}

export function processGenBudget(){
  let genBudget=2;
  while(genBudget>0 && genQueue.length){
    const ch=genQueue.shift();
    if(!ch.generated){
      generateChunk(ch);
      // After generating, mark all already-generated neighbors dirty.
      // Without this: chunk A meshes with neighbor B unloaded (B appears as AIR),
      // drawing boundary faces. When B generates later with water, A keeps its
      // now-interior boundary faces → large vertical planes inside the water volume.
      for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nc=getChunk(ch.cx+dx, ch.cz+dz);
        if(nc && nc.generated){ nc.dirty=true; nc.lit=false; }
      }
    }
    genBudget--;
  }
  let meshBudget=6; // Increased: water can dirty many chunks per tick
  const pcx=Math.floor(player.pos.x/CHUNK), pcz=Math.floor(player.pos.z/CHUNK);
  const dirty=[];
  for(const ch of world.chunks.values()){
    if(ch.generated && ch.dirty) dirty.push(ch);
  }
  dirty.sort((a,b)=>((a.cx-pcx)**2+(a.cz-pcz)**2)-((b.cx-pcx)**2+(b.cz-pcz)**2));
  const queueEmpty = genQueue.length===0;
  for(const ch of dirty){
    if(meshBudget<=0) break;
    const nAll = ["1,0","-1,0","0,1","0,-1"].every(d=>{
      const [dx,dz]=d.split(",").map(Number);
      const nc=getChunk(ch.cx+dx, ch.cz+dz);
      return nc && nc.generated;
    });
    if(!nAll && !queueEmpty) continue;
    // Always relight before meshing (water/block changes invalidate lighting)
    computeChunkLight(ch);
    ch.lit = true;
    updateChunkMesh(ch);
    // Debug: record rebuild events
    if (typeof window !== 'undefined') {
      window.__lastMeshRebuild = { cx: ch.cx, cz: ch.cz, t: performance.now() };
    }
    meshBudget--;
  }
}

// ---- Atlas & textures builders ---------------------------------------------
export function paintTile(ctx, col, row, painter){
  const ox=col*TILE, oy=row*TILE;
  const px=(x,y,color)=>{ ctx.fillStyle=color; ctx.fillRect(ox+x, oy+y, 1, 1); };
  painter(px);
}

export const PAINTERS = {
  grass_top(px){ const rnd=trng(11); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0x6aa84f, 0.82+n*0.36)); if(n>0.93) px(x,y, shade(0x4f8a3a,1)); } },
  grass_side(px){ const rnd=trng(12);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0x6b4f34, 0.8+n*0.4)); }
    for(let x=0;x<TILE;x++){ const h=3+((trng(x+7)()*3)|0); for(let y=0;y<h;y++) px(x,y, shade(0x6aa84f,0.8+trng(x*3+y)()*0.4)); } },
  dirt(px){ const rnd=trng(21); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0x6b4f34,0.78+n*0.42)); if(n>0.92) px(x,y, shade(0x4a3722,1)); } },
  stone(px){ const rnd=trng(31); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0x8a8a8a,0.82+n*0.34)); if(n>0.95) px(x,y, shade(0x6e6e6e,1)); } },
  sand(px){ const rnd=trng(41); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0xd9c88f,0.88+n*0.22)); if(n>0.94) px(x,y, shade(0xc4b070,1)); } },
  wood_top(px){ const rnd=trng(51);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const dx=x-7.5,dy=y-7.5; const d=Math.sqrt(dx*dx+dy*dy); const ring=(Math.sin(d*1.6)+1)/2; px(x,y, shade(0xa9834f,0.7+ring*0.4+rnd()*0.08)); } },
  wood_side(px){ const rnd=trng(52); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const grain=(Math.sin(x*1.7)+1)/2; px(x,y, shade(0x7a5a34,0.72+grain*0.34+rnd()*0.08)); } },
  leaves(px){ const rnd=trng(61); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); if(n>0.14) px(x,y, shade(0x3f7a3f,0.7+n*0.5)); else px(x,y, "rgba(0,0,0,0)"); } },
  plank(px){ const rnd=trng(71);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ px(x,y, shade(0xb08a52,0.82+rnd()*0.28)); }
    for(let y=0;y<TILE;y+=4)for(let x=0;x<TILE;x++) px(x,y, shade(0x6b5330,1));
    for(let x=3;x<TILE;x+=6)for(let y=0;y<TILE;y++) px(x,y, shade(0x6b5330,1)); },
  water(px){ const rnd=trng(81); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const w=(Math.sin((x+y)*0.8)+1)/2; px(x,y, shade(0x2970da,0.85+w*0.25+rnd()*0.05)); } },
  glass(px){ for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const edge=(x===0||y===0||x===TILE-1||y===TILE-1); px(x,y, edge? shade(0xbfe3ef,1) : "rgba(191,227,239,0.15)"); }
    for(let i=0;i<TILE;i++){ px(i,i,"rgba(255,255,255,0.4)"); } },
  brick(px){ const rnd=trng(101);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x9c4a3a,0.85+rnd()*0.2));
    for(let y=0;y<TILE;y+=4){ for(let x=0;x<TILE;x++) px(x,y, shade(0xcfc3b0,1)); }
    for(let y=0;y<TILE;y+=4){ const off=((y/4)&1)?4:0; for(let x=off;x<TILE;x+=8) for(let yy=0;yy<4;yy++) if(y+yy<TILE) px(x,y+yy, shade(0xcfc3b0,1)); } },
  _ore(px, seed, mineral){ const rnd=trng(seed);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0x8a8a8a,0.82+n*0.34)); if(n>0.95) px(x,y, shade(0x6e6e6e,1)); }
    const r2=trng(seed+5);
    for(let i=0;i<12;i++){ const bx=(r2()*(TILE-3))|0, by=(r2()*(TILE-3))|0, s=1+((r2()*2)|0);
      for(let dx=0;dx<=s;dx++)for(let dy=0;dy<=s;dy++){ if(r2()>0.3) px(bx+dx,by+dy, shade(mineral,0.7+r2()*0.5)); } } },
  coal_ore(px){ PAINTERS._ore(px, 201, 0x2a2a2a); },
  iron_ore(px){ PAINTERS._ore(px, 202, 0xc99a6a); },
  gold_ore(px){ PAINTERS._ore(px, 203, 0xf2d24a); },
  diamond_ore(px){ PAINTERS._ore(px, 204, 0x6fe6e0); },
  cobble(px){ const rnd=trng(211);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x808080,0.7+rnd()*0.5));
    const r2=trng(219);
    for(let i=0;i<26;i++){ const bx=(r2()*TILE)|0, by=(r2()*TILE)|0; px(bx,by, shade(0x4a4a4a,1)); } },
  stone_brick(px){ const rnd=trng(221);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x8f8f8f,0.85+rnd()*0.2));
    for(let y=0;y<TILE;y+=8) for(let x=0;x<TILE;x++) px(x,y, shade(0x5f5f5f,1));
    for(let x=0;x<TILE;x+=8) for(let y=0;y<TILE;y++) px(x,y, shade(0x5f5f5f,1)); },
  mossy_brick(px){ const rnd=trng(231);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const moss=rnd()>0.7; px(x,y, moss? shade(0x5a7a3a,0.7+rnd()*0.4) : shade(0x8f8f8f,0.85+rnd()*0.2)); }
    for(let y=0;y<TILE;y+=8) for(let x=0;x<TILE;x++) px(x,y, shade(0x4f5f3f,1));
    for(let x=0;x<TILE;x+=8) for(let y=0;y<TILE;y++) px(x,y, shade(0x4f5f3f,1)); },
  sandstone(px){ const rnd=trng(241);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0xd9c88f,0.9+rnd()*0.16));
    for(let y=0;y<TILE;y+=5) for(let x=0;x<TILE;x++) px(x,y, shade(0xc0ad74,1)); },
  dark_brick(px){ const rnd=trng(251);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x5a3a34,0.82+rnd()*0.24));
    for(let y=0;y<TILE;y+=4) for(let x=0;x<TILE;x++) px(x,y, shade(0x3a241f,1));
    for(let y=0;y<TILE;y+=4){ const off=((y/4)&1)?4:0; for(let x=off;x<TILE;x+=8) for(let yy=0;yy<4;yy++) if(y+yy<TILE) px(x,y+yy, shade(0x3a241f,1)); } },
  torch(px){
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y,"rgba(0,0,0,0)");
    for(let y=6;y<TILE;y++){ px(7,y, shade(0x7a5a34,1)); px(8,y, shade(0x8a6a44,1)); }
    for(let y=2;y<7;y++)for(let x=6;x<10;x++){ const c = y<4?0xfff2a0 : 0xff9030; px(x,y, shade(c, 0.9+Math.random()*0.2)); }
    px(7,1, shade(0xffe070,1)); px(8,1, shade(0xffe070,1)); },
  glowstone(px){ const rnd=trng(261);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0xf7e08a,0.7+n*0.5)); if(n>0.8) px(x,y, shade(0xfff4c0,1)); } },
  _noise(px,base,seed,amt){ const rnd=trng(seed); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ px(x,y, shade(base, (1-amt/2)+rnd()*amt)); } },
  _speck(px,base,seed,dark){ const rnd=trng(seed); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(base,0.85+n*0.3)); if(n>0.9) px(x,y, shade(dark,1)); } },
  _planks(px,base,seed){ const rnd=trng(seed);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(base,0.85+rnd()*0.22));
    for(let y=0;y<TILE;y+=4) for(let x=0;x<TILE;x++) px(x,y, shade(base,0.55));
    for(let x=3;x<TILE;x+=6) for(let y=0;y<TILE;y++) px(x,y, shade(base,0.55)); },
  _bricks(px,base,seed,mortar){ const rnd=trng(seed);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(base,0.85+rnd()*0.2));
    for(let y=0;y<TILE;y+=4){ for(let x=0;x<TILE;x++) px(x,y, shade(mortar,1)); }
    for(let y=0;y<TILE;y+=4){ const off=((y/4)&1)?4:0; for(let x=off;x<TILE;x+=8) for(let yy=0;yy<4;yy++) if(y+yy<TILE) px(x,y+yy, shade(mortar,1)); } },
  _polished(px,base,seed){ const rnd=trng(seed); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(base,0.92+rnd()*0.12));
    for(let i=0;i<TILE;i++){ px(0,i,shade(base,1.1)); px(i,0,shade(base,1.1)); } },
  _wool(px,base,seed){ const rnd=trng(seed); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(base,0.86+n*0.24)); if(n>0.85) px(x,y, shade(base,0.7)); } },
  _log_top(px,base,seed){ const rnd=trng(seed); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const dx=x-7.5,dy=y-7.5; const d=Math.sqrt(dx*dx+dy*dy); const ring=(Math.sin(d*1.6)+1)/2; px(x,y, shade(base,0.72+ring*0.36+rnd()*0.08)); } },
  _log_side(px,base,seed){ const rnd=trng(seed); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const grain=(Math.sin(x*1.7)+1)/2; px(x,y, shade(base,0.74+grain*0.3+rnd()*0.08)); } },
  _metal(px,base,seed){ const rnd=trng(seed); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(base,0.9+rnd()*0.14));
    for(let i=0;i<TILE;i++){ px(i,0,shade(base,1.15)); px(0,i,shade(base,1.15)); px(i,TILE-1,shade(base,0.7)); px(TILE-1,i,shade(base,0.7)); } },

  birch_top(px){ PAINTERS._log_top(px,0xe8dcc0,301); },
  birch_side(px){ const rnd=trng(302); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ px(x,y, shade(0xd8cba8,0.88+rnd()*0.16)); if(rnd()>0.94) px(x,y, shade(0x3a3a3a,1)); } },
  spruce_top(px){ PAINTERS._log_top(px,0x5a3f28,303); },
  spruce_side(px){ PAINTERS._log_side(px,0x4a3420,304); },
  granite(px){ PAINTERS._speck(px,0xa06a54,311,0x804a38); },
  andesite(px){ PAINTERS._speck(px,0x8a8a90,312,0x6a6a70); },
  diorite(px){ PAINTERS._speck(px,0xdcdcdc,313,0xffffff); },
  gravel(px){ const rnd=trng(314); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0x8a8078,0.7+n*0.5)); if(n>0.85) px(x,y, shade(0x5a544e,1)); } },
  clay(px){ PAINTERS._noise(px,0xa0a6b0,315,0.16); },
  snow(px){ PAINTERS._noise(px,0xf4f8ff,316,0.1); },
  obsidian(px){ const rnd=trng(317); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0x1a1428,0.7+n*0.6)); if(n>0.9) px(x,y, shade(0x5a4a80,1)); } },
  birch_plank(px){ PAINTERS._planks(px,0xe4d8b8,321); },
  spruce_plank(px){ PAINTERS._planks(px,0x6a4f34,322); },
  pol_granite(px){ PAINTERS._polished(px,0xb47a64,323); },
  pol_andesite(px){ PAINTERS._polished(px,0x9a9aa0,324); },
  pol_diorite(px){ PAINTERS._polished(px,0xececec,325); },
  terracotta(px){ PAINTERS._noise(px,0xb06a4a,326,0.18); },
  ice(px){ const rnd=trng(327); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x9cc8f0,0.9+rnd()*0.14)); for(let i=0;i<TILE;i++) px(i,i,shade(0xd0e8ff,1)); },
  packed_snow(px){ PAINTERS._noise(px,0xeef4ff,328,0.08); },
  chiseled_sandstone(px){ const rnd=trng(329); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0xcab878,0.9+rnd()*0.14));
    for(let i=0;i<TILE;i++){ px(2,i,shade(0xa89858,1)); px(TILE-3,i,shade(0xa89858,1)); px(i,7,shade(0xa89858,1)); } },
  smooth_stone(px){ PAINTERS._noise(px,0x9a9a9a,330,0.12); },
  craft_top(px){ const rnd=trng(331); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x9a6a3a,0.85+rnd()*0.2));
    for(let i=0;i<TILE;i++){ px(TILE/2|0,i,shade(0x5a3a1a,1)); px(i,TILE/2|0,shade(0x5a3a1a,1)); } },
  craft_side(px){ PAINTERS._planks(px,0x8a5a2a,332); for(let x=2;x<7;x++)for(let y=2;y<7;y++) if((x+y)%2) px(x,y,shade(0x5a3a1a,1)); },
  furnace_top(px){ const rnd=trng(333); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x6a6a6a,0.85+rnd()*0.2));
    for(let i=4;i<12;i++){ px(i,4,shade(0x3a3a3a,1)); px(i,11,shade(0x3a3a3a,1)); px(4,i,shade(0x3a3a3a,1)); px(11,i,shade(0x3a3a3a,1)); } },
  furnace_side(px){ const rnd=trng(334); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x5a5a5a,0.85+rnd()*0.2));
    for(let x=5;x<11;x++)for(let y=8;y<13;y++) px(x,y, shade(0x2a2a2a,1));
    for(let x=6;x<10;x++) px(x,12,shade(0xff8030,1)); },
  chest_top(px){ const rnd=trng(335); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x9a7040,0.85+rnd()*0.2));
    for(let i=0;i<TILE;i++){ px(i,0,shade(0x6a4a20,1)); px(i,TILE-1,shade(0x6a4a20,1)); } },
  chest_side(px){ const rnd=trng(336); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x8a6030,0.85+rnd()*0.2));
    for(let i=0;i<TILE;i++){ px(i,7,shade(0x5a3a1a,1)); px(i,8,shade(0x5a3a1a,1)); }
    for(let y=6;y<11;y++){ px(7,y,shade(0x3a2a10,1)); px(8,y,shade(0xf2d24a,1)); } },
  bookshelf(px){ const rnd=trng(337); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x9a6a3a,0.85+rnd()*0.2));
    for(let x=0;x<TILE;x++){ px(x,0,shade(0x6a4a20,1)); px(x,7,shade(0x6a4a20,1)); px(x,8,shade(0x6a4a20,1)); px(x,TILE-1,shade(0x6a4a20,1)); }
    const cols=[0xb03030,0x3050b0,0x40904a,0xe0c040,0x8a3a8a];
    for(let x=1;x<TILE-1;x+=2){ const c=cols[(x*7)%cols.length]; for(let y=1;y<7;y++) px(x,y,shade(c,0.8+rnd()*0.4)); for(let y=9;y<TILE-1;y++) px(x,y,shade(cols[(x*3)%cols.length],0.8+rnd()*0.4)); } },
  ladder(px){ for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y,"rgba(0,0,0,0)");
    for(let y=0;y<TILE;y++){ px(3,y,shade(0x9a7b4a,1)); px(12,y,shade(0x9a7b4a,1)); }
    for(let y=2;y<TILE;y+=4)for(let x=3;x<=12;x++) px(x,y,shade(0xb08a52,1)); },
  iron_block(px){ PAINTERS._metal(px,0xe8e8e8,338); },
  gold_block(px){ PAINTERS._metal(px,0xf2d24a,339); },
  diamond_block(px){ PAINTERS._metal(px,0x6fe6e0,340); },
  glass_pane(px){ for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const edge=(x<2||x>TILE-3); px(x,y, edge? shade(0xcfe8f0,1):"rgba(207,232,240,0.2)"); } },
  wool_white(px){ PAINTERS._wool(px,0xf0f0f0,350); },
  wool_red(px){ PAINTERS._wool(px,0xb03030,351); },
  wool_blue(px){ PAINTERS._wool(px,0x3050b0,352); },
  wool_green(px){ PAINTERS._wool(px,0x40904a,353); },
  wool_yellow(px){ PAINTERS._wool(px,0xe0c040,354); },
  wool_black(px){ PAINTERS._wool(px,0x2a2a2a,355); },
};

const tileDataUrlCache = {};
export function getTileDataURL(tileName) {
  if (typeof document === 'undefined' || !tileName) return null;
  if (tileDataUrlCache[tileName]) return tileDataUrlCache[tileName];

  const cv = document.createElement("canvas");
  cv.width = 16; cv.height = 16;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const px = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };

  const fn = PAINTERS[tileName] || PAINTERS.stone;
  if (fn) fn(px);

  const url = cv.toDataURL();
  tileDataUrlCache[tileName] = url;
  return url;
}

export function getItemDataURL(id) {
  if (typeof document === 'undefined' || !id) return null;
  const cacheKey = "item_" + id;
  if (tileDataUrlCache[cacheKey]) return tileDataUrlCache[cacheKey];

  const cv = document.createElement("canvas");
  cv.width = 16; cv.height = 16;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const px = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };

  const it = (typeof ITEMS !== 'undefined' && ITEMS) ? ITEMS[id] : null;
  const colHex = it?.color || 0x8a8a8a;
  const colStr = shade(colHex, 1.0);
  const darkStr = shade(colHex, 0.6);
  const lightStr = shade(colHex, 1.3);

  if (it?.tool === "pickaxe") {
    for (let i = 4; i < 14; i++) px(17 - i, i, "#7a5a34");
    for (let x = 2; x <= 13; x++) {
      const y = Math.floor(2 + Math.abs(x - 7.5) * 0.4);
      px(x, y, colStr);
      px(x, y + 1, darkStr);
    }
  } else if (it?.tool === "shovel") {
    for (let i = 4; i < 14; i++) px(17 - i, i, "#7a5a34");
    for (let x = 2; x <= 6; x++) for (let y = 2; y <= 6; y++) px(x, y, colStr);
    px(2, 2, lightStr); px(6, 6, darkStr);
  } else if (it?.tool === "axe") {
    for (let i = 4; i < 14; i++) px(17 - i, i, "#7a5a34");
    for (let x = 2; x <= 6; x++) for (let y = 2; y <= 7; y++) px(x, y, colStr);
    px(2, 2, lightStr); px(6, 7, darkStr);
  } else if (it?.tool === "hoe") {
    for (let i = 4; i < 14; i++) px(17 - i, i, "#7a5a34");
    for (let x = 2; x <= 7; x++) { px(x, 2, colStr); px(x, 3, darkStr); }
  } else if (id === 104) { // Diamond gem
    const cy = 0x6fe6e0;
    px(7,2,shade(cy,1.4)); px(8,2,shade(cy,1.4));
    for (let x = 5; x <= 10; x++) px(x,4,shade(cy,1.3));
    for (let x = 4; x <= 11; x++) px(x,5,shade(cy,1.1));
    for (let x = 5; x <= 10; x++) px(x,7,shade(cy,0.9));
    for (let x = 6; x <= 9; x++) px(x,9,shade(cy,0.8));
    px(7,11,shade(cy,0.7)); px(8,11,shade(cy,0.7));
    px(6,4,"#ffffff"); px(7,4,"#ffffff"); px(6,5,"#ffffff");
  } else if (id === 101 || id === 120) { // Coal / Charcoal
    for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) {
      if ((x === 4 || x === 11) && (y === 4 || y === 11)) continue;
      px(x, y, (x + y) % 2 === 0 ? "#2a2a2a" : "#1a1a1a");
    }
  } else if (id === 102 || id === 103) { // Iron / Gold Ingot
    for (let y = 5; y <= 10; y++) for (let x = 3; x <= 12; x++) px(x, y, colStr);
    for (let x = 3; x <= 12; x++) { px(x, 5, lightStr); px(x, 10, darkStr); }
  } else {
    for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) {
      if ((x === 4 || x === 11) && (y === 4 || y === 11)) continue;
      const shadeFact = (x === 4 || y === 4) ? 1.2 : ((x === 11 || y === 11) ? 0.7 : 1.0);
      px(x, y, shade(colHex, shadeFact));
    }
  }

  const url = cv.toDataURL();
  tileDataUrlCache[cacheKey] = url;
  return url;
}

export function buildAtlas(){
  const cv=document.createElement("canvas");
  cv.width=ATLAS_COLS*TILE; cv.height=ATLAS_ROWS*TILE;
  const ctx=cv.getContext("2d");
  ctx.imageSmoothingEnabled=false;

  const TILE_NAMES = Object.keys(PAINTERS).filter(k => !k.startsWith('_'));
  TILE_NAMES.forEach((name,i)=>{
    const col=i%ATLAS_COLS, row=(i/ATLAS_COLS)|0;
    paintTile(ctx, col, row, PAINTERS[name]||PAINTERS.stone);
    getTileDataURL(name);
  });
  const tex=new THREE.CanvasTexture(cv);
  tex.magFilter=THREE.NearestFilter;
  tex.minFilter=THREE.NearestFilter;
  tex.generateMipmaps=false;
  tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
  return tex;
}

const CRACK_STAGES = 8;
export function buildCrackTexture(){
  const cv=document.createElement("canvas");
  cv.width=CRACK_STAGES*TILE; cv.height=TILE;
  const ctx=cv.getContext("2d");
  ctx.clearRect(0,0,cv.width,cv.height);
  const rnd=trng(777);
  const cracks=[];
  for(let c=0;c<14;c++){
    let x=(rnd()*TILE)|0, y=(rnd()*TILE)|0;
    const len=3+((rnd()*6)|0);
    const path=[[x,y]];
    for(let s=0;s<len;s++){
      x=Math.max(0,Math.min(TILE-1, x+((rnd()*3|0)-1)));
      y=Math.max(0,Math.min(TILE-1, y+((rnd()*3|0)-1)));
      path.push([x,y]);
    }
    cracks.push({path, appearAt: Math.floor(c/14*CRACK_STAGES)});
  }
  for(let stage=0;stage<CRACK_STAGES;stage++){
    const ox=stage*TILE;
    for(const cr of cracks){
      if(cr.appearAt>stage) continue;
      ctx.fillStyle=`rgba(0,0,0,${0.35 + (stage/CRACK_STAGES)*0.45})`;
      for(const [px,py] of cr.path){
        ctx.fillRect(ox+px, py, 1, 1);
        if(stage>4 && (px+py)%2===0) ctx.fillRect(ox+Math.min(TILE-1,px+1), py, 1, 1);
      }
    }
  }
  const tex=new THREE.CanvasTexture(cv);
  tex.magFilter=THREE.NearestFilter; tex.minFilter=THREE.NearestFilter;
  tex.generateMipmaps=false;
  tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
  return tex;
}

export function showCrack(x,y,z,stage){
  if (!webgl.crackMesh) return;
  webgl.crackMesh.position.set(x+0.5,y+0.5,z+0.5);
  webgl.crackTex.offset.x = stage/CRACK_STAGES;
  webgl.crackMesh.visible=true;
}

export function hideCrack(){ 
  if (webgl.crackMesh) webgl.crackMesh.visible=false; 
}

// ---- Particles -------------------------------------------------------------
const PARTICLE_POOL=140;
const particleGeo=new THREE.BoxGeometry(0.16,0.16,0.16);

export function initParticles(){
  for(let i=0;i<PARTICLE_POOL;i++){
    const mat=new THREE.MeshLambertMaterial({color:0xffffff, transparent:true, opacity:1});
    const m=new THREE.Mesh(particleGeo, mat);
    m.visible=false; m.frustumCulled=false;
    webgl.scene.add(m);
    game.particles.push({mesh:m, vel:new THREE.Vector3(), life:0, max:0, spin:new THREE.Vector3()});
  }
}

export function blockColor(id){
  const b=BLOCKS[id]; if(!b) return 0x888888;
  return b.all!==undefined?b.all : b.top!==undefined?b.top : b.side;
}

export function spawnBreakBurst(x,y,z,id){
  const base=blockColor(id);
  let spawned=0;
  for(const p of game.particles){
    if(p.mesh.visible) continue;
    const j=0.75+Math.random()*0.5;
    const r=Math.min(255,((base>>16)&255)*j)|0, g=Math.min(255,((base>>8)&255)*j)|0, b=Math.min(255,(base&255)*j)|0;
    p.mesh.material.color.setRGB(r/255,g/255,b/255);
    p.mesh.material.opacity=1;
    const s=0.5+Math.random()*0.9; p.mesh.scale.setScalar(s);
    p.mesh.position.set(x+0.2+Math.random()*0.6, y+0.2+Math.random()*0.6, z+0.2+Math.random()*0.6);
    p.vel.set((Math.random()-0.5)*5, 2+Math.random()*4, (Math.random()-0.5)*5);
    p.spin.set(Math.random()*10-5, Math.random()*10-5, Math.random()*10-5);
    p.life=0; p.max=0.5+Math.random()*0.4;
    p.mesh.visible=true;
    if(++spawned>=14) break;
  }
}

export function updateParticles(dt){
  for(const p of game.particles){
    if(!p.mesh.visible) continue;
    p.life+=dt;
    if(p.life>=p.max){ p.mesh.visible=false; continue; }
    p.vel.y += -16*dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.spin.x*dt;
    p.mesh.rotation.y += p.spin.y*dt;
    const k=1-(p.life/p.max);
    p.mesh.material.opacity=k;
    p.mesh.scale.multiplyScalar(1-0.6*dt);
  }
}

export function triggerWorldExplosion(ex, ey, ez, radius, scheduleSaveCallback) {
  const affectedChunks = new Set();
  const rCeil = Math.ceil(radius);
  const keyOfLocal = (cx, cz) => cx + "," + cz;
  
  for (let dx = -rCeil; dx <= rCeil; dx++) {
    for (let dy = -rCeil; dy <= rCeil; dy++) {
      for (let dz = -rCeil; dz <= rCeil; dz++) {
        const distSq = dx*dx + dy*dy + dz*dz;
        if (distSq > radius*radius) continue;
        
        const wx = Math.floor(ex + dx);
        const wy = Math.floor(ey + dy);
        const wz = Math.floor(ez + dz);
        
        if (wy <= 0 || wy >= HEIGHT) continue; // Keep bedrock/floor safe
        
        const blockId = getBlock(wx, wy, wz);
        if (blockId === 0 || blockId === 30) continue; // Bedrock (obsidian) is unbreakable
        
        // Destroy block
        setBlock(wx, wy, wz, 0, true, scheduleSaveCallback);
        spawnBreakBurst(wx, wy, wz, blockId);
        disturbWater(wx, wy, wz);
        
        const cx = Math.floor(wx / CHUNK);
        const cz = Math.floor(wz / CHUNK);
        affectedChunks.add(keyOfLocal(cx, cz));
      }
    }
  }
  
  // Re-light and update meshes for all affected chunks and their neighbors
  const chunksToUpdate = new Set();
  for (const chunkKey of affectedChunks) {
    const [cx, cz] = chunkKey.split(",").map(Number);
    relightAround(cx, cz);
    chunksToUpdate.add(chunkKey);
    chunksToUpdate.add(keyOfLocal(cx-1, cz));
    chunksToUpdate.add(keyOfLocal(cx+1, cz));
    chunksToUpdate.add(keyOfLocal(cx, cz-1));
    chunksToUpdate.add(keyOfLocal(cx, cz+1));
  }
  
  for (const chunkKey of chunksToUpdate) {
    const [cx, cz] = chunkKey.split(",").map(Number);
    const ch = getChunk(cx, cz);
    if (ch && ch.generated) {
      updateChunkMesh(ch);
    }
  }
}

// ---- Flowing water ---------------------------------------------------------
const WATER = 8;
const MAX_FLOW = 5;
const flowDist = {};
const waterActive = new Set();
export const WATER_TICK = 0.18;

export function wkey(x,y,z){ return x+","+y+","+z; }
export function queueWater(x,y,z){ waterActive.add(wkey(x,y,z)); }

export function disturbWater(x,y,z){
  for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
    const b=getBlock(x+dx,y+dy,z+dz);
    if(b===WATER || b===AIR) queueWater(x+dx,y+dy,z+dz);
  }
}

export function waterFlowDist(x,y,z){
  if(getBlock(x,y,z)!==WATER) return Infinity;
  const d=flowDist[wkey(x,y,z)];
  return d===undefined?0:d;
}

export function setWater(x,y,z,dist){
  setBlock(x,y,z,WATER,false);
  flowDist[wkey(x,y,z)]=dist;
}

export function tickWater(){
  if(waterActive.size===0) return;
  const process=[...waterActive];
  waterActive.clear();
  const changed=new Set();
  
  for(const k of process){
    const [x,y,z]=k.split(",").map(Number);
    const here=getBlock(x,y,z);
    
    if(here===WATER){
      const dist=waterFlowDist(x,y,z);
      
      // Decay check for flowing water (dist > 0)
      if (dist > 0) {
        let isFed = false;
        if (getBlock(x, y+1, z) === WATER) {
          isFed = true;
        } else {
          for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            if (getBlock(x+dx, y, z+dz) === WATER && waterFlowDist(x+dx, y, z+dz) < dist) {
              isFed = true;
              break;
            }
          }
        }
        if (!isFed) {
          setBlock(x, y, z, AIR, false);
          delete flowDist[wkey(x,y,z)];
          changed.add(wkey(x,y,z));
          disturbWater(x, y, z);
          continue;
        }
      }

      // Flow down into air or lower water
      const below = getBlock(x, y-1, z);
      if(y > 0 && (below === AIR || (below === WATER && waterFlowDist(x, y-1, z) > 1))){
        setWater(x, y-1, z, 1); // Vertical falling stream
        changed.add(wkey(x, y-1, z));
        queueWater(x, y-1, z);
      }
      // Otherwise flow horizontally if dist < MAX_FLOW
      else if(dist < MAX_FLOW){
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nb = getBlock(x+dx, y, z+dz);
          if(nb === AIR){
            setWater(x+dx, y, z+dz, dist + 1);
            changed.add(wkey(x+dx, y, z+dz));
            queueWater(x+dx, y, z+dz);
          }
        }
      }
    } else if(here===AIR){
      let fed=false, minD=Infinity;
      if(getBlock(x,y+1,z)===WATER){ fed=true; minD=0; }
      else for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        if(getBlock(x+dx,y,z+dz)===WATER){ const d=waterFlowDist(x+dx,y,z+dz); if(d+1<minD){minD=d+1;fed=true;} }
      }
      if(fed && minD<=MAX_FLOW){ setWater(x,y,z,minD); changed.add(wkey(x,y,z)); queueWater(x,y,z); }
    }
  }

  // Mark ALL affected chunks AND their 4 neighbors dirty.
  // Do NOT call updateChunkMesh directly — let processGenBudget handle rebuilds
  // in order, so render mesh, water mesh, and collision (voxel-based) always match.
  const dirtyChunks = new Set();
  for(const k of changed){
    const [x,,z]=k.split(",").map(Number);
    const cx = Math.floor(x/CHUNK), cz = Math.floor(z/CHUNK);
    dirtyChunks.add(keyOf(cx, cz));
    // Always dirty neighbors — water can expose neighbor faces
    dirtyChunks.add(keyOf(cx-1, cz));
    dirtyChunks.add(keyOf(cx+1, cz));
    dirtyChunks.add(keyOf(cx, cz-1));
    dirtyChunks.add(keyOf(cx, cz+1));
  }
  for(const ck of dirtyChunks){
    const [cx,cz]=ck.split(",").map(Number);
    const ch=getChunk(cx,cz);
    if(ch && ch.generated){
      ch.dirty = true;  // Let processGenBudget rebuild on next frame
      ch.lit   = false; // Also force a light recompute
    }
  }

  // Debug telemetry
  if (typeof window !== 'undefined') {
    window.__lastWaterTick = { changed: changed.size, dirtyChunks: dirtyChunks.size };
  }
}
