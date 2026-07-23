import * as THREE from 'three';

// Headless DOM Environment Setup
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

global.window = {
  requestAnimationFrame: global.requestAnimationFrame,
  cancelAnimationFrame: global.cancelAnimationFrame,
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { search: '', href: '' },
  navigator: { userAgent: 'NodeTestRunner' },
  HTMLInputElement: class {},
  Event: class {},
  devicePixelRatio: 1,
  innerWidth: 1024,
  innerHeight: 768
};

const mockCtx = new Proxy({
  canvas: {},
  getShaderPrecisionFormat: () => ({ precision: 1, rangeMin: 1, rangeMax: 1 }),
  getParameter: (p) => p === 35661 ? 16 : 'WebGL 2.0',
  checkFramebufferStatus: () => 36053,
  createProgram: () => ({}),
  createShader: () => ({}),
  createBuffer: () => ({}),
  createTexture: () => ({}),
  createFramebuffer: () => ({}),
  getProgramParameter: () => true,
  getShaderParameter: () => true,
  getExtension: () => null,
}, {
  get: (target, prop) => {
    if (prop in target) return target[prop];
    return () => 1;
  }
});

const mockCanvas = {
  width: 1024, height: 768, style: {},
  getContext: () => mockCtx,
  addEventListener: () => {}, removeEventListener: () => {},
  toDataURL: () => 'data:image/png;base64,mock'
};

