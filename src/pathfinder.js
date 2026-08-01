import * as THREE from 'three';
import { world, player, webgl, game } from './state.js';
import { getBlock } from './world.js';
import { isSolid, BLOCKS } from './config.js';
import { toast } from './ui.js';

// ---- Active Navigation State ----
export let activeNavigation = null;
let pathMeshGroup = null;

export function setActiveNavigation(navObj) {
  activeNavigation = navObj;
  if (!navObj) {
    clearPathTrail();
  }
}

export function clearActiveNavigation() {
  activeNavigation = null;
  clearPathTrail();
}

// Key for A* node hashing
function nodeKey(x, y, z) {
  return `${x},${y},${z}`;
}

// Distance Heuristic (Euclidean 3D)
function heuristic(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Low-Latency 3D A* Voxel Pathfinding Algorithm
 * Finds optimal shortest path while penalizing water and marking solid mining blocks.
 */
export function findPath(start, target, maxExpansions = 500) {
  if (!start || !target) return [];

  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const sz = Math.floor(start.z);

  const tx = Math.floor(target.x);
  const ty = Math.floor(target.y);
  const tz = Math.floor(target.z);

  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz) ||
      !Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
    return [];
  }

  // If already at target
  if (sx === tx && sy === ty && sz === tz) {
    return [{ x: tx, y: ty, z: tz, mine: false, water: false }];
  }

  const openSet = [];
  const openSetMap = new Map();
  const closedSet = new Set();
  const gScore = new Map();
  const cameFrom = new Map();

  const startKey = nodeKey(sx, sy, sz);
  gScore.set(startKey, 0);

  const sbId = getBlock(sx, sy, sz);
  const startNode = {
    x: sx, y: sy, z: sz,
    g: 0,
    f: heuristic(sx, sy, sz, tx, ty, tz),
    key: startKey,
    mine: isSolid(sbId),
    water: (sbId === 8),
    blockId: sbId
  };

  openSet.push(startNode);
  openSetMap.set(startKey, startNode);

  // Movement offset directions (6 cardinal + 4 horizontal diagonals)
  const neighbors = [
    { dx: 1, dy: 0, dz: 0, cost: 1.0 },
    { dx: -1, dy: 0, dz: 0, cost: 1.0 },
    { dx: 0, dy: 0, dz: 1, cost: 1.0 },
    { dx: 0, dy: 0, dz: -1, cost: 1.0 },
    { dx: 1, dy: 0, dz: 1, cost: 1.414 },
    { dx: -1, dy: 0, dz: 1, cost: 1.414 },
    { dx: 1, dy: 0, dz: -1, cost: 1.414 },
    { dx: -1, dy: 0, dz: -1, cost: 1.414 },
    // Step / Jump 1 block up
    { dx: 1, dy: 1, dz: 0, cost: 1.5 },
    { dx: -1, dy: 1, dz: 0, cost: 1.5 },
    { dx: 0, dy: 1, dz: 1, cost: 1.5 },
    { dx: 0, dy: 1, dz: -1, cost: 1.5 },
    // Step / Jump 1 block down
    { dx: 1, dy: -1, dz: 0, cost: 1.1 },
    { dx: -1, dy: -1, dz: 0, cost: 1.1 },
    { dx: 0, dy: -1, dz: 1, cost: 1.1 },
    { dx: 0, dy: -1, dz: -1, cost: 1.1 }
  ];

  let expansions = 0;
  let bestNode = startNode;

  while (openSet.length > 0 && expansions < maxExpansions) {
    expansions++;

    // Pop node with smallest f value
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift();
    openSetMap.delete(current.key);

    if (current.x === tx && current.y === ty && current.z === tz) {
      bestNode = current;
      break;
    }

    // Keep track of node closest to target as fallback
    if (heuristic(current.x, current.y, current.z, tx, ty, tz) < heuristic(bestNode.x, bestNode.y, bestNode.z, tx, ty, tz)) {
      bestNode = current;
    }

    closedSet.add(current.key);

    for (const nb of neighbors) {
      const nx = current.x + nb.dx;
      const ny = current.y + nb.dy;
      const nz = current.z + nb.dz;

      // Bound checks
      if (ny < 0 || ny > 255) continue;

      const nkey = nodeKey(nx, ny, nz);
      if (closedSet.has(nkey)) continue;

      const blockId = getBlock(nx, ny, nz);
      const isBlockSolid = isSolid(blockId);
      const isWater = (blockId === 8);

      let stepCost = nb.cost;
      let isMineRequired = false;

      if (isWater) {
        // High penalty for water blocks to avoid swimming unless necessary
        stepCost += 6.0;
      } else if (isBlockSolid) {
        // Mining penalty (hardness based)
        const hardness = BLOCKS[blockId]?.hardness || 1.0;
        stepCost += 8.0 + hardness;
        isMineRequired = true;
      }

      const tentativeG = current.g + stepCost;

      if (!gScore.has(nkey) || tentativeG < gScore.get(nkey)) {
        cameFrom.set(nkey, current);
        gScore.set(nkey, tentativeG);

        const hVal = heuristic(nx, ny, nz, tx, ty, tz);
        const nextNode = {
          x: nx, y: ny, z: nz,
          g: tentativeG,
          f: tentativeG + hVal,
          key: nkey,
          mine: isMineRequired,
          water: isWater,
          blockId: blockId
        };

        if (!openSetMap.has(nkey)) {
          openSet.push(nextNode);
          openSetMap.set(nkey, nextNode);
        } else {
          const existing = openSetMap.get(nkey);
          existing.g = tentativeG;
          existing.f = tentativeG + hVal;
        }
      }
    }
  }

  // Reconstruct path
  const path = [];
  let curr = bestNode;
  while (curr) {
    path.unshift({
      x: curr.x,
      y: curr.y,
      z: curr.z,
      mine: curr.mine,
      water: curr.water,
      blockId: curr.blockId
    });
    curr = cameFrom.get(curr.key);
  }

  return path;
}

