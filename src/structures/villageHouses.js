// ---- Village House Schematics & Market Pedestal Presets ---------------------

/**
 * Each schematic is defined as an array of voxel blocks relative to the front door / entry point (0,0,0).
 * Block offset: { dx, dy, dz, id }
 */

// 1. Small Oak Cottage (5x5 footprint)
export function getSmallOakCottageSchematic() {
  const blocks = [];

  // Foundation & Floor (5x5)
  for (let x = -2; x <= 2; x++) {
    for (let z = 0; z <= 4; z++) {
      blocks.push({ dx: x, dy: -1, dz: z, id: 16 }); // Stone Brick Floor
    }
  }

  // Corner Pillars (Oak Logs = 5)
  for (let y = 0; y <= 3; y++) {
    blocks.push({ dx: -2, dy: y, dz: 0, id: 5 });
    blocks.push({ dx: 2,  dy: y, dz: 0, id: 5 });
    blocks.push({ dx: -2, dy: y, dz: 4, id: 5 });
    blocks.push({ dx: 2,  dy: y, dz: 4, id: 5 });
  }

  // Walls (Oak Planks = 7)
  for (let y = 0; y <= 2; y++) {
    // Back Wall (z=4)
    for (let x = -1; x <= 1; x++) blocks.push({ dx: x, dy: y, dz: 4, id: 7 });
    // Left Wall (x=-2)
    for (let z = 1; z <= 3; z++) blocks.push({ dx: -2, dy: y, dz: z, id: 7 });
    // Right Wall (x=2)
    for (let z = 1; z <= 3; z++) blocks.push({ dx: 2, dy: y, dz: z, id: 7 });
    // Front Wall (z=0)
    blocks.push({ dx: -1, dy: y, dz: 0, id: 7 });
    blocks.push({ dx: 1,  dy: y, dz: 0, id: 7 });
  }

  // Glass Windows (Glass = 9)
  blocks.push({ dx: 0, dy: 1, dz: 4, id: 9 });  // Back window
  blocks.push({ dx: -2, dy: 1, dz: 2, id: 9 }); // Left window
  blocks.push({ dx: 2, dy: 1, dz: 2, id: 9 });  // Right window

  // Doorway (Front z=0)
  blocks.push({ dx: 0, dy: 0, dz: 0, id: 0 }); // Air for door
  blocks.push({ dx: 0, dy: 1, dz: 0, id: 0 });

  // Interior Furniture
  blocks.push({ dx: -1, dy: 0, dz: 3, id: 57 }); // Bed
  blocks.push({ dx: 1,  dy: 0, dz: 3, id: 41 }); // Crafting Table
  blocks.push({ dx: 1,  dy: 0, dz: 1, id: 43 }); // Chest
  blocks.push({ dx: 0,  dy: 2, dz: 1, id: 20 }); // Torch on interior wall

  // Roof Slabs / Stairs (Layer y=3 and y=4)
  for (let x = -2; x <= 2; x++) {
    for (let z = 0; z <= 4; z++) {
      blocks.push({ dx: x, dy: 3, dz: z, id: 7 }); // Plank ceiling
    }
  }
  for (let x = -1; x <= 1; x++) {
    for (let z = 1; z <= 3; z++) {
      blocks.push({ dx: x, dy: 4, dz: z, id: 7 }); // Upper roof ridge
    }
  }

  return { name: "Small Oak Cottage", width: 5, depth: 5, height: 5, blocks };
}

// 2. Blacksmith / Workshop (6x7 footprint with Lava & Market Showcase Pedestal)
export function getBlacksmithWorkshopSchematic() {
  const blocks = [];

  // Cobblestone Foundation (15 = Cobble)
  for (let x = -3; x <= 2; x++) {
    for (let z = 0; z <= 6; z++) {
      blocks.push({ dx: x, dy: -1, dz: z, id: 15 });
    }
  }

  // Cobble Walls (y=0 to y=2)
  for (let y = 0; y <= 2; y++) {
    // Back wall
    for (let x = -3; x <= 2; x++) blocks.push({ dx: x, dy: y, dz: 6, id: 15 });
    // Side walls
    for (let z = 0; z <= 5; z++) {
      blocks.push({ dx: -3, dy: y, dz: z, id: 15 });
      blocks.push({ dx: 2,  dy: y, dz: z, id: 15 });
    }
  }

  // Front entrance open workshop area
  blocks.push({ dx: -1, dy: 0, dz: 0, id: 0 });
  blocks.push({ dx: 0,  dy: 0, dz: 0, id: 0 });

  // Blacksmith Equipment
  blocks.push({ dx: -2, dy: 0, dz: 5, id: 42 }); // Furnace
  blocks.push({ dx: -1, dy: 0, dz: 5, id: 46 }); // Anvil / Iron Block
  blocks.push({ dx: 1,  dy: 0, dz: 5, id: 43 }); // Loot Chest
  blocks.push({ dx: 1,  dy: 0, dz: 2, id: 41 }); // Crafting Table

  // Market Showcase Pedestal Stand for Weapons/Armor
  blocks.push({ dx: 0, dy: 0, dz: 2, id: 95 }); // Pedestal Stand

  // Roof Overhang
  for (let x = -3; x <= 2; x++) {
    for (let z = 0; z <= 6; z++) {
      blocks.push({ dx: x, dy: 3, dz: z, id: 15 });
    }
  }

  return { name: "Blacksmith Workshop", width: 6, depth: 7, height: 4, blocks };
}

