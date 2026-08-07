# 🪙 Master NPC Village, Green Coin Economy & Trade Catalogue Roadmap

This document serves as the authoritative blueprint and roadmap for the NPC Village, Villager AI, Green Coin Currency Economy, and Market Showcase System in the Voxel game engine.

---

## 📂 Project Architecture

```
src/
 ├── villagers/
 │    ├── villagerTradeCatalog.js # Catalogue registry of all sellable items, prices & render rules
 │    ├── villagerMob.js          # 3D mesh (iconic nose, crossed arms, robes) & mob state
 │    ├── villagerSchedule.js     # Daily schedule state machine (Work, Well Gathering, Sleeping)
 │    ├── villagerFarming.js      # Farmer crop harvesting, tilling, replanting & food sharing
 │    ├── villagerTrading.js      # Green Coin trade resolution, restocks & showcase logic
 │    └── villagerPanic.js        # Zombie evasion, house retreat & wooden door mechanics
 ├── structures/
 │    ├── villageHouses.js        # House schematics with Market Stalls & Display Pedestals
 │    └── villageFarmland.js      # 5 Farmland plot presets (8x10, 5x6, etc.)
 ├── components/
 │    ├── EmeraldHUDOverlay.jsx   # Top-right Green Coin Currency HUD widget (🪙)
 │    └── TradePromptModal.jsx    # "Do you want to buy this?" interactive purchase UI
 └── villageGenerator.js          # Village layout, path generator & foundation levelling
```

---

## 🪙 Emerald Green Coin Currency System (`🪙`)

* **Visual Identity:** Vibrant, shiny **Green Emerald Coin (`🪙`)**.
* **Wallet HUD (`EmeraldHUDOverlay.jsx`):** Persistent HUD counter near top-right: `🪙 24 Green Coins`.
* **3D Market Showcase Pedestals:**
  * Market stalls feature display pedestals (`ID 95`) where items float and rotate slowly in 3D air.
  * Floating 3D hologram labels display item names and prices in Green Coins (`[ 🪙 3 Green Coins ]`).
* **Purchase Interface (`TradePromptModal.jsx`):** Interacting with a pedestal opens a purchase confirmation modal (*"Do you want to buy [Iron Sword] for 🪙 4 Green Coins?"*).

---

## 🗓️ 4-Phase Implementation Plan

### 🧱 Phase 1: Schematics, Trade Catalogue & Data Structures
- `src/structures/villageHouses.js`: 4 House Schematics & Market Pedestal Stands.
- `src/structures/villageFarmland.js`: 5 Farmland Plot Presets (8×10, 5×6, Double Trench, Terraced, L-Shaped).
- `src/villagers/villagerTradeCatalog.js`: Master trade database & Green Coin currency definition.

### 🏞️ Phase 2: Village Generator & Foundation Engine
- `src/villageGenerator.js`: Terrain qualification, foundation ground-levelling, gravel pathway network, and multi-chunk streaming integration.

### 🧑‍🌾 Phase 3: 3D Villager Mobs, Professions & Daily Schedules
- `src/villagers/villagerMob.js`: 3D Villager mesh (iconic nose, crossed arms, profession robes).
- `src/villagers/villagerSchedule.js`: Time-of-day routine state machine (Dawn work, Afternoon Well gathering, Evening/Night sleeping in beds).
- `src/villagers/villagerFarming.js`: Farmer crop harvesting, replanting, and bread sharing.
- `src/villagers/villagerPanic.js`: Zombie evasion, house retreat, and door opening/closing.

### 🪙 Phase 4: Green Coin Economy, Market Showcase Pedestals & Buying UI
- `src/components/EmeraldHUDOverlay.jsx`: Top-right Green Coin HUD widget.
- `src/villagers/villagerTrading.js`: Pedestal showcase rendering, restocking, and trade resolution.
- `src/components/TradePromptModal.jsx`: Interactive purchase prompt UI.