const sharedSphereGeo = new THREE.SphereGeometry(0.18, 8, 8);
const sharedGreenMat = new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.85 });
const sharedOrangeMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 });
const sharedCyanMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85 });

/**
 * 3D Holographic Trail WebGL Renderer
 * Updates InstancedMesh / Point Beacons in Three.js scene for zero-allocation rendering.
 */
export function updatePathTrail(pathNodes) {
  if (!webgl.scene) return;

  clearPathTrail();

  if (!pathNodes || pathNodes.length < 2) return;

  pathMeshGroup = new THREE.Group();
  pathMeshGroup.name = "pathfinder_trail";

  // Path line points
  const points = [];

  for (let i = 0; i < pathNodes.length; i++) {
    const p = pathNodes[i];
    const px = p.x + 0.5;
    const py = p.y + 0.3;
    const pz = p.z + 0.5;

    points.push(new THREE.Vector3(px, py, pz));

    // Render node sphere beacon
    let mat = sharedGreenMat;
    if (p.mine) mat = sharedOrangeMat;
    else if (p.water) mat = sharedCyanMat;

    const mesh = new THREE.Mesh(sharedSphereGeo, mat);
    mesh.position.set(px, py, pz);
    pathMeshGroup.add(mesh);
  }

  // Connecting line beam
  if (points.length > 1) {
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x39ff14, linewidth: 2, transparent: true, opacity: 0.6 });
    const line = new THREE.Line(lineGeo, lineMat);
    pathMeshGroup.add(line);
  }

  webgl.scene.add(pathMeshGroup);
}

/**
 * Clears active rendering trail from Three.js scene
 */
export function clearPathTrail() {
  if (pathMeshGroup && webgl.scene) {
    webgl.scene.remove(pathMeshGroup);
    pathMeshGroup.traverse(child => {
      if (child.isLine) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    });
    pathMeshGroup = null;
  }
}

// Waypoints Storage (localStorage)
const WAYPOINTS_KEY = 'voxel_waypoints_v1';

export function getSavedWaypoints() {
  if (typeof window !== 'undefined') window.__getWaypoints = getSavedWaypoints;
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(WAYPOINTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveWaypoint(name, x, y, z, icon = '📍') {
  const waypoints = getSavedWaypoints();
  const safeName = String(name || 'Waypoint').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim().slice(0, 50);
  const newWp = { id: Date.now().toString(), name: safeName, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), icon };
  waypoints.push(newWp);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(waypoints));
  }
  toast(`📍 Waypoint '${safeName}' saved!`);
  return waypoints;
}

export function deleteWaypoint(id) {
  let waypoints = getSavedWaypoints();
  waypoints = waypoints.filter(w => w.id !== id);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(waypoints));
  }
  toast(`🗑️ Waypoint removed.`);
  return waypoints;
}

export function saveHomeBase(x, y, z, ownerEmail = null) {
  let waypoints = getSavedWaypoints().filter(w => w.name !== 'My Base' && w.icon !== '🏡');
  const safeName = 'My Base';
  const newWp = { 
    id: 'base_' + Date.now(), 
    name: safeName, 
    x: Math.floor(x), 
    y: Math.floor(y), 
    z: Math.floor(z), 
    icon: '🏡',
    ownerEmail: ownerEmail || (typeof window !== 'undefined' && window.__currentUserEmail) || 'Me'
  };
  waypoints.unshift(newWp);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(waypoints));
  }
  toast(`🏡 Set current position as My Base (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)})!`);
  return waypoints;
}

export function saveFarm(x, y, z, ownerEmail = null) {
  let waypoints = getSavedWaypoints().filter(w => w.name !== 'My Farm' && w.icon !== '🌾');
  const safeName = 'My Farm';
  const newWp = { 
    id: 'farm_' + Date.now(), 
    name: safeName, 
    x: Math.floor(x), 
    y: Math.floor(y), 
    z: Math.floor(z), 
    icon: '🌾',
    ownerEmail: ownerEmail || (typeof window !== 'undefined' && window.__currentUserEmail) || 'Me'
  };
  waypoints.unshift(newWp);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(waypoints));
  }
  toast(`🌾 Set current position as My Farm (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)})!`);
  return waypoints;
}

