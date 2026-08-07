import * as THREE from 'three';
import { world, player, webgl, game } from './state.js';
import { getBlock } from './world.js';
import { isSolid, BLOCKS, surfaceHeight } from './config.js';
import { toast } from './ui.js';
import { isVillageCenterChunk, getVillageLayout } from './villageGenerator.js';

// ---- Active Navigation State ----
export let activeNavigation = null;
let pathMeshGroup = null;

export function setActiveNavigation(navObj) {
  if (!navObj) {
    activeNavigation = null;
    clearPathTrail();
    return;
  }

  const tx = navObj.targetPos?.x ?? navObj.x ?? 0;
  const ty = navObj.targetPos?.y ?? navObj.y ?? 64;
  const tz = navObj.targetPos?.z ?? navObj.z ?? 0;
  const name = navObj.targetName || navObj.name || 'Waypoint';
  const icon = navObj.targetIcon || navObj.icon || '📍';

  activeNavigation = {
    ...navObj,
    x: tx,
    y: ty,
    z: tz,
    targetPos: { x: tx, y: ty, z: tz },
    name,
    targetName: name,
    icon,
    targetIcon: icon,
  };
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
  // TNT (56, 117, 118, 119) or future lava definitions
  return blockId === 56 || blockId === 117 || blockId === 118 || blockId === 119;
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
// ── Scans downward from Y=250 at (x, z) to find real top surface (including built towers/structures) ──
export function getRealSurfaceY(x, z, fallbackY = 64) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  for (let y = 250; y >= 1; y--) {
    const b = getBlock(bx, y, bz);
    if (isSolid(b) || b === 8 || b === 9) {
      return y + 1; // Standable position is 1 block above top solid/water
    }
  }
  return surfaceHeight(bx, bz) + 1;
}

export function findPath(start, target, maxExpansions = 1200, options = {}) {
  if (!start || !target) return [];

  const miningAllowed   = options.miningAllowed   !== false;
  const miningPenalty   = options.miningPenalty   ?? 10.0;
  const waterPenalty    = options.waterPenalty    ?? 4.0;
  const undergroundBias = options.undergroundBias ?? 0;
  const maxFall         = options.maxFallBlocks   ?? 4;

  let sx = Math.floor(start.x),  sy = Math.floor(start.y),  sz = Math.floor(start.z);
  let tx = Math.floor(target.x), ty = Math.floor(target.y), tz = Math.floor(target.z);

  // Auto-adjust start Y if player feet is inside a solid block/slab/farmland or standing on block edge
  if (sy > 0 && sy < 255) {
    if (isSolid(getBlock(sx, sy, sz))) {
      // Inside solid block: search upwards for first clear standable Y
      for (let dy = 1; dy <= 4; dy++) {
        if (!isSolid(getBlock(sx, sy + dy, sz))) {
          sy = sy + dy;
          break;
        }
      }
    } else if (!hasGround(sx, sy, sz) && !isSolid(getBlock(sx, sy - 1, sz)) && getBlock(sx, sy, sz) !== 8) {
      // Floating or mid-air: search downwards for solid floor
      for (let dy = 1; dy <= 4; dy++) {
        if (sy - dy <= 1) break;
        if (isSolid(getBlock(sx, sy - dy - 1, sz)) || getBlock(sx, sy - dy - 1, sz) === 8) {
          sy = sy - dy;
          break;
        }
      }
    }
  }

  // Auto-adjust target Y if specified target coordinate is inside a solid block or floating in air
  if (ty > 0 && ty < 255) {
    if (isSolid(getBlock(tx, ty, tz))) {
      // Inside solid block: search upwards for first clear standable Y
      for (let dy = 1; dy <= 6; dy++) {
        if (!isSolid(getBlock(tx, ty + dy, tz))) {
          ty = ty + dy;
          break;
        }
      }
    } else if (!hasGround(tx, ty, tz) && !isSolid(getBlock(tx, ty - 1, tz)) && getBlock(tx, ty, tz) !== 8) {
      // Floating in air: search downwards for solid/water floor
      for (let dy = 1; dy <= 12; dy++) {
        if (ty - dy <= 1) break;
        if (isSolid(getBlock(tx, ty - dy - 1, tz)) || getBlock(tx, ty - dy - 1, tz) === 8) {
          ty = ty - dy;
          break;
        }
      }
    }
  }

  const refY = options.referenceY ?? Math.max(sy, ty, 62);

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
  const dx = target.x - start.x;
  const dz = target.z - start.z;
  const directDist = Math.hypot(dx, dz);

  // Handle long-distance navigation (>50m, such as NPC Villages)
  if (directDist > 50) {
    const steps = Math.max(4, Math.ceil(directDist / 12));
    const longPath = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wx = Math.round(start.x + dx * t);
      const wz = Math.round(start.z + dz * t);
      let wy;
      if (i === 0) {
        wy = Math.floor(start.y);
      } else if (i === steps) {
        wy = Math.floor(target.y);
      } else {
        const surfY = surfaceHeight(wx, wz);
        wy = (surfY > 0 ? surfY + 1 : Math.floor((start.y * (1 - t)) + (target.y * t)));
      }
      longPath.push({ x: wx, y: wy, z: wz, mine: false, water: false, lowClear: false, fallHeight: 0 });
    }

    const stats = analyzePath(longPath);
    stats.dist = Math.round(directDist);

    return [
      {
        id: 1,
        label: 'Overland Surface Highway',
        icon: '🛡️',
        description: 'Surface-hugging trail directly to Village Central Well.',
        path: longPath,
        stats,
        recommended: false,
      },
      {
        id: 2,
        label: 'Optimal Village Route',
        icon: '⚡',
        description: 'Best balanced path to nearest NPC Village.',
        path: longPath,
        stats,
        recommended: true,
      },
      {
        id: 3,
        label: 'Direct Beacon Beam',
        icon: '💎',
        description: 'Direct straight-line waypoint trail to village.',
        path: longPath,
        stats,
        recommended: false,
      }
    ];
  }

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

