import * as THREE from 'three';
import { world, player, webgl, game, inventory } from './state.js';
import { 
  CHUNK, HEIGHT, RENDER_DIST, SEA, SEED, MAX_LIGHT, AIR, BLOCKS, VARIANTS,
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
    this.opaqueMesh=null; this.cutoutMesh=null; this.alphaMesh=null;
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
    if(x<0||x>=CHUNK||z<0||z>=CHUNK) return MAX_LIGHT;
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

  if (v === 0) {
    const key = wx + "," + wy + "," + wz;
    if (prev === 43 && world.chests && world.chests[key]) {
      world.chests[key].forEach(slot => {
        if (slot.id > 0 && slot.count > 0) {
          inventory[slot.id] = (inventory[slot.id] || 0) + slot.count;
        }
      });
      delete world.chests[key];
    }
    else if (prev === 42 && world.furnaces && world.furnaces[key]) {
      const f = world.furnaces[key];
      if (f.inputId > 0 && f.inputCount > 0) {
        inventory[f.inputId] = (inventory[f.inputId] || 0) + f.inputCount;
      }
      if (f.fuelId > 0 && f.fuelCount > 0) {
        inventory[f.fuelId] = (inventory[f.fuelId] || 0) + f.fuelCount;
      }
      if (f.outputId > 0 && f.outputCount > 0) {
        inventory[f.outputId] = (inventory[f.outputId] || 0) + f.outputCount;
      }
      delete world.furnaces[key];
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
    if(id===AIR) continue;
    const bl = BLOCKS[id];
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
      } else if(id === 49) {
        draw = (F.f === 3 || F.f === 5); // Glass pane
      } else if(id === 8) { // WATER
        if(neigh === 8) draw = false; // Don't draw inner water-to-water faces
        else draw = true; // Draw water face against air or solid blocks
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
      const useOwnLight = (id === 20 || id === 45 || id === 49);
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

        // Sloped flowing water Y height adjustment
        if (id === 8) {
          const dist = waterFlowDist(ox+x, y, oz+z);
          const topNeigh = getBlock(ox+x, y+1, oz+z);
          if (topNeigh !== 8 && c[1] === 1) {
            const hFactor = dist === 0 ? 0.90 : Math.max(0.25, 0.88 - dist * 0.12);
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
        } else if (id === 49) {
          if (F.f === 3) pz = oz + z + 0.5;
          if (F.f === 5) px = ox + x + 0.5;
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

export function makeMesh(g, mode){
  if(g.idx.length===0) return null;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos,3));
  geo.setAttribute("color",    new THREE.Float32BufferAttribute(g.col,3));
  geo.setAttribute("uv",       new THREE.Float32BufferAttribute(g.uv,2));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(g.norm,3));
  geo.setIndex(g.idx);
  const opts={ map: webgl.atlasTex, vertexColors:true, side: THREE.FrontSide };
  if(mode==="cutout"){
    opts.transparent=false; opts.alphaTest=0.5; opts.side = THREE.DoubleSide;
  } else if(mode==="alpha"){
    opts.transparent=true; opts.opacity=0.65; opts.side = THREE.DoubleSide; opts.depthWrite=false;
  } else {
    opts.transparent=false;
  }
  const mesh=new THREE.Mesh(geo, new THREE.MeshLambertMaterial(opts));
  mesh.frustumCulled=true;
  return mesh;
}

export function disposeMesh(m){ if(m){ webgl.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }

export function updateChunkMesh(ch){
  const g = buildChunkMesh(ch);
  disposeMesh(ch.opaqueMesh); disposeMesh(ch.cutoutMesh); disposeMesh(ch.alphaMesh);
  ch.opaqueMesh=makeMesh(g.opaque,"opaque");
  ch.cutoutMesh=makeMesh(g.cutout,"cutout");
  ch.alphaMesh =makeMesh(g.alpha,"alpha");
  if(ch.opaqueMesh) webgl.scene.add(ch.opaqueMesh);
  if(ch.cutoutMesh) webgl.scene.add(ch.cutoutMesh);
  if(ch.alphaMesh)  webgl.scene.add(ch.alphaMesh);
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
      disposeMesh(ch.opaqueMesh); disposeMesh(ch.cutoutMesh); disposeMesh(ch.alphaMesh);
      world.chunks.delete(k);
    }
  }
}

export function processGenBudget(){
  let genBudget=2;
  while(genBudget>0 && genQueue.length){
    const ch=genQueue.shift();
    if(!ch.generated) generateChunk(ch);
    genBudget--;
  }
  let meshBudget=3;
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
    if(!ch.lit) computeChunkLight(ch);
    updateChunkMesh(ch);
    meshBudget--;
  }
}

// ---- Atlas & textures builders ---------------------------------------------
export function paintTile(ctx, col, row, painter){
  const ox=col*TILE, oy=row*TILE;
  const px=(x,y,color)=>{ ctx.fillStyle=color; ctx.fillRect(ox+x, oy+y, 1, 1); };
  painter(px);
}

