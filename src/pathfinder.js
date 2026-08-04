import * as THREE from 'three';
import { world, player, webgl, game } from './state.js';
import { getBlock } from './world.js';
import { isSolid, BLOCKS, surfaceHeight } from './config.js';
import { toast } from './ui.js';

// ---- Active Navigation State ----
export let activeNavigation = null;
let pathMeshGroup = null;

export function setActiveNavigation(navObj) {
  activeNavigation = navObj;
  if (!navObj) clearPathTrail();
}

export function clearActiveNavigation() {
  activeNavigation = null;
  clearPathTrail();
}

// ── Binary Min-Heap Priority Queue for High-Speed A* Pathfinding ─────────────
class MinHeap {
  constructor() {
    this.data = [];
  }
  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }
  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const bottom = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this._sinkDown(0);
    }
    return top;
  }
  size() { return this.data.length; }
  _bubbleUp(idx) {
    while (idx > 0) {
      const pIdx = (idx - 1) >> 1;
      if (this.data[idx].f < this.data[pIdx].f) {
        const tmp = this.data[idx];
        this.data[idx] = this.data[pIdx];
        this.data[pIdx] = tmp;
        idx = pIdx;
      } else break;
    }
  }
  _sinkDown(idx) {
    const len = this.data.length;
    while (true) {
      let smallest = idx;
      const left = (idx << 1) + 1;
      const right = (idx << 1) + 2;
      if (left < len && this.data[left].f < this.data[smallest].f) smallest = left;
      if (right < len && this.data[right].f < this.data[smallest].f) smallest = right;
      if (smallest !== idx) {
        const tmp = this.data[idx];
        this.data[idx] = this.data[smallest];
        this.data[smallest] = tmp;
        idx = smallest;
      } else break;
    }
  }
}

// ── Key for A* node hashing ──────────────────────────────────────────────────
function nodeKey(x, y, z) { return `${x},${y},${z}`; }

// ── 3D Octile Distance Heuristic with tie-breaker ───────────────────────────
function heuristic(x1, y1, z1, x2, y2, z2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const dz = Math.abs(z2 - z1);
  const minXZ = Math.min(dx, dz);
  const maxXZ = Math.max(dx, dz);
  // Octile 2D distance + Y delta + small tie-breaker factor
  const flatDist = (maxXZ - minXZ) + 1.414 * minXZ;
  return (flatDist + dy * 1.1) * 1.0005;
}

// ── Checks if a 2-block-tall entity fits at (x, y=feet, z) ───────────────────
function playerFits(x, y, z) {
  if (y < 0 || y > 254) return false;
  const feet = getBlock(x, y, z);
  const head = getBlock(x, y + 1, z);
  const feetOk = !isSolid(feet) || feet === 8 || feet === 9;
  const headOk = !isSolid(head) || head === 8 || head === 9;
  return feetOk && headOk;
}

// ── Does block below provide solid floor or liquid to stand/float on? ────────
function hasGround(x, y, z) {
  if (y <= 0) return true;
  const below = getBlock(x, y - 1, z);
  return isSolid(below) || below === 8 || below === 9;
}

// ── Is block lava or dangerous hazard? ───────────────────────────────────────
function isHazard(blockId) {
  // TNT (56) or future lava definitions
  return blockId === 56;
}

// ── Mining cost for a block (0 if non-solid) ─────────────────────────────────
function miningCost(blockId) {
  if (!isSolid(blockId) || blockId === 8 || blockId === 9) return 0;
  return BLOCKS[blockId]?.hardness ?? 1.0;
}

// ── Flat direction vectors ───────────────────────────────────────────────────
const CARDINAL_DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1]
];
const DIAGONAL_DIRS = [
  [1, 1], [-1, 1], [1, -1], [-1, -1]
];

/**
 * Advanced High-Performance 3D Voxel A* Pathfinder
 *
 * Capabilities:
 * - Priority Queue Min-Heap for fast expansions
 * - Corner-clipping prevention on diagonal moves
 * - 1-block & 2-block parkour gap jumping over pits/water
 * - Hazard/Lava avoidance & fall damage penalties
 * - Fallback to closest node if destination is unreachable
 * - Real-time smooth line-of-sight post-processing
 */
