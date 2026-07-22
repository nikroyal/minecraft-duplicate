# 🧱 Voxel Engine & Gameplay Manual

An advanced, browser-based 3D Voxel Sandbox game built with **Three.js**, **React**, and **Vite**. Features infinite procedural terrain, dynamic lighting, water shaders, farming, crafting, smelting, combat, mob AI, multi-view camera controls, and physics telemetry debugging.

---

## 🎮 Features Overview

- **Infinite Voxel World**: Procedurally generated terrain with biomes, caves, mountains, trees, ores, water bodies, and custom sub-block geometry (slabs, stairs, trapdoors, fences, glass panes, crops).
- **Minecraft Java Edition Water Shader**: Dedicated outer-shell greedy meshed water, animated UV scrolling (horizontal surface drift & vertical waterfalls), dual-layer normal map ripples, Schlick Fresnel reflections ($F_0 = 0.02$), tightened specular sun glints, and depth-based color transitions from vibrant turquoise shallow water to clear deep blue oceans.
- **Authentic Texture Atlas System**: Procedural 16x16 pixel-art canvas painter rendering real texture faces for all 60+ blocks and ores (Diamond Ore cyan gems, Crafting Table tools, Furnace fire grates, Chest latches, TNT, Bookshelves, Wool colors) across 3D swatches, hotbar UI, held hand meshes, and floating 3D world item drops.
- **Player Physics & Collision Engine**: Deterministic AABB collision resolution, ground support grid sampling, 1-block step-up climbing, jump buffering (150ms), coyote timer (120ms), and fluid swimming with water exit leaping.
- **Full Gameplay Loop**:
  - **Crafting**: 3x3 Crafting Table grid for tools, weapons, armor, furniture, and building materials.
  - **Smelting & Cooking**: 2-slot Furnace interface with fuel and input smelting progress.
  - **Farming**: Hoe grass/dirt into Farmland, plant Wheat Seeds, watch crops grow through 3 stages, harvest wheat, and craft Bread.
  - **Combat & Ranged Weapons**: Melee swords, Bow & Arrows (high-velocity physics projectiles), and ignitable TNT block explosions.
  - **Storage & Night Passing**: 27-slot Chest container storage and Beds to pass the night and set respawn points.
  - **Hostile Mobs**: Nighttime Zombie melee spawners and Creeper inflation explosions.
- **Physics Debug Telemetry (`F3`)**: Real-time 3D wireframe AABB overlays, collision contact highlights, ground normal indicators, and on-screen telemetry for position, velocity, and camera sync.

---

## ⌨️ Controls & Keybindings

| Key / Action | Function |
| :--- | :--- |
| **`W` `A` `S` `D`** | Move Player |
| **`Space`** | Jump / Swim Up (Hold in water) |
| **`Ctrl` / `Shift`** | Sprint (Increases movement speed & FOV) |
| **`Left-Click`** | Mine Block / Attack Mob (Hold to break) |
| **`Right-Click`** | Place Block / Interact (Chest, Furnace, Bed, TNT, Hoe, Seeds) |
| **`1` – `8`** | Select Hotbar Slot |
| **`Scroll Wheel`** | Cycle Hotbar Slots |
| **`E`** | Open / Close Inventory & Crafting Handbook |
| **`Q`** | Drop 1 Held Item (or Eat Food when holding food) |
| **`F`** | Toggle Creative Flying Mode |
| **`F3`** | Toggle **3D Physics Debug Overlay & Telemetry** |
| **`F5` / `H`** | Cycle Camera View (*First-Person*, *Third-Person Back*, *Third-Person Front*) |
| **`Esc`** | Pause / Main Menu / Release Pointer Lock |

---

## 🏃 Physics & Movement System

### Ground Detection & Collision Resolution
- **Ground Probing**: Probes a 4-point foot grid directly beneath the player's AABB (`py - 0.01`). The player is declared grounded (`onGround = true`) only when feet rest within $0.08$ blocks of a solid top surface.
- **Step-Up Resolution**: Allows grounded players walking forward into 0.5-block slabs, carpets, trapdoors, or 1-block steps to smoothly climb onto the step top. Step-up is strictly disabled for airborne players to prevent mid-air wall levitation.
- **Jump Buffering**: Pressing `Space` up to $150\text{ms}$ before touching the ground buffers the jump command, executing an instant jump upon landing.
- **Coyote Timer**: Allows executing a jump up to $120\text{ms}$ after walking off a block edge.
- **Fluid Swimming**: Submerging in water reduces gravity drag. Holding `Space` swims upward at $+4.5\text{ m/s}$. Reaching the water surface triggers a $+6.4\text{ m/s}$ exit leap boost onto adjacent land.

---

## ⛏️ Tools, Harvesting & Smelting

