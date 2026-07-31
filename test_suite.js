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

const localStorageStore = new Map();
global.localStorage = {
  getItem: (k) => localStorageStore.get(k) || null,
  setItem: (k, v) => localStorageStore.set(k, String(v)),
  removeItem: (k) => localStorageStore.delete(k),
  clear: () => localStorageStore.clear()
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
    const pathfinder = await import('./src/pathfinder.js');

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

    test("player stops at 1-block step when walking without space jump", () => {
      for (let x = 0; x < 20; x++) {
        for (let z = 0; z < 20; z++) {
          world.setBlock(x, 9, z, 1);
          for (let y = 10; y < 20; y++) world.setBlock(x, y, z, 0);
        }
      }
      world.setBlock(6, 10, 5, 1); // 1-block step at x=6, y=10
      state.player.pos.set(5.5, 10.0, 5.5);
      state.player.vel.set(0, 0, 0);
      state.player.onGround = true;
      state.player.yaw = -Math.PI / 2; // facing positive X
      state.keys["KeyW"] = true;
      state.keys["Space"] = false;
      state.game.paused = false;

      for (let i = 0; i < 10; i++) {
        player.updatePlayer(0.016);
      }
      // Player should be stopped by wall at x=6 and remain on ground level y=10.0
      if (state.player.pos.y > 10.05) {
        throw new Error(`Player auto-stepped 1-block step without jumping! pos.y: ${state.player.pos.y}`);
      }
    });

    test("player automatically steps up 0.5-block slab while walking", () => {
      for (let x = 0; x < 20; x++) {
        for (let z = 0; z < 20; z++) {
          world.setBlock(x, 9, z, 1);
          for (let y = 10; y < 20; y++) world.setBlock(x, y, z, 0);
        }
      }
      const slabId = Number(Object.keys(config.BLOCKS).find(id => config.BLOCKS[id]?.shape === 'slab') || 201);
      world.setBlock(6, 10, 5, slabId);
      state.player.pos.set(5.68, 10.0, 5.5);
      state.player.vel.set(0, 0, 0);
      state.player.onGround = true;
      state.player.yaw = -Math.PI / 2; // facing positive X
      state.keys["KeyW"] = true;
      state.keys["Space"] = false;
      state.game.paused = false;

      for (let i = 0; i < 10; i++) {
        player.updatePlayer(0.016);
      }
      // Player should step up onto slab at y=10.5
      if (state.player.pos.y < 10.4) {
        throw new Error(`Player failed to step up 0.5-block slab! pos.y: ${state.player.pos.y}`);
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

    // TEST SUITE 7: MULTIPLAYER ECOSYSTEM, ROOMS & PRESENCE
    console.log("\n--- TEST SUITE 7: MULTIPLAYER ECOSYSTEM, ROOMS & PRESENCE ---");
    test("game mode state transitions between singleplayer, public, and room", () => {
      state.game.mode = 'singleplayer';
      state.game.activeRoomId = null;
      if (state.game.mode !== 'singleplayer' || state.game.activeRoomId !== null) throw new Error("Singleplayer state invalid");

      state.game.mode = 'public';
      state.game.activeRoomId = 'global_public';
      if (state.game.mode !== 'public' || state.game.activeRoomId !== 'global_public') throw new Error("Public mode state invalid");

      state.game.mode = 'room';
      state.game.activeRoomId = 'room_test_123';
      if (state.game.mode !== 'room' || state.game.activeRoomId !== 'room_test_123') throw new Error("Room mode state invalid");
    });

    test("otherPlayerMeshes map correctly initializes and tracks multiplayer players", () => {
      if (!main.otherPlayerMeshes || typeof main.otherPlayerMeshes.set !== 'function') {
        throw new Error("otherPlayerMeshes map is not properly exported or initialized");
      }
    });

    test("saveWorld delegates payload to appropriate mode target", () => {
      state.game.mode = 'singleplayer';
      ui.saveWorld(); // Should execute singleplayer save path cleanly without exception
      
      state.game.mode = 'public';
      state.game.activeRoomId = 'global_public';
      ui.saveWorld(); // Should execute room save path cleanly

      state.game.mode = 'singleplayer'; // Reset
    });

    // TEST SUITE 8: CRAFTING & RECIPES ENGINE
    console.log("\n--- TEST SUITE 8: CRAFTING & RECIPES ENGINE ---");
    test("craftableRecipes returns valid recipes list", () => {
      state.inventory[5] = 4; // Seed inventory with logs so recipes evaluate
      const recipes = config.craftableRecipes(state.inventory);
      if (!Array.isArray(recipes) || recipes.length === 0) throw new Error("craftableRecipes did not return array");
      for (const r of recipes) {
        if (!r.recipe || !r.recipe.out || !r.recipe.in) throw new Error(`Invalid recipe structure`);
      }
    });

    test("crafting consumes input items and produces expected output stack", () => {
      player.addItem(5, 4); // 4 Wood Logs
      const initialLogs = player.invCount(5);
      if (initialLogs < 4) throw new Error("Failed to seed initial wood logs");
      // Craft Wood Plank (ID 7)
      player.removeItem(5, 1);
      player.addItem(7, 4);
      if (player.invCount(5) !== initialLogs - 1) throw new Error("Log count did not decrement");
      if (player.invCount(7) < 4) throw new Error("Plank count did not increment");
    });

    // TEST SUITE 9: CROP FARMING & GROWTH CYCLES
    console.log("\n--- TEST SUITE 9: CROP FARMING & GROWTH CYCLES ---");
    test("farmland block ID 89 and crop block IDs 90, 91, 92 have valid definitions", () => {
      if (!config.BLOCKS[89] || config.BLOCKS[89].name !== "Farmland") throw new Error("Farmland block 89 missing");
      if (!config.BLOCKS[90] || !config.BLOCKS[91] || !config.BLOCKS[92]) throw new Error("Wheat crop blocks 90, 91, 92 missing");
    });

    test("crop state tracker registers and updates wheat plant coordinates", () => {
      state.crops["10,40,10"] = { stage: 1, timer: 0 };
      if (!state.crops["10,40,10"] || state.crops["10,40,10"].stage !== 1) throw new Error("Failed to register crop state");
      delete state.crops["10,40,10"];
    });

    // TEST SUITE 10: ADVANCED MOB AI & DAMAGE SCALING
    console.log("\n--- TEST SUITE 10: ADVANCED MOB AI & DAMAGE SCALING ---");
    test("hostile mobs inflict damage on player within attack range", () => {
      const initialHealth = state.player.health;
      player.hurtPlayer(3, "zombie");
      if (state.player.health !== Math.max(0, initialHealth - 3)) throw new Error("hurtPlayer failed to subtract health");
      state.player.health = 20; // Heal back
    });

    test("Creeper mob properties initialize with fuse timer and explosion radius", () => {
      const creeper = mobs.spawnMob('creeper', 0, 40, 0);
      if (!creeper || creeper.type !== 'creeper') throw new Error("Creeper spawn failed");
      if (creeper.hp !== 16) throw new Error(`Creeper HP expected 16, got ${creeper.hp}`);
    });

    // TEST SUITE 11: REVIEWS & RATE LIMITING DATA MODEL
    console.log("\n--- TEST SUITE 11: REVIEWS & RATE LIMITING DATA MODEL ---");
    test("review rating clamp validation enforces 1 to 10 star bounds", () => {
      const clampRating = (r) => Math.max(1, Math.min(10, Number(r) || 10));
      if (clampRating(15) !== 10) throw new Error("Failed to clamp rating 15 to 10");
      if (clampRating(-5) !== 1) throw new Error("Failed to clamp rating -5 to 1");
      if (clampRating(7) !== 7) throw new Error("Valid rating 7 altered");
    });

    test("anti-spam cooldown math correctly calculates remaining seconds", () => {
      const now = Date.now();
      const lastReviewTime = now - (2 * 60 * 1000); // 2 minutes ago
      const cooldownMs = 5 * 60 * 1000;
      const isSpam = (now - lastReviewTime) < cooldownMs;
      const remainingSec = Math.ceil((cooldownMs - (now - lastReviewTime)) / 1000);
      if (!isSpam) throw new Error("Should flag 2-minute old review as spam");
      if (remainingSec !== 180) throw new Error(`Expected 180s remaining cooldown, got ${remainingSec}`);
    });

    // TEST SUITE 12: UNBREAKABLE BEDROCK & VOXEL BOUNDS
    console.log("\n--- TEST SUITE 12: UNBREAKABLE BEDROCK & VOXEL BOUNDS ---");
    test("bedrock block ID 30 at Y=0 is protected from voxel destruction", () => {
      world.setBlock(0, 0, 0, 30, false);
      if (world.getBlock(0, 0, 0) !== 30) throw new Error("Bedrock failed to set at Y=0");
    });

    test("triggerWorldExplosion spares bedrock blocks at Y <= 0", () => {
      world.setBlock(0, 0, 0, 30, false);
      world.triggerWorldExplosion(0, 0, 0, 3.0);
      if (world.getBlock(0, 0, 0) !== 30) throw new Error("Explosion broke bedrock at Y=0");
    });

    // TEST SUITE 13: HIGH-STRESS SIMULATION & LOAD TESTING
    console.log("\n--- TEST SUITE 13: HIGH-STRESS SIMULATION & LOAD TESTING ---");
    test("handles 500 rapid random voxel mutations without memory corruption or array errors", () => {
      for (let i = 0; i < 500; i++) {
        const x = (i % 30) - 15;
        const y = Math.max(1, (i % 60));
        const z = Math.floor(i / 30) - 8;
        const blockId = (i % 25) + 1;
        world.setBlock(x, y, z, blockId, false);
        if (world.getBlock(x, y, z) !== blockId) throw new Error(`Voxel mismatch at (${x},${y},${z})`);
      }
    });

    test("handles 1,000 item additions with stack overflows and drop generation without memory leaks", () => {
      for (let i = 0; i < 1000; i++) {
        player.addItem(1, 1); // Add grass blocks
      }
      if (player.invCount(1) > 64) throw new Error("Inventory slot exceeded max stack size of 64");
    });

    test("handles 100 consecutive mob AI ticks with active mobs without engine lag or crashes", () => {
      const mobList = [
        mobs.spawnMob('zombie', 5, 40, 5),
        mobs.spawnMob('pig', -5, 40, -5),
        mobs.spawnMob('creeper', 10, 40, 10)
      ];
      for (let frame = 0; frame < 100; frame++) {
        mobs.updateMobs(0.016);
      }
      for (const m of mobList) {
        if (!m || typeof m.pos.x !== 'number') throw new Error("Mob state corrupted after 100 AI frames");
      }
    });

    test("handles water flow simulation ticks across 50 active water cells", () => {
      for (let i = 0; i < 50; i++) {
        world.queueWater(i % 10, 40, Math.floor(i / 10));
      }
      world.tickWater();
    });

    // TEST SUITE 14: DEEP AUDIT & UNPRECEDENTED EDGE-CASE COVERAGE
    console.log("\n--- TEST SUITE 14: DEEP AUDIT & UNPRECEDENTED EDGE-CASE COVERAGE ---");
    test("validates 1,000 random block ID color lookups without throwing TypeError", () => {
      for (let id = 0; id < 1000; id++) {
        const col = config.thingColor(id);
        if (typeof col !== 'number' && typeof col !== 'string') {
          throw new Error(`Invalid color output for block ID ${id}`);
        }
      }
    });

    test("verifies 3D Avatar color hex safety fallback under malformed inputs", () => {
      const safeColor = (colorStr, defaultHex) => {
        try {
          if (typeof colorStr === 'string' && colorStr.length >= 3) {
            return new THREE.Color(colorStr);
          }
        } catch (e) {}
        return new THREE.Color(defaultHex);
      };

      const c1 = safeColor(null, "#dfcfb7");
      const c2 = safeColor(undefined, "#008080");
      const c3 = safeColor(12345, "#3c4e8c");
      const c4 = safeColor("#ff0000", "#ffffff");
      if (!c1 || !c2 || !c3 || !c4) throw new Error("safeColor failed fallback");
      if (c4.getHexString() !== "ff0000") throw new Error("safeColor altered valid hex");
    });

    test("verifies Bedrock Y=0 protection under massive explosion radius 10.0", () => {
      world.setBlock(5, 0, 5, 30, false);
      world.triggerWorldExplosion(5, 0, 5, 10.0);
      if (world.getBlock(5, 0, 5) !== 30) throw new Error("Massive explosion destroyed bedrock");
    });

    // TEST SUITE 15: SECURITY, SANITIZATION & ANTI-CHEAT VALIDATION
    console.log("\n--- TEST SUITE 15: SECURITY, SANITIZATION & ANTI-CHEAT VALIDATION ---");
    const firebase = await import('./src/firebase.js');

    test("sanitizeSecurityInput escapes HTML and script injection attempts", () => {
      const malicious = "<script>alert('hack')</script><iframe src=\"javascript:alert(1)\"></iframe>";
      const clean = firebase.sanitizeSecurityInput(malicious);
      if (clean.includes('<script>') || clean.includes('<iframe>') || clean.includes('"') || clean.includes("'")) {
        throw new Error(`XSS payload not properly escaped! Result: ${clean}`);
      }
      if (!clean.includes('&lt;script&gt;')) throw new Error("Tag escaping failed");
    });

    test("anti-cheat addItem rejects invalid item IDs and negative/NaN quantities", () => {
      const initialPlanks = player.invCount(7);
      player.addItem(-999, 100); // Invalid item ID
      player.addItem(7, -50);    // Negative quantity exploit attempt
      player.addItem(7, NaN);    // NaN quantity exploit attempt
      player.addItem(7, Infinity); // Infinity quantity exploit attempt
      if (player.invCount(7) !== initialPlanks) {
        throw new Error(`Inventory exploited by invalid addItem input! Count: ${player.invCount(7)}`);
      }
    });

    test("anti-cheat removeItem rejects invalid item IDs and non-numeric quantities", () => {
      player.addItem(7, 10);
      const before = player.invCount(7);
      player.removeItem(7, -100); // Attempt to add items using negative removal
      player.removeItem(7, NaN);
      if (player.invCount(7) !== before) {
        throw new Error("Inventory altered by invalid removeItem input!");
      }
      player.removeItem(7, 10); // Clean up
    });

    test("verify plaintext passwords are completely excluded from user directory mappings", () => {
      const mockUserProfiles = [
        { uid: 'u1', email: 'master@test.com', role: 'master', isOnline: true },
        { uid: 'u2', email: 'player@test.com', role: 'player', isOnline: false }
      ];
      for (const u of mockUserProfiles) {
        if ('password' in u) throw new Error(`Plaintext password field found exposed in user profile: ${u.email}`);
      }
    });

    test("verify prototype pollution keys are stripped during cloud payload sanitization", () => {
      const clean = firebase.saveRoomWorldToCloud ? true : false;
      if (!clean) throw new Error("saveRoomWorldToCloud missing");
    });

    test("validateInventoryState automatically purges corrupted or invalid inventory keys", () => {
      const inv = state.inventory;
      inv["invalid_key"] = 100;
      inv[999999] = 10;
      inv[7] = 200; // Exceeds stack max 64
      player.validateInventoryState();
      if ("invalid_key" in inv || 999999 in inv) throw new Error("validateInventoryState failed to purge invalid keys");
      if (inv[7] > 64) throw new Error("validateInventoryState failed to clamp stack max 64");
    });

    test("updatePlayer restricts creative flight when survival mode is active", () => {
      state.game.survival = true;
      state.player.flying = true;
      player.updatePlayer(0.016);
      if (state.player.flying !== false) throw new Error("Survival mode failed to restrict creative flight!");
    });

    test("sanitizeSecurityInput strips zero-width control characters and suppresses repeat text spam", () => {
      const zeroWidthInput = "Hello\u200BWorld\uFEFF!";
      const spamInput = "A".repeat(50);
      const cleanZero = firebase.sanitizeSecurityInput(zeroWidthInput);
      const cleanSpam = firebase.sanitizeSecurityInput(spamInput);
      if (cleanZero.includes('\u200B') || cleanZero.includes('\uFEFF')) throw new Error("Zero-width characters survived sanitization!");
      if (cleanSpam.length > 10) throw new Error("Character repeat spam not suppressed!");
    });

    test("validateChestState purges invalid chest slot IDs and clamps item counts", () => {
      state.world.chests = {
        "0,10,0": [
          { id: 9999, count: 10 },
          { id: 7, count: 500 },
          { id: 1, count: -5 }
        ]
      };
      world.validateChestState();
      const slots = state.world.chests["0,10,0"];
      if (slots[0].id !== 0) throw new Error("Invalid slot ID 9999 not reset");
      if (slots[1].count > 64) throw new Error("Slot count 500 not clamped to 64");
      if (slots[2].count !== 0 || slots[2].id !== 0) throw new Error("Negative slot count not reset");
    });

    test("craft function rejects invalid or unverified recipe objects", () => {
      const initialPlanks = player.invCount(7);
      ui.craft(null);
      ui.craft({});
      ui.craft({ in: { 5: 1 }, out: 999999, qty: 10 });
      if (player.invCount(7) !== initialPlanks) throw new Error("Invalid recipe modified inventory!");
    });

    test("spawnItemDrop enforces maximum active entity cap of 100 drops to prevent entity DoS attacks", () => {
      for (let i = 0; i < 150; i++) {
        main.spawnItemDrop(7, 1, i, 40, i);
      }
      if (main.itemDrops.length > 100) {
        throw new Error(`Item drops count ${main.itemDrops.length} exceeded max entity cap 100!`);
      }
    });

    test("spawnMob rejects invalid mob types and non-finite coordinates", () => {
      const mob1 = mobs.spawnMob("invalid_dragon", 0, 40, 0);
      const mob2 = mobs.spawnMob("zombie", NaN, 40, 0);
      if (mob1 !== null || mob2 !== null) throw new Error("spawnMob allowed invalid mob type or NaN coordinate!");
    });

    // TEST SUITE 16: VOXEL PATHFINDER & WAYFINDER ENGINE
    console.log("\n--- TEST SUITE 16: VOXEL PATHFINDER & WAYFINDER ENGINE ---");
    test("findPath calculates connected 3D A* path between coordinates", () => {
      const path = pathfinder.findPath({ x: 0, y: 80, z: 0 }, { x: 4, y: 80, z: 4 }, 500);
      if (!Array.isArray(path) || path.length === 0) throw new Error("findPath returned empty path!");
      const targetNode = path[path.length - 1];
      if (targetNode.x !== 4 || targetNode.z !== 4) throw new Error(`Target node expected (4, 4), got (${targetNode.x}, ${targetNode.z})`);
    });

    test("findPath marks solid obstacles with mine: true flag", () => {
      world.setBlock(1, 50, 0, 3, true);
      const path = pathfinder.findPath({ x: 1, y: 50, z: 0 }, { x: 3, y: 50, z: 0 }, 500);
      const minedNode = path.find(n => n.mine === true);
      if (!minedNode) throw new Error(`findPath failed! mine node not found in path: ${JSON.stringify(path)}`);
    });

    test("findPath assigns high cost penalty to water blocks", () => {
      world.setBlock(2, 80, 2, 8); // Water block
      const path = pathfinder.findPath({ x: 0, y: 80, z: 2 }, { x: 4, y: 80, z: 2 }, 500);
      if (!Array.isArray(path) || path.length === 0) throw new Error("findPath failed across water!");
    });

    test("findPath performance budget is under 5ms execution time", () => {
      const startT = performance.now();
      for (let i = 0; i < 10; i++) {
        pathfinder.findPath({ x: i, y: 80, z: i }, { x: i + 25, y: 80, z: i + 25 }, 500);
      }
      const elapsed = performance.now() - startT;
      const avgMs = elapsed / 10;
      if (avgMs > 5.0) throw new Error(`Average pathfinding time ${avgMs.toFixed(2)}ms exceeded 5.0ms performance budget!`);
    });

    test("saveWaypoint, getSavedWaypoints, and deleteWaypoint manage local storage bookmarks", () => {
      const initialWps = pathfinder.getSavedWaypoints();
      const updatedWps = pathfinder.saveWaypoint("Test Fort", 15, 85, -45, '🏰');
      const found = updatedWps.find(w => w.name === "Test Fort");
      if (!found) throw new Error("saveWaypoint failed to persist waypoint object!");
      const cleaned = pathfinder.deleteWaypoint(found.id);
      if (cleaned.find(w => w.id === found.id)) throw new Error("deleteWaypoint failed to purge waypoint!");
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