export function findPath(start, target, maxExpansions = 1200, options = {}) {
  if (!start || !target) return [];

  const miningAllowed   = options.miningAllowed   !== false;
  const miningPenalty   = options.miningPenalty   ?? 10.0;
  const waterPenalty    = options.waterPenalty    ?? 4.0;
  const undergroundBias = options.undergroundBias ?? 0;
  const maxFall         = options.maxFallBlocks   ?? 4;
  const refY            = options.referenceY      ?? Math.max(start.y, target.y, 62);

  const sx = Math.floor(start.x),  sy = Math.floor(start.y),  sz = Math.floor(start.z);
  const tx = Math.floor(target.x), ty = Math.floor(target.y), tz = Math.floor(target.z);

  if (!Number.isFinite(sx) || !Number.isFinite(tx)) return [];
  if (sx === tx && sy === ty && sz === tz) {
    return [{ x: tx, y: ty, z: tz, mine: false, water: false, lowClear: false, fallHeight: 0 }];
  }

  const openHeap  = new MinHeap();
  const openMap   = new Map();
  const closedSet = new Set();
  const gScore    = new Map();
  const cameFrom  = new Map();

  const startKey = nodeKey(sx, sy, sz);
  gScore.set(startKey, 0);
  const startH = heuristic(sx, sy, sz, tx, ty, tz);
  const startNode = {
    x: sx, y: sy, z: sz, g: 0, f: startH, key: startKey,
    mine: false, water: false, lowClear: false, fallHeight: 0
  };
  openHeap.push(startNode);
  openMap.set(startKey, startNode);

  let expansions = 0;
  let bestNode   = startNode;
  let bestDist   = heuristic(sx, sy, sz, tx, ty, tz);

  while (openHeap.size() > 0 && expansions < maxExpansions) {
    expansions++;
    const cur = openHeap.pop();
    openMap.delete(cur.key);

    if (closedSet.has(cur.key)) continue;
    closedSet.add(cur.key);

    if (cur.x === tx && cur.y === ty && cur.z === tz) {
      bestNode = cur;
      break;
    }

    const d = heuristic(cur.x, cur.y, cur.z, tx, ty, tz);
    if (d < bestDist) {
      bestDist = d;
      bestNode = cur;
    }

    // ── Generate neighbors ──────────────────────────────────────────────────
    const neighbors = [];

    // 1. Cardinal movements (walk, step up 1, step down 1)
    for (const [dx, dz] of CARDINAL_DIRS) {
      neighbors.push({ nx: cur.x + dx, ny: cur.y,     nz: cur.z + dz, baseCost: 1.0, moveType: 'walk' });
      neighbors.push({ nx: cur.x + dx, ny: cur.y + 1, nz: cur.z + dz, baseCost: 1.6, moveType: 'jump' });
      neighbors.push({ nx: cur.x + dx, ny: cur.y - 1, nz: cur.z + dz, baseCost: 1.1, moveType: 'step_down' });

      // Gap Jumping (Parkour 1-block & 2-block gaps across pits/water)
      // Check if immediate block ahead is a drop/air
      const aheadFeet = getBlock(cur.x + dx, cur.y, cur.z + dz);
      const aheadGround = getBlock(cur.x + dx, cur.y - 1, cur.z + dz);
      if (!isSolid(aheadFeet) && !isSolid(aheadGround)) {
        // 1-block gap jump (landing at cur.x + 2*dx)
        neighbors.push({ nx: cur.x + dx * 2, ny: cur.y,     nz: cur.z + dz * 2, baseCost: 2.2, moveType: 'gap_jump' });
        neighbors.push({ nx: cur.x + dx * 2, ny: cur.y - 1, nz: cur.z + dz * 2, baseCost: 2.3, moveType: 'gap_jump' });

        // 2-block gap jump (landing at cur.x + 3*dx)
        neighbors.push({ nx: cur.x + dx * 3, ny: cur.y,     nz: cur.z + dz * 3, baseCost: 3.2, moveType: 'gap_jump' });
        neighbors.push({ nx: cur.x + dx * 3, ny: cur.y - 1, nz: cur.z + dz * 3, baseCost: 3.3, moveType: 'gap_jump' });
      }
    }

    // 2. Diagonal movements (with strict corner clipping checks)
    for (const [dx, dz] of DIAGONAL_DIRS) {
      // Corner collision check: both adjacent orthogonal blocks must be passable
      const s1Feet = getBlock(cur.x + dx, cur.y, cur.z);
      const s2Feet = getBlock(cur.x, cur.y, cur.z + dz);
      const s1Head = getBlock(cur.x + dx, cur.y + 1, cur.z);
      const s2Head = getBlock(cur.x, cur.y + 1, cur.z + dz);

      const s1Blocked = isSolid(s1Feet) || isSolid(s1Head);
      const s2Blocked = isSolid(s2Feet) || isSolid(s2Head);

      // Skip diagonal if cutting through pinched solid corner
      if (s1Blocked && s2Blocked) continue;

      const diagCost = 1.414;
      neighbors.push({ nx: cur.x + dx, ny: cur.y,     nz: cur.z + dz, baseCost: diagCost,       moveType: 'walk' });
      neighbors.push({ nx: cur.x + dx, ny: cur.y + 1, nz: cur.z + dz, baseCost: diagCost + 0.6, moveType: 'jump' });
      neighbors.push({ nx: cur.x + dx, ny: cur.y - 1, nz: cur.z + dz, baseCost: diagCost + 0.1, moveType: 'step_down' });
    }

    // 3. Vertical Falls (straight down shaft up to maxFall blocks)
    for (let fall = 2; fall <= maxFall; fall++) {
      neighbors.push({ nx: cur.x, ny: cur.y - fall, nz: cur.z, baseCost: 0.8 + fall * 0.4, moveType: 'fall', fallH: fall });
    }

    // ── Evaluate neighbors ──────────────────────────────────────────────────
    for (const nb of neighbors) {
      const { nx, ny, nz, baseCost, moveType, fallH = 0 } = nb;
      if (ny < 0 || ny > 255) continue;

      const nkey = nodeKey(nx, ny, nz);
      if (closedSet.has(nkey)) continue;

      let stepCost = baseCost;
      let isMine   = false;
      let isWater  = false;
      let lowClear = false;
      let valid    = true;

      // Hazard check
      const feetB = getBlock(nx, ny, nz);
      const headB = getBlock(nx, ny + 1, nz);
      if (isHazard(feetB) || isHazard(headB)) continue;

      // Jump clearance at source position
      if (moveType === 'jump') {
        const jumpTop = getBlock(cur.x, cur.y + 2, cur.z);
        if (isSolid(jumpTop)) {
          if (miningAllowed) { stepCost += miningPenalty + miningCost(jumpTop); isMine = true; }
          else continue;
        }
      }

      // Gap Jump clearance along jump arc
      if (moveType === 'gap_jump') {
        const headTop = getBlock(cur.x, cur.y + 2, cur.z);
        if (isSolid(headTop)) continue;
      }

      // Fall shaft checks
      if (moveType === 'fall') {
        for (let fy = cur.y - 1; fy >= ny; fy--) {
          const fb  = getBlock(nx, fy,     nz);
          const fbh = getBlock(nx, fy + 1, nz);
          if (isSolid(fb)) {
            if (miningAllowed) { stepCost += miningPenalty + miningCost(fb); isMine = true; }
            else { valid = false; break; }
          }
          if (isSolid(fbh) && fy < cur.y) {
            if (miningAllowed) { stepCost += miningPenalty + miningCost(fbh); isMine = true; }
            else { valid = false; break; }
          }
        }
        if (!valid) continue;
        const landFloor = getBlock(nx, ny - 1, nz);
        if (!isSolid(landFloor) && landFloor !== 8) continue;
        if (fallH > 3) stepCost += (fallH - 3) * 2.5;
      }

      // Standard destination clearance
      if (moveType !== 'fall') {
        // Feet
        if (feetB === 8 || feetB === 9) {
          isWater = true;
          stepCost += waterPenalty;
        } else if (isSolid(feetB)) {
          if (miningAllowed) { stepCost += miningPenalty + miningCost(feetB); isMine = true; }
          else continue;
        }

        // Head
        if (headB === 8 || headB === 9) {
          isWater = true;
          stepCost += waterPenalty * 0.5;
        } else if (isSolid(headB)) {
          if (miningAllowed) { stepCost += miningPenalty + miningCost(headB); isMine = true; }
          else continue;
          lowClear = true;
        }

        // Ground requirement for step_down / walk
        if (moveType === 'step_down' || moveType === 'walk') {
          if (!hasGround(nx, ny, nz) && !isWater) {
            let fallable = false;
            for (let fcheck = 1; fcheck <= maxFall; fcheck++) {
              const fb = getBlock(nx, ny - fcheck, nz);
              if (isSolid(fb) || fb === 8) {
                fallable = true;
                if (fcheck > 3) stepCost += (fcheck - 3) * 2.5;
                break;
              }
              if (isSolid(getBlock(nx, ny - fcheck + 1, nz))) break;
            }
            if (!fallable) continue;
          }
        }
      }

      // Underground bias (prefer surface routes)
      if (undergroundBias > 0 && ny < refY) {
        stepCost += (refY - ny) * undergroundBias;
      }

      const tentG = cur.g + stepCost;
      if (gScore.has(nkey) && tentG >= gScore.get(nkey)) continue;

      cameFrom.set(nkey, cur);
      gScore.set(nkey, tentG);

      const h = heuristic(nx, ny, nz, tx, ty, tz);
      const nextNode = {
        x: nx, y: ny, z: nz,
        g: tentG, f: tentG + h, key: nkey,
        mine: isMine, water: isWater, lowClear, fallHeight: fallH,
      };

      openHeap.push(nextNode);
      openMap.set(nkey, nextNode);
    }
  }

  // Reconstruct path (from start to best reached node)
  const path = [];
  let curr = bestNode;
  while (curr) {
    path.unshift({
      x: curr.x, y: curr.y, z: curr.z,
      mine: curr.mine, water: curr.water,
      lowClear: curr.lowClear, fallHeight: curr.fallHeight
    });
    curr = cameFrom.get(curr.key);
  }

  return smoothPath(path);
}