global.document = {
  createElement: () => mockCanvas,
  getElementById: (id) => id === 'game' ? mockCanvas : { click: () => {}, dispatchEvent: () => {}, style: {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  body: { classList: { add: () => {}, remove: () => {} } }
};
global.performance = { now: () => Date.now() };

async function runFullTestSuite() {
  console.log("=========================================================================");
  console.log("🧪 EXECUTING FULL AUTOMATED HEADLESS ENGINE TEST SUITE");
  console.log("=========================================================================");

  let passCount = 0;
  let failCount = 0;
  const errors = [];

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passCount++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message || err);
      errors.push({ name, err });
      failCount++;
    }
  }

  try {
    const config = await import('./src/config.js');
    const state = await import('./src/state.js');
    const player = await import('./src/player.js');
    const world = await import('./src/world.js');
    const mobs = await import('./src/mobs.js');
    const ui = await import('./src/ui.js');
    const main = await import('./src/main.js');

    // TEST SUITE 1: CONFIG & REGISTRY
    console.log("\n--- TEST SUITE 1: CONFIG & REGISTRY VALIDATION ---");
    test("BLOCKS Registry contains valid definitions", () => {
      if (!config.BLOCKS || Object.keys(config.BLOCKS).length < 50) throw new Error("BLOCKS registry incomplete");
      for (const id in config.BLOCKS) {
        const b = config.BLOCKS[id];
        if (!b.name) throw new Error(`Block ID ${id} missing name`);
      }
    });

    test("ITEMS Registry contains valid definitions", () => {
      if (!config.ITEMS || Object.keys(config.ITEMS).length < 30) throw new Error("ITEMS registry incomplete");
      for (const id in config.ITEMS) {
        const it = config.ITEMS[id];
        if (!it.name) throw new Error(`Item ID ${id} missing name`);
        if (typeof it.id !== 'number') throw new Error(`Item ID ${id} missing numeric id property`);
      }
    });

    test("RECIPES contain valid inputs and outputs", () => {
      if (!config.RECIPES || config.RECIPES.length < 10) throw new Error("RECIPES list incomplete");
      for (const r of config.RECIPES) {
        if (!r.in || !r.out) throw new Error("Recipe missing in/out definitions");
        if (typeof r.out !== 'number') throw new Error("Recipe output must be a number");
      }
    });

    test("thingName returns valid string for all block/item IDs", () => {
      if (config.thingName(1) !== "Grass") throw new Error("Grass name mismatch");
      if (config.thingName(100) !== "Stick") throw new Error("Stick name mismatch");
      if (config.thingName(0) !== "Air") throw new Error("Air name mismatch");
      if (config.thingName(999999) !== "?") throw new Error("Invalid ID fallback mismatch");
    });

    // TEST SUITE 2: PLAYER & INVENTORY
    console.log("\n--- TEST SUITE 2: PLAYER & INVENTORY SYSTEM ---");
    test("addItem and invCount manage inventory correctly", () => {
      player.addItem(7, 10);
      if (player.invCount(7) < 10) throw new Error("addItem failed to add items");
    });

    test("removeItem correctly decrements inventory counts", () => {
      const initial = player.invCount(7);
      player.removeItem(7, 2);
      if (player.invCount(7) !== initial - 2) throw new Error("removeItem failed to decrement");
    });

    test("feedPlayer and healPlayer restore stats within bounds (0-20)", () => {
      state.player.health = 10;
      state.player.hunger = 10;
      player.healPlayer(5);
      player.feedPlayer(5);
      if (state.player.health !== 15) throw new Error(`healPlayer failed. Health: ${state.player.health}`);
      if (state.player.hunger !== 15) throw new Error(`feedPlayer failed. Hunger: ${state.player.hunger}`);
      player.healPlayer(100);
      if (state.player.health > 20) throw new Error("health exceeded max 20");
    });

    test("heldTool returns tool definition when tool is equipped", () => {
      state.hotbar[0] = 108; // Diamond Pickaxe
      state.game.selected = 0;
      const tool = player.heldTool();
      if (!tool || tool.tool !== 'pickaxe') throw new Error("heldTool failed to identify Diamond Pickaxe");
    });

    // TEST SUITE 3: WORLD & VOXEL PHYSICS
    console.log("\n--- TEST SUITE 3: WORLD ENGINE & VOXEL PHYSICS ---");
    test("setBlock and getBlock manipulate world voxels", () => {
      world.setBlock(100, 30, 100, 3, true); // Stone
      if (world.getBlock(100, 30, 100) !== 3) throw new Error("setBlock/getBlock mismatch");
      world.setBlock(100, 30, 100, 0, true); // Air
      if (world.getBlock(100, 30, 100) !== 0) throw new Error("setBlock air failed");
    });

    test("surfaceHeight calculates valid surface y level", () => {
      const h = config.surfaceHeight(0, 0);
      if (typeof h !== 'number' || h < 1 || h > 256) throw new Error(`Invalid surfaceHeight: ${h}`);
    });

    test("triggerWorldExplosion creates crater air blocks", () => {
      world.setBlock(50, 30, 50, 3);
      world.triggerWorldExplosion(50, 30, 50, 3);
      if (world.getBlock(50, 30, 50) !== 0) throw new Error("triggerWorldExplosion did not clear block");
    });

    test("player jumps consistently when pressed against blocks and walls", () => {
      for (let x = 0; x < 20; x++) {
        for (let z = 0; z < 20; z++) {
          world.setBlock(x, 9, z, 1);
          for (let y = 10; y < 20; y++) world.setBlock(x, y, z, 0);
        }
      }
      const ch = world.getChunk(0, 0);
      if (ch) ch.generated = true;
      world.setBlock(6, 10, 5, 1);
      world.setBlock(6, 11, 5, 1);

      state.player.pos.set(5.7, 10.0, 5.5);
      state.player.vel.set(0, 0, 0);
      state.player.onGround = true;
      state.player.yaw = -Math.PI / 2;
      state.keys["KeyW"] = true;
      state.keys["Space"] = true;
      state.game.paused = false;

      player.updatePlayer(0.016);
      if (state.player.vel.y <= 0 || state.player.pos.y <= 10.0) {
        throw new Error(`Jump failed while pressed against wall! vel.y: ${state.player.vel.y}, pos.y: ${state.player.pos.y}`);
      }
    });

    // TEST SUITE 4: MOBS & COMBAT SYSTEM
    console.log("\n--- TEST SUITE 4: MOBS & COMBAT SYSTEM ---");
    test("spawnMob creates pig, sheep, zombie, creeper, skeleton", () => {
      for (const mType of ['pig', 'sheep', 'zombie', 'creeper', 'skeleton']) {
        const mob = mobs.spawnMob(mType, 10, 60, 10);
        if (!mob || mob.type !== mType) throw new Error(`Failed to spawn mob ${mType}`);
        if (mob.hp <= 0) throw new Error(`Mob ${mType} spawned with 0 HP`);
      }
    });

    test("attackMob deals damage to mobs correctly", () => {
      const zombie = mobs.spawnMob('zombie', 20, 60, 20);
      const initialHp = zombie.hp;
      mobs.attackMob(zombie, 6);
      if (zombie.hp !== initialHp - 6) throw new Error(`attackMob failed to subtract HP. New HP: ${zombie.hp}`);
    });

    // TEST SUITE 5: UI & MODAL STATE MACHINE
    console.log("\n--- TEST SUITE 5: UI & MODAL STATE MACHINE ---");
    test("openCraft and closeCraft toggle uiState.craftOpen and isMenuOpen", () => {
      ui.openCraft();
      if (!ui.uiState.craftOpen || !ui.isMenuOpen()) throw new Error("openCraft failed");
      ui.closeCraft();
      if (ui.uiState.craftOpen || ui.isMenuOpen()) throw new Error("closeCraft failed");
    });

    test("openChest and closeChest toggle uiState.chestOpen and isMenuOpen", () => {
      ui.openChest(5, 5, 5);
      if (!ui.uiState.chestOpen || !ui.isMenuOpen()) throw new Error("openChest failed");
      ui.closeChest();
      if (ui.uiState.chestOpen || ui.isMenuOpen()) throw new Error("closeChest failed");
    });

    test("openFurnace and closeFurnace toggle uiState.furnaceOpen and isMenuOpen", () => {
      ui.openFurnace(5, 5, 5);
      if (!ui.uiState.furnaceOpen || !ui.isMenuOpen()) throw new Error("openFurnace failed");
      ui.closeFurnace();
      if (ui.uiState.furnaceOpen || ui.isMenuOpen()) throw new Error("closeFurnace failed");
    });

    test("unlockAchievement unlocks achievement keys in state", () => {
      ui.unlockAchievement("benchmark_test");
      if (!state.achievements["benchmark_test"]) throw new Error("unlockAchievement failed");
    });

    // TEST SUITE 6: MAIN ENGINE PARTICLES & DROPS
    console.log("\n--- TEST SUITE 6: ENGINE PARTICLES & DROPS ---");
    test("spawnItemDrop creates 3D item drop object", () => {
      const initialDropsLength = main.itemDrops.length;
      main.spawnItemDrop(7, 2, 0, 10, 0);
      if (main.itemDrops.length !== initialDropsLength + 1) throw new Error("spawnItemDrop failed to push drop");
    });

    test("spawnXpOrbs creates XP orb objects", () => {
      const initialOrbsLength = state.game.xpOrbs.length;
      main.spawnXpOrbs(0, 10, 0, 3);
      if (state.game.xpOrbs.length !== initialOrbsLength + 3) throw new Error("spawnXpOrbs failed to push orbs");
    });

  } catch (fatalErr) {
    console.error("FATAL ERROR LOADING TEST SUITE MODULES:", fatalErr);
    process.exit(1);
  }

  console.log("\n=========================================================================");
  console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log("=========================================================================");

  if (failCount > 0) {
    console.error("FAILURES DETECTED:");
    errors.forEach(e => console.error(` - ${e.name}: ${e.err.message || e.err}`));
    process.exit(1);
  } else {
    console.log("🎉 ALL TESTS PASSED WITH ZERO ERRORS!");
    process.exit(0);
  }
}

runFullTestSuite();