// ── Glowing Surface Block Renderer ───────────────────────────────────────────
// Renders a thin glowing plane ON TOP of the actual ground block the player
// walks on. Two root causes of visual bugs are fixed:
//
//  1. MISSING BLOCKS — smoothPath() reduces A* output to a few LOS waypoints,
//     leaving giant gaps. We re-interpolate every integer block position between
//     consecutive waypoints so the path is fully continuous with no gaps.
//
//  2. FLOATING PLANES — interpolated/smoothed nodes can be at a Y that doesn't
//     match the actual terrain height at that XZ. We raycast downward (up to 4
//     blocks) from each node to find the real solid surface and place the glow
//     there instead.

function createDestinationBillboard(name, icon = '📍') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(15, 18, 24, 0.88)';
  ctx.strokeStyle = '#ffff00';
  ctx.lineWidth = 6;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(8, 8, 496, 112, 24);
  } else {
    ctx.rect(8, 8, 496, 112);
  }
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#ffff00';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${icon} ${name}`, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(5.0, 1.25, 1.0);
  return sprite;
}

export function updatePathTrail(pathNodes) {
  if (!webgl.scene) return;
  clearPathTrail();
  if (!pathNodes || pathNodes.length < 1) return;

  pathMeshGroup = new THREE.Group();
  pathMeshGroup.name = 'pathfinder_trail';

  const glowingBlockItems = [];

  // ─── Step 1: Expand smoothed waypoints back into every block position ─────
  const visualBlocks = [];
  const seenKeys     = new Set();

  const addVisBlock = (x, y, z, nodeType, srcNode) => {
    const k = `${x},${y},${z}`;
    if (seenKeys.has(k)) return;
    seenKeys.add(k);
    visualBlocks.push({
      x, y, z, nodeType,
      mine:  srcNode?.mine  ?? false,
      water: srcNode?.water ?? false,
    });
  };

  for (let i = 0; i < pathNodes.length; i++) {
    const p        = pathNodes[i];
    const nodeType = i === 0 ? 'start' : i === pathNodes.length - 1 ? 'end' : 'normal';
    addVisBlock(p.x, p.y, p.z, nodeType, p);

    if (i < pathNodes.length - 1) {
      const q     = pathNodes[i + 1];
      const dx    = q.x - p.x;
      const dy    = q.y - p.y;
      const dz    = q.z - p.z;
      // Step along longest axis so every integer block position is covered
      const steps = Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dy));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        addVisBlock(
          Math.round(p.x + dx * t),
          Math.round(p.y + dy * t),
          Math.round(p.z + dz * t),
          'interp',
          null
        );
      }
    }
  }

  // ─── Step 2: Render each visual block ────────────────────────────────────
  for (let i = 0; i < visualBlocks.length; i++) {
    const vb = visualBlocks[i];

    let groundY = vb.y - 1; // fallback: 1 block below feet
    if (!vb.mine) {
      for (let drop = 0; drop <= 4; drop++) {
        const testY = vb.y - 1 - drop;
        const bid   = getBlock(vb.x, testY, vb.z);
        if (isSolid(bid) || bid === 8 || bid === 9) {
          groundY = testY;
          break;
        }
      }
    } else {
      groundY = vb.y; // mining: glow the solid block at feet level itself
    }

    // Color by node role
    let colorHex    = 0x39ff14; // Radioactive green — normal walkable
    let baseOpacity = 0.70;

    if (vb.nodeType === 'start') {
      colorHex    = 0x00e5ff; // Cyan — player start
      baseOpacity = 0.82;
    } else if (vb.nodeType === 'end') {
      colorHex    = 0xffff00; // Gold — destination
      baseOpacity = 0.90;
    } else if (vb.mine) {
      colorHex    = 0xff6600; // Orange — block to be mined
      baseOpacity = 0.78;
    } else if (vb.water) {
      colorHex    = 0x00e5ff; // Cyan — water swim section
      baseOpacity = 0.65;
    }

    const surfaceY = groundY + 1.002;

    const geo = new THREE.PlaneGeometry(0.96, 0.96);
    geo.rotateX(-Math.PI / 2); // Lie flat in XZ plane (face +Y)

    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      depthTest: true, // Respects 3D block occlusion (hidden behind solid walls/terrain)
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(vb.x + 0.5, surfaceY, vb.z + 0.5);

    // Crisp square border outline at the same surface level
    const borderGeo = new THREE.BufferGeometry();
    const half      = 0.48;
    const verts     = new Float32Array([
      -half, 0,  half,
       half, 0,  half,
       half, 0, -half,
      -half, 0, -half,
      -half, 0,  half, // close loop
    ]);
    borderGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
      depthTest: true, // Respects 3D block occlusion
    });
    const border = new THREE.Line(borderGeo, lineMat);
    border.position.set(vb.x + 0.5, surfaceY + 0.002, vb.z + 0.5);

    // Floating 3D Waypoint Orb at +0.35m elevation
    const orbGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const orbMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.88,
      depthTest: true,
    });
    const orbMesh = new THREE.Mesh(orbGeo, orbMat);
    orbMesh.position.set(vb.x + 0.5, surfaceY + 0.35, vb.z + 0.5);

    if (vb.nodeType === 'end') {
      // Tall glowing 3D Vertical Sky Beacon Pillar at destination
      const beaconGeo = new THREE.CylinderGeometry(0.35, 0.35, 50, 16);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      beaconMesh.position.set(vb.x + 0.5, surfaceY + 25, vb.z + 0.5);
      pathMeshGroup.add(beaconMesh);

      // Floating 3D Destination Name Tag Billboard
      const tagSprite = createDestinationBillboard(activeNavigation?.name || 'Waypoint', activeNavigation?.icon || '📍');
      tagSprite.position.set(vb.x + 0.5, surfaceY + 3.8, vb.z + 0.5);
      pathMeshGroup.add(tagSprite);
    }

    pathMeshGroup.add(mesh);
    pathMeshGroup.add(border);
    pathMeshGroup.add(orbMesh);

    glowingBlockItems.push({ mesh, mat, lineMat, orbMat, baseOpacity, colorHex, index: i });
  }

  // Pulsing energy wave animation travelling along path
  let _animTime = 0;
  pathMeshGroup._animTick = (dt) => {
    _animTime += dt * 3.0;
    glowingBlockItems.forEach(({ mat, lineMat, orbMat, baseOpacity, index }) => {
      const wave         = Math.sin(_animTime - index * 0.35);
      const pulseOpacity = baseOpacity + wave * 0.20;
      mat.opacity        = Math.max(0.28, Math.min(0.98, pulseOpacity));
      lineMat.opacity    = Math.max(0.60, Math.min(1.0,  pulseOpacity + 0.15));
      if (orbMat) orbMat.opacity = Math.max(0.65, Math.min(1.0, pulseOpacity + 0.20));
    });
  };

  webgl.scene.add(pathMeshGroup);
}