// ── Line-of-sight Path Smoothing ─────────────────────────────────────────────
function smoothPath(path) {
  if (!path || path.length <= 2) return path || [];

  const smoothed = [path[0]];
  let currIdx = 0;

  while (currIdx < path.length - 1) {
    let furthest = currIdx + 1;
    for (let check = path.length - 1; check > currIdx + 1; check--) {
      if (hasLineOfSight(path[currIdx], path[check])) {
        furthest = check;
        break;
      }
    }
    smoothed.push(path[furthest]);
    currIdx = furthest;
  }

  return smoothed;
}

function hasLineOfSight(p1, p2) {
  if (p1.y !== p2.y) return false; // keep vertical steps exact
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  if (steps === 0) return true;

  const sx = dx / steps;
  const sz = dz / steps;

  for (let i = 1; i <= steps; i++) {
    const cx = Math.round(p1.x + sx * i);
    const cz = Math.round(p1.z + sz * i);
    const cy = p1.y;

    // Must fit player and have ground
    if (isSolid(getBlock(cx, cy, cz)) || isSolid(getBlock(cx, cy + 1, cz))) {
      return false;
    }
    if (!hasGround(cx, cy, cz)) {
      return false;
    }
  }
  return true;
}

// ── Path analysis: returns stats + warnings ───────────────────────────────────
export function analyzePath(pathNodes) {
  if (!pathNodes || pathNodes.length < 2) {
    return { dist: 0, miningCount: 0, waterCount: 0, maxFall: 0, maxShaft: 0,
             lowClearCount: 0, warnings: [], nodeCount: pathNodes?.length ?? 0 };
  }

  let miningCount = 0, waterCount = 0, lowClearCount = 0;
  let currentFall = 0, maxFall = 0;
  let shaftLen = 0, maxShaft = 0;
  const warnings = [];

  for (let i = 1; i < pathNodes.length; i++) {
    const p = pathNodes[i];
    const prev = pathNodes[i - 1];

    if (p.mine)     miningCount++;
    if (p.water)    waterCount++;
    if (p.lowClear) lowClearCount++;

    const isVertical = (p.x === prev.x && p.z === prev.z);
    if (isVertical && p.y < prev.y) {
      currentFall += (prev.y - p.y);
      if (currentFall > maxFall) maxFall = currentFall;
    } else {
      currentFall = 0;
    }

    if (isVertical && p.y !== prev.y) {
      shaftLen++;
      if (shaftLen > maxShaft) maxShaft = shaftLen;
    } else {
      shaftLen = 0;
    }
  }

  const dist = Math.round(pathNodes.length * 0.95);

  if (miningCount > 0)
    warnings.push(`⛏️ Mines through ${miningCount} block${miningCount > 1 ? 's' : ''}`);
  if (waterCount > 2)
    warnings.push(`🌊 Swims through ~${waterCount} water blocks`);
  if (maxFall > 3 && maxFall <= 4)
    warnings.push(`⚠️ Fall of ${maxFall} blocks — bring food`);
  if (maxFall > 4)
    warnings.push(`💀 Fatal fall: ${maxFall} blocks — bring water bucket!`);
  if (maxShaft >= 3)
    warnings.push(`🕳️ Vertical shaft of ${maxShaft} blocks — bring ladders`);
  if (lowClearCount > 0)
    warnings.push(`🪨 Low-clearance passage (must crouch/mine)`);

  return { dist, miningCount, waterCount, maxFall, maxShaft, lowClearCount, warnings, nodeCount: pathNodes.length };
}

