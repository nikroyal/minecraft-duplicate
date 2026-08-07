// ---- Village Farmland Plot Presets -----------------------------------------

/**
 * Farmland Plot Schematics defining tilled soil (ID 89), water irrigation (ID 8),
 * log/fence borders, and crop plants.
 */

// 1. Standard Crop Strip (8x10)
export function getStandardCropStripSchematic() {
  const blocks = [];

  // Log Border (x=-4..3, z=0..9)
  for (let x = -4; x <= 3; x++) {
    blocks.push({ dx: x, dy: 0, dz: 0, id: 5 }); // Oak Log
    blocks.push({ dx: x, dy: 0, dz: 9, id: 5 });
  }
  for (let z = 1; z <= 8; z++) {
    blocks.push({ dx: -4, dy: 0, dz: z, id: 5 });
    blocks.push({ dx: 3,  dy: 0, dz: z, id: 5 });
  }

  // Tilled Soil & Water Trench
  for (let z = 1; z <= 8; z++) {
    for (let x = -3; x <= 2; x++) {
      if (x === 0) {
        blocks.push({ dx: 0, dy: 0, dz: z, id: 8 }); // Water Trench
      } else {
        blocks.push({ dx: x, dy: 0, dz: z, id: 89 }); // Tilled Farmland
        // Crop plant on top (ID 90/91/92 Wheat)
        const cropStage = 90 + ((z + Math.abs(x)) % 3);
        blocks.push({ dx: x, dy: 1, dz: z, id: cropStage });
      }
    }
  }

  // Torches on corner logs
  blocks.push({ dx: -4, dy: 1, dz: 0, id: 20 });
  blocks.push({ dx: 3,  dy: 1, dz: 0, id: 20 });
  blocks.push({ dx: -4, dy: 1, dz: 9, id: 20 });
  blocks.push({ dx: 3,  dy: 1, dz: 9, id: 20 });

  return { name: "Standard Crop Strip", width: 8, depth: 10, height: 2, blocks };
}

// 2. Compact Backyard Garden (5x6)
export function getBackyardGardenSchematic() {
  const blocks = [];

  // Fence Border
  for (let x = -2; x <= 2; x++) {
    blocks.push({ dx: x, dy: 1, dz: 0, id: 45 });
    blocks.push({ dx: x, dy: 1, dz: 5, id: 45 });
  }
  for (let z = 1; z <= 4; z++) {
    blocks.push({ dx: -2, dy: 1, dz: z, id: 45 });
    blocks.push({ dx: 2,  dy: 1, dz: z, id: 45 });
  }

  // Soil & Corner Water
  for (let x = -1; x <= 1; x++) {
    for (let z = 1; z <= 4; z++) {
      if (x === 0 && z === 1) {
        blocks.push({ dx: 0, dy: 0, dz: 1, id: 8 }); // Water
      } else {
        blocks.push({ dx: x, dy: 0, dz: z, id: 89 }); // Farmland
        blocks.push({ dx: x, dy: 1, dz: z, id: 91 }); // Wheat
      }
    }
  }

  return { name: "Backyard Garden", width: 5, depth: 6, height: 2, blocks };
}

// 3. Double Trench Field (10x12)
export function getDoubleTrenchFieldSchematic() {
  const blocks = [];

  // Log Border (10x12)
  for (let x = -5; x <= 4; x++) {
    blocks.push({ dx: x, dy: 0, dz: 0,  id: 5 });
    blocks.push({ dx: x, dy: 0, dz: 11, id: 5 });
  }
  for (let z = 1; z <= 10; z++) {
    blocks.push({ dx: -5, dy: 0, dz: z, id: 5 });
    blocks.push({ dx: 4,  dy: 0, dz: z, id: 5 });
  }

  // Tilled Soil and Two Water Trenches (x=-2 and x=1)
  for (let z = 1; z <= 10; z++) {
    for (let x = -4; x <= 3; x++) {
      if (x === -2 || x === 1) {
        blocks.push({ dx: x, dy: 0, dz: z, id: 8 }); // Water
      } else {
        blocks.push({ dx: x, dy: 0, dz: z, id: 89 }); // Farmland
        const cropStage = 90 + ((x + z) % 3);
        blocks.push({ dx: x, dy: 1, dz: z, id: cropStage });
      }
    }
  }

  return { name: "Double Trench Field", width: 10, depth: 12, height: 2, blocks };
}

// 4. Hillside Terraced Plot (7x9)
export function getTerracedFarmlandSchematic() {
  const blocks = [];

  // Tier 1 (Lower level y=0)
  for (let x = -3; x <= 3; x++) {
    for (let z = 0; z <= 3; z++) {
      if (x === 0 && z === 1) blocks.push({ dx: 0, dy: 0, dz: 1, id: 8 });
      else {
        blocks.push({ dx: x, dy: 0, dz: z, id: 89 });
        blocks.push({ dx: x, dy: 1, dz: z, id: 92 }); // Ripe Wheat
      }
    }
  }

  // Tier 2 (Upper level y=1)
  for (let x = -3; x <= 3; x++) {
    for (let z = 4; z <= 8; z++) {
      if (x === 0 && z === 6) blocks.push({ dx: 0, dy: 1, dz: 6, id: 8 });
      else {
        blocks.push({ dx: x, dy: 1, dz: z, id: 89 });
        blocks.push({ dx: x, dy: 2, dz: z, id: 91 });
      }
    }
  }

  return { name: "Terraced Farmland", width: 7, depth: 9, height: 3, blocks };
}

// 5. Corner L-Shaped Farm (8x8)
export function getCornerLShapedFarmSchematic() {
  const blocks = [];

  // L-Shaped footprint
  for (let x = -4; x <= 3; x++) {
    for (let z = 0; z <= 7; z++) {
      if (x > 0 && z > 3) continue; // Skip corner block to form L-shape
      if (x === -2 && z === 2) {
        blocks.push({ dx: x, dy: 0, dz: z, id: 8 }); // Water
      } else {
        blocks.push({ dx: x, dy: 0, dz: z, id: 89 });
        blocks.push({ dx: x, dy: 1, dz: z, id: 90 });
      }
    }
  }

  // Central Lantern Post at the corner
  blocks.push({ dx: 0, dy: 1, dz: 3, id: 45 }); // Fence post
  blocks.push({ dx: 0, dy: 2, dz: 3, id: 20 }); // Torch

  return { name: "Corner L-Shaped Farm", width: 8, depth: 8, height: 3, blocks };
}