let lastRepathTime = 0;

/** Drive the glowing block pulsing animation & dynamic arrival/repath check — called once per frame from main loop */
export function tickPathTrail(dt) {
  if (pathMeshGroup && typeof pathMeshGroup._animTick === 'function') {
    pathMeshGroup._animTick(dt);
  }

  if (!activeNavigation || !player || !player.pos) return;

  const tx = activeNavigation.targetPos?.x ?? activeNavigation.x;
  const ty = activeNavigation.targetPos?.y ?? activeNavigation.y;
  const tz = activeNavigation.targetPos?.z ?? activeNavigation.z;

  if (tx === undefined || ty === undefined || tz === undefined) return;

  const dx = tx - player.pos.x;
  const dy = ty - player.pos.y;
  const dz = tz - player.pos.z;
  const dist = Math.hypot(dx, dz);

  // Dynamic arrival check
  if (dist < 1.8 && Math.abs(dy) < 3.0) {
    toast(`🎯 Reached Destination: ${activeNavigation.name || activeNavigation.targetName || 'Waypoint'}!`);
    clearActiveNavigation();
    return;
  }

  // Dynamic Auto-Repath when player strays > 4.5m off-track
  const now = performance.now();
  if (now - lastRepathTime > 2500) {
    lastRepathTime = now;
    const startNode = activeNavigation.pathNodes ? activeNavigation.pathNodes[0] : null;
    if (startNode && Number.isFinite(startNode.x) && Number.isFinite(startNode.z)) {
      const offTrackDist = Math.hypot(player.pos.x - startNode.x, player.pos.z - startNode.z);
      if (offTrackDist > 4.5) {
        const newPath = findPath(player.pos, { x: tx, y: ty, z: tz });
        if (newPath && newPath.length > 1) {
          activeNavigation.pathNodes = newPath;
          updatePathTrail(newPath);
        }
      }
    }
  }
}