### Tool Classes & Best Targets
- ⛏️ **Pickaxe**: Stone, Cobblestone, Coal Ore, Iron Ore, Gold Ore, Diamond Ore, Bricks, Sandstone, Obsidian.
- 🪓 **Axe**: Logs, Wood, Planks, Crafting Tables, Chests, Bookshelves.
- 🧹 **Shovel**: Dirt, Grass, Sand, Gravel, Snow, Clay.
- 🧑‍🌾 **Hoe**: Right-click Grass or Dirt to till into **Farmland** (ID 89).

### Tool Tier Scaling
| Tier | Tool Material | Durability | Mining Speed Multiplier | Unlocked Ores |
| :---: | :---: | :---: | :---: | :---: |
| **1** | Wood | 30 uses | 1.0x | Stone, Coal |
| **2** | Stone | 60 uses | 2.0x | Stone, Coal, Iron |
| **3** | Iron | 150 uses | 3.5x | All Ores (Gold, Diamond) |
| **4** | Diamond | 500 uses | 5.0x | All Ores & Obsidian |

### Furnace Smelting Recipes
- **Top Input Slot**: Raw Iron Ore $\rightarrow$ Iron Ingot | Gold Ore $\rightarrow$ Gold Ingot | Sand $\rightarrow$ Glass | Clay $\rightarrow$ Terracotta.
- **Bottom Fuel Slot**: Coal, Charcoal, Logs, Planks.

---

## 🌾 Farming & Food System

1. **Tilling**: Right-click Grass or Dirt with a Hoe to transform it into **Farmland** (`ID 89`).
2. **Sowing**: Right-click Farmland with **Wheat Seeds** (`ID 138`) to sow crops (`ID 90`).
3. **Growth**: Wheat crops automatically progress through growth stages 1 $\rightarrow$ 2 $\rightarrow$ 3 over time.
4. **Harvesting & Crafting**: Break stage 3 ripe wheat to drop Wheat and Seeds. Combine **3 Wheat** in the crafting grid to make **Bread**.
5. **Nutrition**:
   - Max Health = 20 HP (10 Hearts) | Max Hunger = 20 (10 Drumsticks).
   - Hunger $\ge 16$: Automatically regenerates $+1\text{ HP}$ every 3 seconds.
   - Hunger $= 0$: Triggers starvation damage over time.

---

## 🏹 Combat, Bows & Explosives

- **Zombie**: Hostile melee mob spawning in dark areas or at night. Drops Rotten Flesh/Loot.
- **Creeper**: Hostile mob that approaches the player, inflates, and hisses before detonating a 4-block radius terrain explosion.
- **Bow & Arrow**: Craft a Bow (`ID 146`) and Arrows (`ID 147`). Right-clicking with a Bow fires high-velocity physics arrows (`24 m/s`).
- **TNT Explosions**: Place TNT (`ID 56`) and right-click to ignite. Primed TNT pulses and flashes white for $3.0\text{s}$ before triggering a 4-block terrain explosion that damages nearby mobs and players.

---

## 🌊 Modern Water Shader Pipeline

- **Outer-Shell Greedy Mesh**: Merges water faces across chunk slices into large quads and excludes all interior water-to-water faces, reducing quad count and overdraw to zero.
- **Animated UV Scrolling**:
  - Top Surface: Horizontal drift animation (`vec2(worldPos.xz * 1.2 + uTime)`).
  - Vertical Side Faces: Downward waterfall flow (`vec2(worldPos.xz, worldPos.y + uTime * 1.5)`).
- **Dual-Layer Normal Map Ripples**: Computes dual-layer procedural wave interference normals for realistic water surface motion.
- **Schlick Fresnel ($F_0 = 0.02$)**: Blends grazing-angle sky reflections (`uSkyColor`) while preserving clear transparency looking straight down.
- **Depth Color Attenuation**: Transitions from bright turquoise shallow water (`#4ecce6`) to clear deep ocean blue (`#2678b8`).

---

## 🛠️ Physics Debug Overlay (`F3`)

Press **`F3`** in-game to toggle the 3D Physics Debugger:
- **Red Wireframe AABB Box**: Shows the player's exact bounding box ($0.6\text{m} \times 1.8\text{m} \times 0.6\text{m}$).
- **Yellow Wireframe Cubes**: Highlights all solid block colliders currently intersecting or supporting the player footprint.
- **HUD Telemetry Panel**: Displays `Grounded: TRUE/FALSE`, `Vertical Vel (Y)`, `Position (X, Y, Z)`, `In Water`, `Flying`, `Active Colliders Count`, and `Camera Sync`.

---

## 🚀 Development & Build Setup

### Prerequisites
- Node.js (v18+) & npm

### Installation & Local Run
```bash
# Install dependencies
npm install

# Start Vite local development server
npm run dev
```

### Production Build
```bash
# Build optimized client bundle
npm run build
```

---

## 📜 License
MIT License. Built with Vite, Three.js, and React.