// 3. Large Two-Story House (7x7 footprint)
export function getLargeTwoStoryHouseSchematic() {
  const blocks = [];

  // Ground Foundation
  for (let x = -3; x <= 3; x++) {
    for (let z = 0; z <= 6; z++) {
      blocks.push({ dx: x, dy: -1, dz: z, id: 15 }); // Cobble floor
    }
  }

  // Ground Floor Walls (y=0..2: Cobble)
  for (let y = 0; y <= 2; y++) {
    for (let x = -3; x <= 3; x++) {
      blocks.push({ dx: x, dy: y, dz: 6, id: 15 });
      blocks.push({ dx: x, dy: y, dz: 0, id: 15 });
    }
    for (let z = 1; z <= 5; z++) {
      blocks.push({ dx: -3, dy: y, dz: z, id: 15 });
      blocks.push({ dx: 3,  dy: y, dz: z, id: 15 });
    }
  }
  // Doorway
  blocks.push({ dx: 0, dy: 0, dz: 0, id: 0 });
  blocks.push({ dx: 0, dy: 1, dz: 0, id: 0 });

  // Second Floor (y=3 floor, y=3..5 Wood Planks)
  for (let x = -3; x <= 3; x++) {
    for (let z = 0; z <= 6; z++) {
      blocks.push({ dx: x, dy: 3, dz: z, id: 7 }); // Floor
    }
  }
  for (let y = 4; y <= 6; y++) {
    for (let x = -3; x <= 3; x++) {
      blocks.push({ dx: x, dy: y, dz: 6, id: 7 });
      blocks.push({ dx: x, dy: y, dz: 0, id: 7 });
    }
    for (let z = 1; z <= 5; z++) {
      blocks.push({ dx: -3, dy: y, dz: z, id: 7 });
      blocks.push({ dx: 3,  dy: y, dz: z, id: 7 });
    }
  }

  // Second floor windows & interior
  blocks.push({ dx: 0,  dy: 5, dz: 0, id: 9 });  // Window
  blocks.push({ dx: -3, dy: 5, dz: 3, id: 9 });  // Left window
  blocks.push({ dx: 3,  dy: 5, dz: 3, id: 9 });  // Right window
  blocks.push({ dx: 2,  dy: 4, dz: 5, id: 44 }); // Bookshelf
  blocks.push({ dx: -2, dy: 4, dz: 5, id: 57 }); // Upper Bed
  blocks.push({ dx: 2,  dy: 0, dz: 3, id: 45 }); // Ladder to upper floor
  blocks.push({ dx: 2,  dy: 1, dz: 3, id: 45 });
  blocks.push({ dx: 2,  dy: 2, dz: 3, id: 45 });

  // Roof (y=7)
  for (let x = -3; x <= 3; x++) {
    for (let z = 0; z <= 6; z++) {
      blocks.push({ dx: x, dy: 7, dz: z, id: 7 });
    }
  }

  return { name: "Large Two-Story House", width: 7, depth: 7, height: 8, blocks };
}

// 4. Central Village Well (3x3 focal point)
export function getVillageWellSchematic() {
  const blocks = [];

  // Cobblestone Basin (3x3)
  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 1; z++) {
      if (x === 0 && z === 0) {
        blocks.push({ dx: 0, dy: -1, dz: 0, id: 8 }); // Water
        blocks.push({ dx: 0, dy: -2, dz: 0, id: 8 });
      } else {
        blocks.push({ dx: x, dy: 0, dz: z, id: 15 }); // Cobble Rim
      }
    }
  }

  // Corner Fences (ID 45 / Fence)
  blocks.push({ dx: -1, dy: 1, dz: -1, id: 45 });
  blocks.push({ dx: 1,  dy: 1, dz: -1, id: 45 });
  blocks.push({ dx: -1, dy: 1, dz: 1,  id: 45 });
  blocks.push({ dx: 1,  dy: 1, dz: 1,  id: 45 });

  // Roof (3x3 Cobble at y=2)
  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 1; z++) {
      blocks.push({ dx: x, dy: 2, dz: z, id: 15 });
    }
  }
  blocks.push({ dx: 0, dy: 1, dz: 0, id: 20 }); // Central Torch under roof

  return { name: "Village Well", width: 3, depth: 3, height: 3, blocks };
}