// ── Generate 3 alternative routes ────────────────────────────────────────────
export function findAlternativeRoutes(start, target) {
  const refY = Math.round((start.y + target.y) / 2) + 4;
  const routes = [];

  // Route 1: Safest (no mining, surface-hugging)
  const safePath = findPath(start, target, 1600, {
    miningAllowed: false,
    waterPenalty: 6,
    undergroundBias: 0.4,
    referenceY: refY,
    maxFallBlocks: 2,
  });
  if (safePath && safePath.length > 1) {
    const stats = analyzePath(safePath);
    routes.push({
      id: 1,
      label: 'Safest Route',
      icon: '🛡️',
      description: 'No mining. Stays on surface, avoids hazards.',
      path: safePath,
      stats,
      recommended: false,
    });
  }

  // Route 2: Optimal (balanced)
  const optPath = findPath(start, target, 1200, {
    miningAllowed: true,
    miningPenalty: 10,
    waterPenalty: 4,
    undergroundBias: 0.08,
    referenceY: refY,
    maxFallBlocks: 4,
  });
  if (optPath && optPath.length > 1) {
    const stats = analyzePath(optPath);
    routes.push({
      id: 2,
      label: 'Optimal Route',
      icon: '⚡',
      description: 'Best balance of speed and safety.',
      path: optPath,
      stats,
      recommended: true,
    });
  }

  // Route 3: Direct (aggressive mining, shortest geometry)
  const directPath = findPath(start, target, 900, {
    miningAllowed: true,
    miningPenalty: 3,
    waterPenalty: 1.5,
    undergroundBias: 0,
    maxFallBlocks: 4,
  });
  if (directPath && directPath.length > 1) {
    const stats = analyzePath(directPath);
    routes.push({
      id: 3,
      label: 'Direct Route',
      icon: '💎',
      description: 'Shortest path. May require heavy mining.',
      path: directPath,
      stats,
      recommended: false,
    });
  }

  if (routes.length === 0) return null;
  return routes;
}