/** Remove and dispose glowing surface trail from the scene */
export function clearPathTrail() {
  if (pathMeshGroup && webgl.scene) {
    webgl.scene.remove(pathMeshGroup);
    pathMeshGroup.traverse(child => {
      if (child.isMesh || child.isLine) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
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

export function findNearestVillage(px = player.pos.x, pz = player.pos.z) {
  const pcx = Math.floor(px / 16);
  const pcz = Math.floor(pz / 16);
  let best = null;
  let bestDistSq = Infinity;

  // Scan 80x80 chunk neighborhood (1,280 meters out)
  for (let dx = -40; dx <= 40; dx++) {
    for (let dz = -40; dz <= 40; dz++) {
      const vcx = pcx + dx;
      const vcz = pcz + dz;
      if (isVillageCenterChunk(vcx, vcz)) {
        const layout = getVillageLayout(vcx, vcz);
        if (layout && layout.voxels && layout.voxels.size > 0) {
          const vx = layout.centerWx;
          const vy = (layout.centerBaseY || surfaceHeight(vx, layout.centerWz)) + 1;
          const vz = layout.centerWz;
          const dsq = (vx - px) * (vx - px) + (vz - pz) * (vz - pz);
          if (dsq < bestDistSq) {
            bestDistSq = dsq;
            best = { x: vx, y: vy, z: vz, vcx, vcz, dist: Math.round(Math.sqrt(dsq)) };
          }
        }
      }
    }
  }

  if (!best) return null;

  const dx = best.x - px;
  const dz = best.z - pz;
  let dirStr = '';
  if (Math.abs(dx) > Math.abs(dz)) {
    dirStr = dx > 0 ? 'East' : 'West';
  } else {
    dirStr = dz > 0 ? 'South' : 'North';
  }
  best.direction = `${best.dist}m ${dirStr}`;
  return best;
}
