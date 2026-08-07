// ---- Procedural Village Generator & Foundation Engine ---------------------
import { CHUNK, HEIGHT, SEA, SEED, hash2, surfaceHeight } from './config.js';
import { spawnMob } from './mobs.js';
import {
  getSmallOakCottageSchematic,
  getBlacksmithWorkshopSchematic,
  getLargeTwoStoryHouseSchematic,
  getVillageWellSchematic
} from './structures/villageHouses.js';
import {
  getStandardCropStripSchematic,
  getBackyardGardenSchematic,
  getDoubleTrenchFieldSchematic,
  getTerracedFarmlandSchematic,
  getCornerLShapedFarmSchematic
} from './structures/villageFarmland.js';

// Cache generated village layouts to ensure multi-chunk determinism & instant loading
const villageLayoutCache = new Map();

/**
 * Checks if a chunk coordinate is a Village Center
 */
export function isVillageCenterChunk(vcx, vcz) {
  // Guaranteed starter villages immediately adjacent to player spawn (8.5, 8.5)
  if ((vcx === 1 && vcz === 0) || (vcx === 2 && vcz === 2) || (vcx === -2 && vcz === -2) || (vcx === 3 && vcz === 3)) return true;

  // Village grid spacing: every 7 chunks (~112 meters)
  const spacing = 7;
  const gridX = Math.floor(vcx / spacing);
  const gridZ = Math.floor(vcz / spacing);

  // Hash within grid cell
  const centerDx = Math.floor(hash2(gridX, gridZ, SEED + 101) * (spacing - 3)) + 1;
  const centerDz = Math.floor(hash2(gridX, gridZ, SEED + 202) * (spacing - 3)) + 1;

  const targetCx = gridX * spacing + centerDx;
  const targetCz = gridZ * spacing + centerDz;

  return (vcx === targetCx && vcz === targetCz);
}

/**
 * Evaluates terrain flatness & suitability around (wx, wz)
 */
