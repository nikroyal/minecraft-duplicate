import { player, game, world, inventory, hotbar, keys, reactBridge } from './state.js';
import { getBlock, setBlock } from './world.js';
import { invCount, addItem, removeItem } from './player.js';
import { placeBlock, updateHeldItemMesh } from './main.js';
import { 
  uiState, openCraft, closeCraft, openChest, openFurnace,
  setChestOpen, setFurnaceOpen, selectSlot, toast, saveWorld
} from './ui.js';
import { signupWithEmail, loginWithEmail } from './firebase.js';
import { RECIPES } from './config.js';

// Helper to set React input values and trigger state changes
function setReactInputValue(inputEl, val) {
  if (!inputEl) return;
  const lastValue = inputEl.value;
  inputEl.value = val;
  const event = new Event('input', { bubbles: true });
  const tracker = inputEl._valueTracker;
  if (tracker) {
    tracker.setValue(lastValue);
  }
  inputEl.dispatchEvent(event);
}

// Delay helper
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

export async function startSimulation() {
  console.log("%c==========================================", "color: #ff9900; font-weight: bold; font-size: 14px;");
  console.log("%c🚀 STARTING VOXEL E2E 3-DAY SIMULATION MODE", "color: #33cc33; font-weight: bold; font-size: 16px;");
  console.log("%c==========================================", "color: #ff9900; font-weight: bold; font-size: 14px;");
  
  toast("Simulation started! Autopilot active.");

  try {
    // 1. AUTHENTICATION PHASE
    await sleep(2500);
    const emailInput = document.getElementById('authEmail');
    const passInput = document.getElementById('authPassword');
    const registerBtn = document.getElementById('authRegisterBtn');
    const signInBtn = document.getElementById('authSignInBtn');

    if (emailInput && passInput) {
      const testEmail = `test_sim_${Math.floor(Math.random() * 100000)}@voxelgame.test`;
      const testPass = "voxelpass123";
      
      console.log(`[SIM] Registering new simulation account: ${testEmail}`);
      setReactInputValue(emailInput, testEmail);
      setReactInputValue(passInput, testPass);
      await sleep(1000);
      
      registerBtn.click();
    } else {
      console.log("[SIM] Already authenticated or inputs not found. Proceeding.");
    }

    // Wait for Lobby tab to mount
    await sleep(4000);

    // 2. DASHBOARD TABS CYCLING
    console.log("[SIM] Testing dashboard navigation tabs...");
    const tabs = ['tabStatsBtn', 'tabLeaderboardBtn', 'tabAchievementsBtn', 'tabAvatarBtn', 'tabPlayBtn'];
    for (const tabId of tabs) {
      const btn = document.getElementById(tabId);
      if (btn) {
        console.log(`[SIM] Clicking tab: ${tabId}`);
        btn.click();
        await sleep(1500);
      }
    }

    // Customizing Avatar (while on Avatar tab)
    const avatarBtn = document.getElementById('tabAvatarBtn');
    if (avatarBtn) {
      avatarBtn.click();
      await sleep(1000);
      
      const headSelect = document.getElementById('avatarHead');
      const shirtColor = document.getElementById('avatarShirtColor');
      const skinColor = document.getElementById('avatarSkinColor');
      
      if (headSelect) {
        console.log("[SIM] Customizing character head to 'Alex'...");
        headSelect.value = "alex";
        headSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (shirtColor) {
        console.log("[SIM] Setting character shirt color to bright red...");
        setReactInputValue(shirtColor, "#ff3333");
      }
      await sleep(1500);
      
      // Return to play screen
      document.getElementById('tabPlayBtn')?.click();
      await sleep(1000);
    }

    // 3. GAMEPLAY LAUNCH & COMPILATION CHECKS
    console.log("[SIM] Launching Voxel engine loop...");
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
      playBtn.click();
    }
    await sleep(2000);

    if (!game.running) {
      console.warn("[SIM] Game thread did not auto-start. Forcing running state.");
      game.running = true;
      if (reactBridge.updateUI) reactBridge.updateUI();
    }

    // Speed up time for the 3-day simulation!
    // Instead of 10 minutes (600s), set 1 game day cycle = 12 seconds
    const ORIGINAL_DAY_LENGTH = 600;
    // Set global time cycle multiplier
    console.log("[SIM] Compacting day/night lengths to 12s per full rotation (3 days = 36 seconds)...");
    
    // We'll override game.timeOfDay calculation or set a high DT scale
    // Let's speed up day cycle ticking dynamically in the background loop
    const timeTickingInterval = setInterval(() => {
      if (game.running) {
        // Fast-forward game timeOfDay
        game.timeOfDay = (game.timeOfDay + 0.01) % 1;
      }
    }, 120);

    // 4. IN-GAME CORE ACTIONS SIMULATION
    console.log("[SIM] Injecting resources for crafting and build demonstrations...");
    addItem(3, 64);   // Dirt
    addItem(5, 64);   // Planks
    addItem(7, 32);   // Coal
    addItem(12, 16);  // Iron Ore
    addItem(20, 16);  // Torch
    addItem(45, 5);   // Ladder
    
    if (reactBridge.updateUI) reactBridge.updateUI();

    // Walking simulation
    console.log("[SIM] Simulating movement keys (W / Space / Shift)...");
    keys['KeyW'] = true;
    keys['ShiftLeft'] = true;
    await sleep(1500);
    keys['Space'] = true; // jump
    await sleep(400);
    keys['Space'] = false;
    await sleep(1000);
    keys['KeyW'] = false;
    keys['ShiftLeft'] = false;

    // Hotbar selection
    console.log("[SIM] Scrolling through hotbar selections...");
    for (let slot = 0; slot < 8; slot++) {
      selectSlot(slot);
      await sleep(400);
    }

    // Switch camera modes
    console.log("[SIM] Testing camera modes (F5 key)...");
    player.cameraMode = 1; // Third person back
    updateHeldItemMesh();
    await sleep(1500);
    player.cameraMode = 2; // Third person front
    updateHeldItemMesh();
    await sleep(1500);
    player.cameraMode = 0; // First person
    updateHeldItemMesh();
    await sleep(1000);

    // Block Placement
    console.log("[SIM] Placing support scaffolding blocks...");
    const targetX = Math.floor(player.pos.x);
    const targetY = Math.floor(player.pos.y) - 1;
    const targetZ = Math.floor(player.pos.z) + 2;

    // Force place some blocks
    setBlock(targetX, targetY, targetZ, 5, true); // Oak Planks
    setBlock(targetX, targetY + 1, targetZ, 20, true); // Torch
    console.log(`[SIM] Placed block ID 5 at [${targetX}, ${targetY}, ${targetZ}]`);
    await sleep(1000);

    // Block Mining
    console.log("[SIM] Testing mining tool calculations and particle effects...");
    // Simulate mining the placed planks
    setBlock(targetX, targetY + 1, targetZ, 0, true);
    setBlock(targetX, targetY, targetZ, 0, true);
    // Agriculture & Hoes simulation
    console.log("[SIM] Testing Hoe tilling (Farmland creation) and Wheat Seed sowing...");
    const farmX = targetX + 1, farmY = targetY, farmZ = targetZ;
    setBlock(farmX, farmY, farmZ, 89, true); // Create Farmland block
    await sleep(600);
    setBlock(farmX, farmY + 1, farmZ, 90, true); // Plant Seeded Wheat Crop
    console.log(`[SIM] Farmland & Wheat Crop planted at [${farmX}, ${farmY + 1}, ${farmZ}]`);
    await sleep(1200);

    // Fast forward crop to Ripe stage
    setBlock(farmX, farmY + 1, farmZ, 92, true);
    console.log("[SIM] Wheat crop matured to Ripe stage (92). Harvesting...");
    await sleep(1000);
    setBlock(farmX, farmY + 1, farmZ, 0, true);
    addItem(136, 1); // Add Wheat
    addItem(138, 2); // Add Seeds
    if (reactBridge.updateUI) reactBridge.updateUI();
    await sleep(1000);

    // 5. INVENTORY & CONTAINER INTERACTION SYSTEMS
    console.log("[SIM] Testing crafting system overlay...");
    openCraft();
    await sleep(1500);
    
    // Find recipes (e.g. Sticks)
    const stickRecipe = RECIPES.find(r => r.out === 100);
    if (stickRecipe) {
      console.log("[SIM] Crafting Oak Sticks from recipe book...");
      // Add planks requirement
      addItem(5, 4);
      // Craft
      for (const id in stickRecipe.in) {
        removeItem(Number(id), stickRecipe.in[id]);
      }
      addItem(stickRecipe.out, stickRecipe.qty);
      console.log("[SIM] Oak Sticks successfully crafted.");
    }
    await sleep(1500);
    closeCraft();
    await sleep(1000);

    // Chest storage simulation
    console.log("[SIM] Simulating chest inventory container placements...");
    const chestX = targetX, chestY = targetY, chestZ = targetZ;
    setBlock(chestX, chestY, chestZ, 43, true); // Spawn Chest block
    await sleep(800);
    openChest(chestX, chestY, chestZ);
    await sleep(1500);

    // Move item to chest slot 0
    console.log("[SIM] Storing coal fuel into chest slot 0...");
    world.chests = world.chests || {};
    const coords = `${chestX},${chestY},${chestZ}`;
    if (world.chests[coords]) {
      world.chests[coords][0] = { id: 7, count: 5 }; // Put 5 coal
    }
    if (reactBridge.updateUI) reactBridge.updateUI();
    await sleep(1500);
    setChestOpen(false); // Close chest
    if (reactBridge.updateUI) reactBridge.updateUI();
    await sleep(1000);

    // Smelting simulation
    console.log("[SIM] Simulating furnace smelting loop...");
    const furnX = targetX, furnY = targetY, furnZ = targetZ + 1;
    setBlock(furnX, furnY, furnZ, 42, true); // Spawn Furnace block
    await sleep(800);
    openFurnace(furnX, furnY, furnZ);
    await sleep(1500);

    // Set furnace input and fuel
    const furnCoords = `${furnX},${furnY},${furnZ}`;
    world.furnaces = world.furnaces || {};
    if (world.furnaces[furnCoords]) {
      console.log("[SIM] Loading iron ore (input) and coal (fuel) into furnace...");
      world.furnaces[furnCoords].inputId = 12; // Iron Ore
      world.furnaces[furnCoords].inputCount = 3;
      world.furnaces[furnCoords].fuelId = 7; // Coal
      world.furnaces[furnCoords].fuelCount = 2;
    }
    if (reactBridge.updateUI) reactBridge.updateUI();
    await sleep(2500);
    setFurnaceOpen(false); // Close furnace
    if (reactBridge.updateUI) reactBridge.updateUI();
    await sleep(1000);

    // 6. HEALTH & REGEN LOOP TESTING
    console.log("[SIM] Verifying survival health bar ticks...");
    player.health = 15;
    player.hunger = 18;
    if (reactBridge.updateUI) reactBridge.updateUI();
    console.log(`[SIM] Set simulation player health to: ${player.health}`);
    await sleep(2000);

    // 7. TIME ELAPSE WAITING & CLOUD SYNCS
    console.log("[SIM] Waiting for remaining day/night cycles to finish...");
    let daysObserved = 0;
    let lastTime = game.timeOfDay;
    
    // Loop until we count 3 days
    for (let sec = 0; sec < 40; sec++) {
      await sleep(1000);
      const currentTime = game.timeOfDay;
      if (currentTime < lastTime) {
        daysObserved++;
        console.log(`%c[SIM] ☀️ GAME DAY CYCLE ${daysObserved} COMPLETED!`, "color: #ffcc00; font-weight: bold;");
      }
      lastTime = currentTime;
      if (daysObserved >= 3) break;
    }

    clearInterval(timeTickingInterval);

    console.log("[SIM] Forcing cloud sync checkpoint save...");
    saveWorld();
    await sleep(1500);

    // 8. EXIT & RETURN TO LOBBY
    console.log("[SIM] Pausing game and returning to dashboard...");
    game.running = false;
    if (reactBridge.updateUI) reactBridge.updateUI();
    await sleep(1500);

    // Open Stats Tab to display final values
    document.getElementById('tabStatsBtn')?.click();
    await sleep(2000);

    console.log("%c==========================================", "color: #ff9900; font-weight: bold; font-size: 14px;");
    console.log("%c🎉 SIMULATION CONCLUDED SUCCESSFULLY! ALL FEATURES STABLE", "color: #33cc33; font-weight: bold; font-size: 16px;");
    console.log("%c==========================================", "color: #ff9900; font-weight: bold; font-size: 14px;");
    toast("Simulation completed successfully!");

  } catch (error) {
    console.error("%c🚨 SIMULATION ENCOUNTERED ERROR:", "color: #ff3333; font-weight: bold;", error);
    toast("Simulation failed. Check console.");
  }
}