// ── 3D Glowing Voxel Block Renderer ──────────────────────────────────────────
// Shared box geometry for full voxel block glowing highlight (1.02x1.02x1.02)
const sharedBlockGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);

export function updatePathTrail(pathNodes) {
  if (!webgl.scene) return;
  clearPathTrail();
  if (!pathNodes || pathNodes.length < 1) return;

  pathMeshGroup = new THREE.Group();
  pathMeshGroup.name = 'pathfinder_trail';

  const glowingBlockItems = [];

  for (let i = 0; i < pathNodes.length; i++) {
    const p = pathNodes[i];

    // Determine the exact block position to illuminate:
    // If mining through a block or swimming in water, illuminate node.y
    // Otherwise illuminate the ground block below feet (node.y - 1)
    let bx = p.x;
    let by = p.y - 1;
    let bz = p.z;

    if (p.mine || p.water) {
      by = p.y;
    }

    // Color theme for block glow
    let colorHex = 0x39ff14; // Emerald green
    let baseOpacity = 0.50;

    if (i === 0) {
      colorHex = 0x00e5ff; // Start block: Cyan glow
      baseOpacity = 0.65;
    } else if (i === pathNodes.length - 1) {
      colorHex = 0xffff00; // Destination target block: Golden glow
      baseOpacity = 0.80;
    } else if (p.mine) {
      colorHex = 0xff6600; // Mining block: Orange glow
      baseOpacity = 0.60;
    } else if (p.water) {
      colorHex = 0x00e5ff; // Water block: Cyan glow
      baseOpacity = 0.55;
    }

    // 1. Semi-transparent glowing 3D voxel box overlay
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(sharedBlockGeo, mat);
    mesh.position.set(bx + 0.5, by + 0.5, bz + 0.5);

    // 2. Crisp 3D wireframe edges highlighting the block frame
    const edgesGeo = new THREE.EdgesGeometry(sharedBlockGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
    });
    const wireframe = new THREE.LineSegments(edgesGeo, lineMat);
    mesh.add(wireframe);

    pathMeshGroup.add(mesh);

    glowingBlockItems.push({
      mesh, mat, lineMat, baseOpacity, colorHex, index: i
    });
  }

  // Energy wave animation traveling along path blocks
  let _animTime = 0;
  pathMeshGroup._animTick = (dt) => {
    _animTime += dt * 3.5;
    glowingBlockItems.forEach(({ mat, lineMat, baseOpacity, index }) => {
      const wave = Math.sin(_animTime - index * 0.35);
      const pulseOpacity = baseOpacity + wave * 0.22;
      mat.opacity = Math.max(0.18, Math.min(0.88, pulseOpacity));
      lineMat.opacity = Math.max(0.40, Math.min(1.0, pulseOpacity + 0.25));
    });
  };

  webgl.scene.add(pathMeshGroup);
}