export function isTerrainSuitableForVillage(wx, wz) {
  const centerH = surfaceHeight(wx, wz);
  if (centerH <= SEA + 1) return false; // Must be on dry land above sea level

  let minH = 999, maxH = -999;
  let waterCount = 0;
  let totalCount = 0;

  for (let dx = -12; dx <= 12; dx += 6) {
    for (let dz = -12; dz <= 12; dz += 6) {
      totalCount++;
      const h = surfaceHeight(wx + dx, wz + dz);
      if (h <= SEA) waterCount++;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }
  if (waterCount > 7) return false;
  return (maxH - minH) <= 32;
}

/**
 * Gets or constructs the deterministic village layout centered at (vcx, vcz)
 */
export function getVillageLayout(vcx, vcz) {
  const key = `${vcx},${vcz}`;
  if (villageLayoutCache.has(key)) return villageLayoutCache.get(key);

  const centerWx = vcx * CHUNK + 8;
  const centerWz = vcz * CHUNK + 8;
  const centerBaseY = surfaceHeight(centerWx, centerWz);

  const layout = {
    vcx, vcz,
    centerWx, centerWz, centerBaseY,
    voxels: new Map(), // key: "wx,wy,wz" -> blockId
    structures: []
  };

  if (!isTerrainSuitableForVillage(centerWx, centerWz)) {
    villageLayoutCache.set(key, layout);
    return layout;
  }

  // 1. Central Village Well
  const wellSchematic = getVillageWellSchematic();
  placeSchematicWithFoundation(layout, centerWx, centerBaseY, centerWz, wellSchematic);
  layout.structures.push({ type: 'well', x: centerWx, y: centerBaseY, z: centerWz });

  // 2. Cardinal Pathways & Building Slots
  const paths = [
    { dx: 1, dz: 0, length: 22 },  // East
    { dx: -1, dz: 0, length: 22 }, // West
    { dx: 0, dz: 1, length: 22 },  // North
    { dx: 0, dz: -1, length: 22 }  // South
  ];

  // Lay Gravel Pathways (Gravel = ID 27 / Cobble = ID 15)
  for (const p of paths) {
    for (let step = 1; step <= p.length; step++) {
      const px = centerWx + p.dx * step;
      const pz = centerWz + p.dz * step;
      const py = surfaceHeight(px, pz);
      // 2-block wide path
      for (let pw = -1; pw <= 1; pw++) {
        const pathWx = (p.dx === 0) ? px + pw : px;
        const pathWz = (p.dz === 0) ? pz + pw : pz;
        const pathY = surfaceHeight(pathWx, pathWz);
        layout.voxels.set(`${pathWx},${pathY},${pathWz}`, 27); // Gravel Path
        // Foundation under path
        for (let fy = pathY - 1; fy >= pathY - 3; fy--) {
          const fk = `${pathWx},${fy},${pathWz}`;
          if (!layout.voxels.has(fk)) layout.voxels.set(fk, 15); // Cobble foundation
        }
      }
    }
  }

  // 3. Buildings & Farmland Placement along Paths
  const buildingSlots = [
    { offsetDx: 14,  offsetDz: 6,   schematic: getSmallOakCottageSchematic() },
    { offsetDx: 14,  offsetDz: -12, schematic: getBlacksmithWorkshopSchematic() },
    { offsetDx: -16, offsetDz: 6,   schematic: getLargeTwoStoryHouseSchematic() },
    { offsetDx: -16, offsetDz: -12, schematic: getSmallOakCottageSchematic() },
    { offsetDx: 6,   offsetDz: 14,  schematic: getStandardCropStripSchematic() },
    { offsetDx: -10, offsetDz: 14,  schematic: getDoubleTrenchFieldSchematic() },
    { offsetDx: 6,   offsetDz: -16, schematic: getBackyardGardenSchematic() },
    { offsetDx: -10, offsetDz: -16, schematic: getTerracedFarmlandSchematic() }
  ];

  for (const slot of buildingSlots) {
    const swx = centerWx + slot.offsetDx;
    const swz = centerWz + slot.offsetDz;
    const sBaseY = surfaceHeight(swx, swz);

    placeSchematicWithFoundation(layout, swx, sBaseY, swz, slot.schematic);
    layout.structures.push({ type: slot.schematic.name, x: swx, y: sBaseY, z: swz });
  }

  // 4. Villager NPC Population presets
  layout.villagers = [
    { profession: 'farmer',     x: centerWx + 6,  y: centerBaseY + 1, z: centerWz + 14 },
    { profession: 'blacksmith', x: centerWx + 14, y: centerBaseY + 1, z: centerWz - 12 },
    { profession: 'librarian',  x: centerWx - 16, y: centerBaseY + 1, z: centerWz + 6 },
    { profession: 'cleric',     x: centerWx,      y: centerBaseY + 1, z: centerWz }
  ];

  villageLayoutCache.set(key, layout);
  return layout;
}

/**
 * Places a schematic and builds solid cobblestone/dirt foundations down to ground level
 */
function placeSchematicWithFoundation(layout, originWx, originBaseY, originWz, schematic) {
  // 1. Clear tree foliage in building footprint
  for (let b of schematic.blocks) {
    const wx = originWx + b.dx;
    const wy = originBaseY + b.dy;
    const wz = originWz + b.dz;
    for (let cy = wy; cy <= wy + 4; cy++) {
      if (cy < HEIGHT) {
        layout.voxels.set(`${wx},${cy},${wz}`, 0);
      }
    }
  }

  // 2. Foundation levelling scanner & block placement
  for (let b of schematic.blocks) {
    const wx = originWx + b.dx;
    const wy = originBaseY + b.dy;
    const wz = originWz + b.dz;

    // Clamp wy within world height bounds
    const clampedWy = Math.max(1, Math.min(HEIGHT - 1, wy));
    layout.voxels.set(`${wx},${clampedWy},${wz}`, b.id);

    // Foundation check on bottom layer (dy <= 0)
    if (b.dy <= 0) {
      const terrainY = Math.max(1, surfaceHeight(wx, wz));
      const minFy = Math.max(1, terrainY - 1);
      // Fill air beneath building with Cobblestone (15) or Dirt (2) down to terrain height
      for (let fy = clampedWy - 1; fy >= minFy; fy--) {
        const fk = `${wx},${fy},${wz}`;
        if (!layout.voxels.has(fk)) {
          layout.voxels.set(fk, (fy === clampedWy - 1 ? 15 : 2));
        }
      }
    }
  }
}

/**
 * Called by chunk generator to stamp village voxels into chunk instance
 */
export function applyVillageToChunk(ch, ox, oz) {
  const minCx = ch.cx - 2;
  const maxCx = ch.cx + 2;
  const minCz = ch.cz - 2;
  const maxCz = ch.cz + 2;

  // Scan nearby chunk coordinates for Village Centers
  for (let vcx = minCx; vcx <= maxCx; vcx++) {
    for (let vcz = minCz; vcz <= maxCz; vcz++) {
      if (isVillageCenterChunk(vcx, vcz)) {
        const layout = getVillageLayout(vcx, vcz);
        if (!layout || layout.voxels.size === 0) continue;

        // Stamp layout voxels falling within this chunk's bounds [ox .. ox+15, oz .. oz+15]
        for (const [k, blockId] of layout.voxels) {
          const [wx, wy, wz] = k.split(',').map(Number);
          if (wx >= ox && wx < ox + CHUNK && wz >= oz && wz < oz + CHUNK) {
            const lx = wx - ox;
            const lz = wz - oz;
            if (wy >= 0 && wy < HEIGHT) {
              ch.set(lx, wy, lz, blockId);
            }
          }
        }

        // Spawn Village Villager NPCs on initial chunk generation
        if (vcx === ch.cx && vcz === ch.cz && layout.villagers && !layout.villagersSpawned) {
          layout.villagersSpawned = true;
          for (const v of layout.villagers) {
            if (typeof window !== 'undefined' && window.__spawnVillageVillager) {
              window.__spawnVillageVillager(v.profession, v.x, v.y, v.z);
            } else {
              try { spawnMob('villager', v.x, v.y, v.z, false, null, v.profession); } catch(e) {}
            }
          }
        }
      }
    }
  }
}
