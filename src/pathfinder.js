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

// ── Key for A* node hashing ──────────────────────────────────────────────────
function nodeKey(x, y, z) { return `${x},${y},${z}`; }

// ── Distance heuristic (Euclidean 3D) ────────────────────────────────────────
function heuristic(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1, dy = (y2 - y1) * 0.6, dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── Player occupancy check: 2-block-tall player at (x, y=feet, z) ────────────
function playerFits(x, y, z) {
  if (y < 0 || y > 254) return false;
  const feet = getBlock(x, y, z);
  const head = getBlock(x, y + 1, z);
  const feetOk = !isSolid(feet)  || feet  === 8 || feet  === 9;
  const headOk = !isSolid(head)  || head  === 8 || head  === 9;
  return feetOk && headOk;
}

// Does the block below provide a floor (something to stand on)?
function hasGround(x, y, z) {
  if (y <= 0) return true; // bedrock bottom
  const below = getBlock(x, y - 1, z);
  return isSolid(below) || below === 8 || below === 9;
}

// Mining cost for a block (0 if not solid)
function miningCost(blockId) {
  if (!isSolid(blockId) || blockId === 8 || blockId === 9) return 0;
  return (BLOCKS[blockId]?.hardness ?? 1.0);
}

// ── Movement offsets ─────────────────────────────────────────────────────────
const FLAT_DIRS = [
  [1,0], [-1,0], [0,1], [0,-1],
  [1,1], [-1,1], [1,-1], [-1,-1],
];

/**
 * Improved A* Voxel Pathfinder
 *
 * options:
 *   miningAllowed    (bool, default true)  – can path mine through blocks
 *   miningPenalty    (num,  default 10)    – added cost per block mined
 *   waterPenalty     (num,  default 4)     – added cost per water block traversed
 *   undergroundBias  (num,  default 0)     – extra cost per block below referenceY
 *   referenceY       (num,  default auto)  – y considered "surface"
 *   maxFallBlocks    (num,  default 4)     – max safe fall distance
 *   maxExpansions    (num,  default 800)
 */
export function findPath(start, target, maxExpansions = 800, options = {}) {
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
  if (sx === tx && sy === ty && sz === tz)
    return [{ x: tx, y: ty, z: tz, mine: false, water: false, lowClear: false, fallHeight: 0 }];

  const openSet    = [];
  const openSetMap = new Map();
  const closedSet  = new Set();
  const gScore     = new Map();
  const cameFrom   = new Map();

  const startKey = nodeKey(sx, sy, sz);
  gScore.set(startKey, 0);
  const startH = heuristic(sx, sy, sz, tx, ty, tz);
  const startNode = { x: sx, y: sy, z: sz, g: 0, f: startH, key: startKey,
                      mine: false, water: false, lowClear: false, fallHeight: 0 };
  openSet.push(startNode);
  openSetMap.set(startKey, startNode);

  let expansions = 0;
  let bestNode   = startNode;
  let bestDist   = heuristic(sx, sy, sz, tx, ty, tz);

  while (openSet.length > 0 && expansions < maxExpansions) {
    expansions++;

    // Pop node with smallest f (simple sort — acceptable for typical path lengths)
    openSet.sort((a, b) => a.f - b.f);
    const cur = openSet.shift();
    openSetMap.delete(cur.key);

    if (cur.x === tx && cur.y === ty && cur.z === tz) { bestNode = cur; break; }

    const d = heuristic(cur.x, cur.y, cur.z, tx, ty, tz);
    if (d < bestDist) { bestDist = d; bestNode = cur; }

    closedSet.add(cur.key);

    // ── Generate neighbours ─────────────────────────────────────────────────
    const neighbors = [];

    for (const [dx, dz] of FLAT_DIRS) {
      const isDiag = (dx !== 0 && dz !== 0);
      const baseCost = isDiag ? 1.414 : 1.0;

      // FLAT: same Y
      neighbors.push({ nx: cur.x+dx, ny: cur.y,   nz: cur.z+dz, baseCost, moveType: 'walk'      });
      // STEP UP 1: can only jump if headroom at source (cur.y+2) is free
      neighbors.push({ nx: cur.x+dx, ny: cur.y+1, nz: cur.z+dz, baseCost: baseCost+0.6, moveType: 'jump' });
      // STEP DOWN 1
      neighbors.push({ nx: cur.x+dx, ny: cur.y-1, nz: cur.z+dz, baseCost: baseCost+0.1, moveType: 'step_down' });
    }

    // FALLS: straight-down up to maxFall blocks (only along cardinal x or z could also fall while moving,
    // but pure vertical fall is the most common vertical shaft scenario)
    for (let fall = 2; fall <= maxFall; fall++) {
      neighbors.push({ nx: cur.x, ny: cur.y - fall, nz: cur.z, baseCost: 0.8 + fall * 0.4, moveType: 'fall', fallH: fall });
    }

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

      // ── Jump: need clearance at cur.y+2 (top of player's head while jumping) ──
      if (moveType === 'jump') {
        const jumpTop = getBlock(cur.x, cur.y + 2, cur.z);
        if (isSolid(jumpTop)) {
          if (miningAllowed) { stepCost += miningPenalty + miningCost(jumpTop); isMine = true; }
          else { continue; }
        }
      }

      // ── Fall: all blocks along the shaft must be clear (or minable) ─────────
      if (moveType === 'fall') {
        for (let fy = cur.y - 1; fy >= ny; fy--) {
          const fb  = getBlock(nx, fy,     nz);
          const fbh = getBlock(nx, fy + 1, nz);
          if (isSolid(fb)) {
            if (miningAllowed) { stepCost += miningPenalty + miningCost(fb); isMine = true; }
            else { valid = false; break; }
          }
          if (isSolid(fbh) && fy < cur.y) { // head block during fall
            if (miningAllowed) { stepCost += miningPenalty + miningCost(fbh); isMine = true; }
            else { valid = false; break; }
          }
        }
        if (!valid) continue;
        // Must land on solid ground
        const landFloor = getBlock(nx, ny - 1, nz);
        if (!isSolid(landFloor) && landFloor !== 8) continue;
        // Fall damage penalty (Minecraft: damage starts at fall > 3 blocks)
        if (fallH > 3) stepCost += (fallH - 3) * 2.0;
      }

      // ── Destination clearance (feet + head for 2-block player) ──────────────
      if (moveType !== 'fall') {
        const feetB = getBlock(nx, ny,     nz);
        const headB = getBlock(nx, ny + 1, nz);

        // Feet
        if (feetB === 8 || feetB === 9)     { isWater = true; stepCost += waterPenalty; }
        else if (isSolid(feetB)) {
          if (miningAllowed) { stepCost += miningPenalty + miningCost(feetB); isMine = true; }
          else continue;
        }

        // Head
        if (headB === 8 || headB === 9)     { isWater = true; stepCost += waterPenalty * 0.5; }
        else if (isSolid(headB)) {
          if (miningAllowed) { stepCost += miningPenalty + miningCost(headB); isMine = true; }
          else { continue; }
          lowClear = true; // 1-block clearance passage (requires mining)
        }

        // For step-down: need solid floor at destination (or detect fall)
        if (moveType === 'step_down' || moveType === 'walk') {
          if (!hasGround(nx, ny, nz) && !isWater) {
            // Check if there's a floor within maxFall blocks
            let fallable = false;
            for (let fcheck = 1; fcheck <= maxFall; fcheck++) {
              const fb = getBlock(nx, ny - fcheck, nz);
              if (isSolid(fb) || fb === 8) { fallable = true; if (fcheck > 3) stepCost += (fcheck - 3) * 2.0; break; }
              if (isSolid(getBlock(nx, ny - fcheck + 1, nz))) break;
            }
            if (!fallable) continue;
          }
        }
      }

      // ── Underground bias (prefer surface routes) ─────────────────────────────
      if (undergroundBias > 0 && ny < refY) {
        stepCost += (refY - ny) * undergroundBias;
      }

      const tentG = cur.g + stepCost;
      if (gScore.has(nkey) && tentG >= gScore.get(nkey)) continue;

      cameFrom.set(nkey, { ...cur, _nextType: moveType, _fallH: fallH });
      gScore.set(nkey, tentG);

      const h = heuristic(nx, ny, nz, tx, ty, tz);
      const nextNode = {
        x: nx, y: ny, z: nz,
        g: tentG, f: tentG + h, key: nkey,
        mine: isMine, water: isWater, lowClear, fallHeight: fallH,
      };

      if (openSetMap.has(nkey)) {
        const ex = openSetMap.get(nkey);
        ex.g = tentG; ex.f = tentG + h;
      } else {
        openSet.push(nextNode);
        openSetMap.set(nkey, nextNode);
      }
    }
  }

  // Reconstruct path
  const path = [];
  let curr = bestNode;
  while (curr) {
    path.unshift({ x: curr.x, y: curr.y, z: curr.z,
                   mine: curr.mine, water: curr.water,
                   lowClear: curr.lowClear, fallHeight: curr.fallHeight });
    curr = cameFrom.get(curr.key);
  }
  return path;
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

    // Fall tracking (consecutive downward vertical movement without horizontal)
    const isVertical = (p.x === prev.x && p.z === prev.z);
    if (isVertical && p.y < prev.y) {
      currentFall += (prev.y - p.y);
      if (currentFall > maxFall) maxFall = currentFall;
    } else {
      currentFall = 0;
    }

    // Vertical shaft detection (≥3 steps with only y-change)
    if (isVertical && p.y !== prev.y) {
      shaftLen++;
      if (shaftLen > maxShaft) maxShaft = shaftLen;
    } else {
      shaftLen = 0;
    }
  }

  // Approximate walking distance (each node ≈ 1 block, diagonals slightly more)
  const dist = Math.round(pathNodes.length * 0.95);

  // Build human-readable warnings
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

  // ── Route 1: Safest (no mining, surface-hugging) ─────────────────────────
  const safePath = findPath(start, target, 1400, {
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

  // ── Route 2: Optimal (balanced) ──────────────────────────────────────────
  const optPath = findPath(start, target, 1000, {
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

  // ── Route 3: Direct (aggressive mining, shortest geometry) ───────────────
  const directPath = findPath(start, target, 700, {
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

  // If fewer than 3 routes found, at least make sure we have one
  if (routes.length === 0) return null;

  // Mark the recommended route: prefer Optimal if it exists and has fewer warnings than Safest
  // (already marked above)

  return routes;
}

// ── 3D Glowing Floor Tile Trail Renderer ─────────────────────────────────────
const sharedTileGeo = new THREE.BoxGeometry(0.92, 0.06, 0.92);

export function updatePathTrail(pathNodes) {
  if (!webgl.scene) return;
  clearPathTrail();
  if (!pathNodes || pathNodes.length < 2) return;

  pathMeshGroup = new THREE.Group();
  pathMeshGroup.name = 'pathfinder_trail';

  const linePoints = [];

  for (let i = 0; i < pathNodes.length; i++) {
    const p   = pathNodes[i];
    const px  = p.x + 0.5;
    const py  = p.y + 1.01; // just above block surface
    const pz  = p.z + 0.5;

    linePoints.push(new THREE.Vector3(px, py + 0.5, pz));

    // Colour coding
    let color, opacity;
    if (p.mine)       { color = 0xff6600; opacity = 0.88; }
    else if (p.water) { color = 0x00e5ff; opacity = 0.75; }
    else              { color = 0x39ff14; opacity = i === 0 ? 1.0 : 0.72; }

    const tileMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const tile = new THREE.Mesh(sharedTileGeo, tileMat);
    tile.position.set(px, py, pz);
    pathMeshGroup.add(tile);

    // Beacon pillars: start, end, every 5th node
    if (i === 0 || i === pathNodes.length - 1 || i % 5 === 0) {
      const bGeo = new THREE.BoxGeometry(0.18, 1.4, 0.18);
      const bMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
      const beacon = new THREE.Mesh(bGeo, bMat);
      beacon.position.set(px, py + 0.7, pz);
      pathMeshGroup.add(beacon);
    }
  }

  // Connecting line
  if (linePoints.length > 1) {
    const geo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const mat = new THREE.LineBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.50 });
    pathMeshGroup.add(new THREE.Line(geo, mat));
  }

  // Pulsing animation tick stored on the group
  let _phase = 0;
  pathMeshGroup._animTick = (dt) => {
    _phase = (_phase + dt * 2.2) % (Math.PI * 2);
    const pulse = 0.55 + 0.38 * Math.sin(_phase);
    pathMeshGroup.children.forEach(child => {
      if (child.isMesh && child.material?.transparent) {
        const isTile   = child.geometry === sharedTileGeo;
        child.material.opacity = Math.max(0.08, Math.min(1, isTile ? pulse : (1.05 - pulse) * 0.65));
      }
    });
  };

  webgl.scene.add(pathMeshGroup);
}

/** Drive the pulsing animation — call once per frame from the main game loop. */
export function tickPathTrail(dt) {
  if (pathMeshGroup && typeof pathMeshGroup._animTick === 'function') {
    pathMeshGroup._animTick(dt);
  }
}

/** Remove and dispose the trail from the scene. */
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