/** Drive the glowing block pulsing animation — called once per frame from main loop */
export function tickPathTrail(dt) {
  if (pathMeshGroup && typeof pathMeshGroup._animTick === 'function') {
    pathMeshGroup._animTick(dt);
  }
}

/** Remove and dispose glowing block trail from the scene */
export function clearPathTrail() {
  if (pathMeshGroup && webgl.scene) {
    webgl.scene.remove(pathMeshGroup);
    pathMeshGroup.traverse(child => {
      if (child.isMesh || child.isLine) {
        child.geometry?.dispose();
        child.material?.dispose();
      }
    });
    pathMeshGroup = null;
  }
}

// ── Waypoints Storage (localStorage) ─────────────────────────────────────────
const WAYPOINTS_KEY = 'voxel_waypoints_v1';

export function getSavedWaypoints() {
  if (typeof window !== 'undefined') window.__getWaypoints = getSavedWaypoints;
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(WAYPOINTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

export function saveWaypoint(name, x, y, z, icon = '📍') {
  const waypoints = getSavedWaypoints();
  const safeName = String(name || 'Waypoint').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim().slice(0, 50);
  waypoints.push({ id: Date.now().toString(), name: safeName, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), icon });
  if (typeof localStorage !== 'undefined') localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(waypoints));
  toast(`📍 Waypoint '${safeName}' saved!`);
  return waypoints;
}

export function deleteWaypoint(id) {
  let waypoints = getSavedWaypoints().filter(w => w.id !== id);
  if (typeof localStorage !== 'undefined') localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(waypoints));
  toast(`🗑️ Waypoint removed.`);
  return waypoints;
}

export function saveHomeBase(x, y, z, ownerEmail = null) {
  let waypoints = getSavedWaypoints().filter(w => w.name !== 'My Base' && w.icon !== '🏡');
  const newWp = { id: 'base_' + Date.now(), name: 'My Base', x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), icon: '🏡',
                  ownerEmail: ownerEmail || (typeof window !== 'undefined' && window.__currentUserEmail) || 'Me' };
  waypoints.unshift(newWp);
  if (typeof localStorage !== 'undefined') localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(waypoints));
  toast(`🏡 Set current position as My Base (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)})!`);
  return waypoints;
}

export function saveFarm(x, y, z, ownerEmail = null) {
  let waypoints = getSavedWaypoints().filter(w => w.name !== 'My Farm' && w.icon !== '🌾');
  const newWp = { id: 'farm_' + Date.now(), name: 'My Farm', x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), icon: '🌾',
                  ownerEmail: ownerEmail || (typeof window !== 'undefined' && window.__currentUserEmail) || 'Me' };
  waypoints.unshift(newWp);
  if (typeof localStorage !== 'undefined') localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(waypoints));
  toast(`🌾 Set current position as My Farm (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)})!`);
  return waypoints;
}
