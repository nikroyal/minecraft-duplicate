import React, { useState } from 'react';

const ONBOARDING_STEPS = [
  {
    step: 1,
    title: "🧭 Welcome to Your Survival Onboarding Guide",
    category: "INTRODUCTION",
    icon: "🌟",
    badge: "BEGINNER GUIDE",
    content: (
      <>
        <p>
          Welcome, Explorer! I am your <strong>Survival Guide Assistant</strong>. I will take you step-by-step through everything you need to know to survive, craft, build, and conquer this infinite 3D voxel world.
        </p>
        <div className="agent-callout">
          <strong>🔒 Unskippable Walkthrough:</strong> To ensure you don't miss essential survival knowledge, this onboarding cannot be skipped all at once. However, you can press <strong>Next Step →</strong> as quickly as you like to advance!
        </div>
      </>
    )
  },
  {
    step: 2,
    title: "🕹️ Movement & Camera Looking Controls",
    category: "BASIC CONTROLS",
    icon: "🧭",
    badge: "MOVEMENT",
    content: (
      <>
        <p>Mastering movement and camera rotation is your first step:</p>
        <ul className="agent-list">
          <li><span className="m-key">W</span> <span className="m-key">A</span> <span className="m-key">S</span> <span className="m-key">D</span> — Move forward, left, backward, right.</li>
          <li><span className="m-key">Mouse Move</span> — Look around in 360° 3D space.</li>
          <li><span className="m-key">Left-Click Game Screen</span> — Locks mouse pointer into the game for smooth camera rotation.</li>
          <li><span className="m-key">Esc</span> — Pause game or release pointer lock to access menus.</li>
        </ul>
      </>
    )
  },
  {
    step: 3,
    title: "🏃 Jumping, Sprinting & Step-Up Mechanics",
    category: "PARKOUR PHYSICS",
    icon: "👟",
    badge: "PHYSICS",
    content: (
      <>
        <p>Traversing mountain terrain and rugged landscapes efficiently:</p>
        <ul className="agent-list">
          <li><span className="m-key">Space</span> — Jump / Swim Up in water.</li>
          <li><span className="m-key">Ctrl</span> or <span className="m-key">Shift</span> — Sprint (increases movement speed &amp; expands FOV).</li>
          <li><strong>Ground Step-Up:</strong> Walking forward into <strong>0.5-block slabs, carpets, or trapdoors</strong> automatically steps up onto them.</li>
          <li><strong>1-Block Mountain Steps:</strong> Full 1.0-block mountain ledges require pressing <span className="m-key">Space</span> to jump up!</li>
        </ul>
      </>
    )
  },
  {
    step: 4,
    title: "⛏️ Mining & Harvesting Voxels",
    category: "RESOURCE GATHERING",
    icon: "⛏️",
    badge: "MINING",
    content: (
      <>
        <p>Every block in this world can be mined and harvested into items:</p>
        <ul className="agent-list">
          <li><strong>Hold Left-Click:</strong> Mine the targeted block. Watch the progressive crack overlay on the block surface.</li>
          <li><strong>Block Hardness:</strong> Dirt and leaves break almost instantly, while Stone and Ores require tools.</li>
          <li><strong>Tool Efficiency:</strong> Pickaxes mine Stone/Ores fast, Axes break Wood/Logs, and Shovels dig Dirt/Sand.</li>
          <li><strong>Unbreakable Bedrock:</strong> Deep underground at <span className="m-key">Y = 0</span> lies unbreakable Bedrock that cannot be destroyed.</li>
        </ul>
      </>
    )
  },
  {
    step: 5,
    title: "📦 3D Item Drops & Automatic Pickup",
    category: "ITEM PICKUP",
    icon: "💎",
    badge: "LOOTING",
    content: (
      <>
        <p>When blocks break or mobs are defeated, they drop floating 3D items:</p>
        <ul className="agent-list">
          <li><strong>Magnet Pickup Range:</strong> Walk within <strong>2.5 blocks</strong> of floating items or XP orbs to automatically attract and collect them into your hotbar and inventory.</li>
          <li><strong>Pickup Toasts:</strong> Text notifications appear in the bottom-left showing items collected (e.g. <em>Picked up +1 Oak Log</em>).</li>
          <li><strong>Item Limit Cap:</strong> Active item entity drops are capped at 100 max entities for smooth performance.</li>
        </ul>
      </>
    )
  },
  {
    step: 6,
    title: "🧱 Hotbar & Block Building Mechanics",
    category: "BUILDING & PLACEMENT",
    icon: "🧱",
    badge: "BUILDING",
    content: (
      <>
        <p>Building shelters, towers, and fortresses is simple and intuitive:</p>
        <ul className="agent-list">
          <li><span className="m-key">1 – 8</span> or <span className="m-key">Scroll Wheel</span> — Select active Hotbar slot.</li>
          <li><span className="m-key">Right-Click</span> — Place selected block onto the targeted block face.</li>
          <li><span className="m-key">Shift</span> + <span className="m-key">Right-Click</span> — Place blocks directly onto liquid water surfaces to build bridges across oceans!</li>
          <li><strong>Torches &amp; Support:</strong> Torches must be attached to solid floor or wall surfaces.</li>
        </ul>
      </>
    )
  },
  {
    step: 7,
    title: "❤️ Survival HUD — Health, Hunger & Food",
    category: "SURVIVAL STATS",
    icon: "🍖",
    badge: "SURVIVAL",
    content: (
      <>
        <p>Monitor your vital stats on the HUD to stay alive in Survival Mode:</p>
        <ul className="agent-list">
          <li>❤️ <strong>Health (20 HP / 10 Hearts):</strong> Reduced by fall damage (falling &gt;3.5 blocks), drowning, zombie hits, creeper explosions, or starvation.</li>
          <li>🍗 <strong>Hunger (20 Points / 10 Drumsticks):</strong> Drains over time (faster when sprinting). At 16+ hunger, health regenerates automatically. At 0 hunger, starvation damage occurs.</li>
          <li><strong>Eating Food:</strong> Select food (Apples, Berries, Bread, Cooked Meat) in hotbar and press <span className="m-key">Q</span> (or right-click) to restore stats!</li>
        </ul>
      </>
    )
  },
  {
    step: 8,
    title: "📘 Inventory & 3x3 Crafting Handbook",
    category: "CRAFTING SYSTEM",
    icon: "📘",
    badge: "CRAFTING",
    content: (
      <>
        <p>Transform raw materials into tools, weapons, armor, and furniture:</p>
        <ul className="agent-list">
          <li>Press <span className="m-key">E</span> — Open your Inventory &amp; 3x3 Crafting Table Handbook.</li>
          <li><strong>Essential Recipes:</strong>
            <ul>
              <li>1 Log → 4 Wood Planks</li>
              <li>4 Planks → Crafting Table (place down to unlock full 3x3 crafting grid!)</li>
              <li>2 Planks → 4 Sticks</li>
              <li>3 Planks + 2 Sticks → Wooden Pickaxe!</li>
            </ul>
          </li>
        </ul>
      </>
    )
  },
  {
    step: 9,
    title: "🔥 Smelting & Cooking with the Furnace",
    category: "SMELTING ENGINE",
    icon: "🔥",
    badge: "FURNACE",
    content: (
      <>
        <p>Ores and raw meats must be smelted using heat in a Furnace:</p>
        <ul className="agent-list">
          <li>Craft a Furnace with <strong>8 Cobblestone</strong>, place it down, and <span className="m-key">Right-Click</span> to open.</li>
          <li><strong>Fuel Slot (Bottom):</strong> Burn Coal, Charcoal, or Wood Planks as fuel.</li>
          <li><strong>Input Slot (Top):</strong> Place Iron Ore, Gold Ore, Sand, or Raw Meat to smelt into Iron Ingots, Gold Ingots, Glass, or Cooked Meat over a 10-second cook cycle.</li>
        </ul>
      </>
    )
  },
  {
    step: 10,
    title: "📦 Chest Storage & Passing the Night with Beds",
    category: "BASE BUILDING",
    icon: "🛏️",
    badge: "HOME BASE",
    content: (
      <>
        <p>Secure your loot and pass dangerous monster-filled nights safely:</p>
        <ul className="agent-list">
          <li><strong>Chest Storage:</strong> Craft a Chest (8 Planks) to store up to 27 item stacks safely.</li>
          <li><strong>Beds &amp; Night Passing:</strong> Craft a Bed (3 Wool + 3 Planks), place inside shelter, and <span className="m-key">Right-Click</span> at night to skip instantly to dawn and heal +6 HP!</li>
        </ul>
      </>
    )
  },
  {
    step: 11,
    title: "🧟 Mobs, Combat & Undead Sunlight Burning",
    category: "COMBAT & MOBS",
    icon: "⚔️",
    badge: "COMBAT",
    content: (
      <>
        <p>Understand nighttime monsters and daylight survival rules:</p>
        <ul className="agent-list">
          <li>🧟 <strong>Zombies:</strong> Melee attackers. Burn in direct sunlight during daytime!</li>
          <li>💀 <strong>Skeletons:</strong> Ranged archers. Burn in direct sunlight during daytime!</li>
          <li>💥 <strong>Creepers:</strong> Stealth explosive mobs! Back away immediately when they start flashing and hissing!</li>
          <li><strong>Weapons:</strong> Craft Swords for melee knockback, and Bow &amp; Arrows for ranged attacks.</li>
        </ul>
      </>
    )
  },
  {
    step: 12,
    title: "🛰️ 3D Voxel Pathfinder & GPS Wayfinder",
    category: "NAVIGATION",
    icon: "🛰️",
    badge: "GPS WAYFINDER",
    content: (
      <>
        <p>Never lose your home base or mining coordinates in the infinite world:</p>
        <ul className="agent-list">
          <li>Press <span className="m-key">G</span> or <span className="m-key">V</span> — Open the 3D Voxel Pathfinder &amp; GPS Wayfinder modal.</li>
          <li><strong>Save Waypoints:</strong> Bookmark your Home Base, Mineshaft, Furnace Room, or Portals.</li>
          <li><strong>3D A* Navigation:</strong> Computes connected 3D paths through terrain and projects glowing GPS guide dots directly in the 3D world!</li>
        </ul>
      </>
    )
  },
  {
    step: 13,
    title: "🎉 Onboarding Training Complete!",
    category: "COMPLETION",
    icon: "🏆",
    badge: "READY TO PLAY",
    content: (
      <>
        <p>
          Congratulations! You have completed the comprehensive <strong>Survival Onboarding Training</strong>.
        </p>
        <div className="agent-callout" style={{ borderColor: 'var(--gold-bright)', background: 'rgba(242, 217, 160, 0.12)' }}>
          <strong>🌟 You Are Fully Equipped:</strong> You know movement, mining, building, crafting, smelting, combat, storage, and GPS navigation. Adventure awaits!
        </div>
      </>
    )
  }
];