export function buildAtlas(){
  const cv=document.createElement("canvas");
  cv.width=ATLAS_COLS*TILE; cv.height=ATLAS_ROWS*TILE;
  const ctx=cv.getContext("2d");
  ctx.imageSmoothingEnabled=false;

  const painters={
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
      for(let i=0;i<10;i++){ const bx=(r2()*(TILE-3))|0, by=(r2()*(TILE-3))|0, s=1+((r2()*2)|0);
        for(let dx=0;dx<=s;dx++)for(let dy=0;dy<=s;dy++){ if(r2()>0.35) px(bx+dx,by+dy, shade(mineral,0.7+r2()*0.5)); } } },
    coal_ore(px){ painters._ore(px, 201, 0x2a2a2a); },
    iron_ore(px){ painters._ore(px, 202, 0xc99a6a); },
    gold_ore(px){ painters._ore(px, 203, 0xf2d24a); },
    diamond_ore(px){ painters._ore(px, 204, 0x6fe6e0); },
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

    birch_top(px){ painters._log_top(px,0xe8dcc0,301); },
    birch_side(px){ const rnd=trng(302); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ px(x,y, shade(0xd8cba8,0.88+rnd()*0.16)); if(rnd()>0.94) px(x,y, shade(0x3a3a3a,1)); } },
    spruce_top(px){ painters._log_top(px,0x5a3f28,303); },
    spruce_side(px){ painters._log_side(px,0x4a3420,304); },
    granite(px){ painters._speck(px,0xa06a54,311,0x804a38); },
    andesite(px){ painters._speck(px,0x8a8a90,312,0x6a6a70); },
    diorite(px){ painters._speck(px,0xdcdcdc,313,0xffffff); },
    gravel(px){ const rnd=trng(314); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0x8a8078,0.7+n*0.5)); if(n>0.85) px(x,y, shade(0x5a544e,1)); } },
    clay(px){ painters._noise(px,0xa0a6b0,315,0.16); },
    snow(px){ painters._noise(px,0xf4f8ff,316,0.1); },
    obsidian(px){ const rnd=trng(317); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const n=rnd(); px(x,y, shade(0x1a1428,0.7+n*0.6)); if(n>0.9) px(x,y, shade(0x5a4a80,1)); } },
    birch_plank(px){ painters._planks(px,0xe4d8b8,321); },
    spruce_plank(px){ painters._planks(px,0x6a4f34,322); },
    pol_granite(px){ painters._polished(px,0xb47a64,323); },
    pol_andesite(px){ painters._polished(px,0x9a9aa0,324); },
    pol_diorite(px){ painters._polished(px,0xececec,325); },
    terracotta(px){ painters._noise(px,0xb06a4a,326,0.18); },
    ice(px){ const rnd=trng(327); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x9cc8f0,0.9+rnd()*0.14)); for(let i=0;i<TILE;i++) px(i,i,shade(0xd0e8ff,1)); },
    packed_snow(px){ painters._noise(px,0xeef4ff,328,0.08); },
    chiseled_sandstone(px){ const rnd=trng(329); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0xcab878,0.9+rnd()*0.14));
      for(let i=0;i<TILE;i++){ px(2,i,shade(0xa89858,1)); px(TILE-3,i,shade(0xa89858,1)); px(i,7,shade(0xa89858,1)); } },
    smooth_stone(px){ painters._noise(px,0x9a9a9a,330,0.12); },
    craft_top(px){ const rnd=trng(331); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++) px(x,y, shade(0x9a6a3a,0.85+rnd()*0.2));
      for(let i=0;i<TILE;i++){ px(TILE/2|0,i,shade(0x5a3a1a,1)); px(i,TILE/2|0,shade(0x5a3a1a,1)); } },
    craft_side(px){ painters._planks(px,0x8a5a2a,332); for(let x=2;x<7;x++)for(let y=2;y<7;y++) if((x+y)%2) px(x,y,shade(0x5a3a1a,1)); },
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
    iron_block(px){ painters._metal(px,0xe8e8e8,338); },
    gold_block(px){ painters._metal(px,0xf2d24a,339); },
    diamond_block(px){ painters._metal(px,0x6fe6e0,340); },
    glass_pane(px){ for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ const edge=(x<2||x>TILE-3); px(x,y, edge? shade(0xcfe8f0,1):"rgba(207,232,240,0.2)"); } },
    wool_white(px){ painters._wool(px,0xf0f0f0,350); },
    wool_red(px){ painters._wool(px,0xb03030,351); },
    wool_blue(px){ painters._wool(px,0x3050b0,352); },
    wool_green(px){ painters._wool(px,0x40904a,353); },
    wool_yellow(px){ painters._wool(px,0xe0c040,354); },
    wool_black(px){ painters._wool(px,0x2a2a2a,355); },
  };

  const TILE_NAMES = Object.keys(painters).filter(k => !k.startsWith('_'));
  TILE_NAMES.forEach((name,i)=>{
    const col=i%ATLAS_COLS, row=(i/ATLAS_COLS)|0;
    paintTile(ctx, col, row, painters[name]||painters.stone);
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
      if(y > 0 && (below === AIR || (below === WATER && waterFlowDist(x, y-1, z) > 0))){
        setWater(x, y-1, z, 0); // Vertical falling stream acts as source
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
  const chunks=new Set();
  for(const k of changed){ const [x,,z]=k.split(",").map(Number); chunks.add(keyOf(Math.floor(x/CHUNK),Math.floor(z/CHUNK))); }
  for(const ck of chunks){ const [cx,cz]=ck.split(",").map(Number); const ch=getChunk(cx,cz); if(ch&&ch.generated){ computeChunkLight(ch); updateChunkMesh(ch); } }
}