export default function OnboardingAgentModal({ onComplete }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const stepData = ONBOARDING_STEPS[currentIdx];
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === ONBOARDING_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      if (typeof window !== 'undefined') {
        localStorage.setItem("hasCompletedOnboarding_v1", "true");
      }
      if (onComplete) onComplete();
    } else {
      setCurrentIdx(prev => Math.min(ONBOARDING_STEPS.length - 1, prev + 1));
    }
  };

  const handlePrev = () => {
    setCurrentIdx(prev => Math.max(0, prev - 1));
  };

  const progressPercent = Math.round(((currentIdx + 1) / ONBOARDING_STEPS.length) * 100);

  return (
    <div id="onboardingAgentModal" className="modal-onboarding-overlay">
      <div className="onboarding-card">
        {/* Header Bar */}
        <div className="onboarding-header">
          <div className="agent-avatar-badge">
            <span className="avatar-icon">{stepData.icon}</span>
            <div className="agent-title-meta">
              <span className="agent-label">VOXEL GUIDE ASSISTANT</span>
              <span className="step-tag">{stepData.badge} • STEP {stepData.step} OF {ONBOARDING_STEPS.length}</span>
            </div>
          </div>
          <div className="no-skip-pill">
            <span>🔒 UNSKIPPABLE WALKTHROUGH</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="onboarding-progress-track">
          <div className="onboarding-progress-fill" style={{ width: `${progressPercent}%` }}></div>
        </div>

        {/* Title */}
        <h2 className="onboarding-title">{stepData.title}</h2>

        {/* Body Content */}
        <div className="onboarding-body">
          {stepData.content}
        </div>

        {/* Footer Controls (No Skip All button, only Previous and Next Step) */}
        <div className="onboarding-footer">
          <button 
            className="btn-agent btn-agent-prev"
            onClick={handlePrev}
            disabled={isFirst}
            style={{ opacity: isFirst ? 0.35 : 1, cursor: isFirst ? 'not-allowed' : 'pointer' }}
          >
            ← Previous
          </button>

          <div className="step-dots">
            {ONBOARDING_STEPS.map((s, idx) => (
              <span 
                key={idx} 
                className={`dot ${idx === currentIdx ? 'active' : ''} ${idx < currentIdx ? 'completed' : ''}`}
                onClick={() => setCurrentIdx(idx)}
                title={`Step ${s.step}: ${s.category}`}
              />
            ))}
          </div>

          <button 
            className={`btn-agent ${isLast ? 'btn-agent-finish' : 'btn-agent-next'}`}
            onClick={handleNext}
          >
            {isLast ? "Finish Guide & Enter World! 🚀" : "Next Step →"}
          </button>
        </div>
      </div>
    </div>
  );
}
