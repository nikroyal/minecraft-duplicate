import React, { useState, useEffect, useMemo } from 'react';
import { player, game, world, inventory, hotbar, reactBridge } from '../state.js';
import { getBlock } from '../world.js';
import { isSolid } from '../config.js';
import { respawnPlayer, invCount } from '../player.js';
import { resolveSyncConflict } from '../firebase.js';
import { thingName, BLOCKS, RECIPES, isPlaceable } from '../config.js';
import { initAudio } from '../audio.js';

import Swatch3D from './Swatch3D.jsx';
import AuthCard from './AuthCard.jsx';
import LobbyCard from './LobbyCard.jsx';
import HUDOverlay from './HUDOverlay.jsx';
import ChestScreen from './ChestScreen.jsx';
import FurnaceScreen from './FurnaceScreen.jsx';
import { 
  uiState, setChestOpen, setFurnaceOpen, setActiveChestCoords, setActiveFurnaceCoords,
  closeCraft, scheduleSave, craft, updateLobbyAvatarPreview, toast, deathCause,
  lastAuthStatus, lastSyncConflict, activeAchievementNotification
} from '../ui.js';

export default function App() {
  const [tick, setTick] = useState(0);

  // Auth
  const [authStatus, setAuthStatus] = useState('connecting');
  const [syncMsg, setSyncMsg] = useState('Connecting to Firebase...');
  const [currentUser, setCurrentUser] = useState(null);
  const [conflictData, setConflictData] = useState(null);

  // HUD
  const [fps, setFps] = useState(60);
  const [coordsStr, setCoordsStr] = useState('0, 0, 0');
  const [clockStr, setClockStr] = useState('--:--');
  const [targetBlockName, setTargetBlockName] = useState(null);

  // Crafting
  const [craftTab, setCraftTab] = useState('craft');
  const [recipeFilter, setRecipeFilter] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [recipesTabFilter, setRecipesTabFilter] = useState('');

  // Force re-render helper used from game loop
  const forceUpdate = () => setTick(t => t + 1);

  useEffect(() => {
    window.__onStatusChange = (status) => {
      if (status.state === 'connecting') {
        setAuthStatus('connecting'); setSyncMsg(status.message);
      } else if (status.state === 'unconfigured') {
        setAuthStatus('unconfigured'); setSyncMsg(status.message);
        setCurrentUser({ email: 'Offline Mode' });
      } else if (status.state === 'logged_in') {
        setAuthStatus('logged_in'); setSyncMsg(status.message);
        setCurrentUser(status.user);
        window.__currentUserEmail = status.user.email;
      } else if (status.state === 'logged_out') {
        setAuthStatus('logged_out'); setSyncMsg(status.message);
        setCurrentUser(null);
      } else {
        setSyncMsg(status.message);
      }
    };

    window.__onSyncConflict = (cloudData) => setConflictData(cloudData);

    reactBridge.updateUI = () => {
      forceUpdate();
      const px = player?.pos ? Math.floor(player.pos.x) : 0;
      const py = player?.pos ? Math.floor(player.pos.y) : 0;
      const pz = player?.pos ? Math.floor(player.pos.z) : 0;
      setCoordsStr(`${px} ${py} ${pz}`);

      const timeVal = typeof game?.timeOfDay === 'number' && !isNaN(game.timeOfDay) ? game.timeOfDay : 0.3;
      const rawTime = (timeVal * 24) % 24;
      const hh = Math.floor(rawTime).toString().padStart(2, '0');
      const mm = Math.floor((rawTime % 1) * 60).toString().padStart(2, '0');
      setClockStr(`${hh}:${mm}`);

      const target = window.__targetBlockId;
      const name = target > 0 ? thingName(target) : null;
      setTargetBlockName(name ? String(name).toUpperCase() : null);
      setFps(game.fps || 60);
    };

    if (lastAuthStatus) {
      window.__onStatusChange(lastAuthStatus);
    }
    if (lastSyncConflict) {
      window.__onSyncConflict(lastSyncConflict);
    }

    return () => {
      reactBridge.updateUI = null;
      window.__onStatusChange = null;
      window.__onSyncConflict = null;
    };
  }, []);

  const handleCloseChest = () => {
    setChestOpen(false);
    setActiveChestCoords(null);
    if (!window.__touch?.isTouch && game.running) {
      try {
        const promise = document.getElementById('game')?.requestPointerLock();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});
      } catch(e){}
    }
    forceUpdate();
  };

  const handleCloseFurnace = () => {
    setFurnaceOpen(false);
    setActiveFurnaceCoords(null);
    if (!window.__touch?.isTouch && game.running) {
      try {
        const promise = document.getElementById('game')?.requestPointerLock();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});
      } catch(e){}
    }
    forceUpdate();
  };

  const handleResolveConflict = (keepCloud) => {
    resolveSyncConflict(keepCloud, conflictData);
    setConflictData(null);
  };

  const canCraftRecipe = (recipe) => {
    for (const reqId in recipe.in) {
      if (invCount(Number(reqId)) < recipe.in[reqId]) return false;
    }
    return true;
  };

  const filteredRecipes = useMemo(() => {
    const filter = recipeFilter.toLowerCase();
    return RECIPES.filter(r => thingName(r.out).toLowerCase().includes(filter));
  }, [recipeFilter]);

  const filteredBlocks = useMemo(() => {
    const filter = blockFilter.toLowerCase();
    return Object.keys(BLOCKS)
      .map(Number)
      .filter(id => BLOCKS[id] && BLOCKS[id].name && BLOCKS[id].name.toLowerCase().includes(filter));
  }, [blockFilter]);

  const showOverlay = !game.running && authStatus !== 'connecting';
  const showAuth = showOverlay && authStatus === 'logged_out';
  const showLobby = showOverlay && (authStatus === 'logged_in' || authStatus === 'unconfigured');

  return (
    <>
      {/* AUTH / LOBBY OVERLAY */}
      {showOverlay && (
        <div id="overlay">
          {showAuth && <AuthCard />}
          {showLobby && (
            <LobbyCard
              userEmail={currentUser?.email || 'Offline Player'}
              syncStatus={syncMsg}
              scheduleSave={scheduleSave}
              onStartGame={() => {
                game.running = true;
                initAudio();
                forceUpdate();
                setTimeout(() => {
                  try {
                    const promise = document.getElementById('game')?.requestPointerLock();
                    if (promise && typeof promise.catch === 'function') promise.catch(() => {});
                  } catch(e){}
                }, 100);
              }}
            />
          )}
        </div>
      )}

      {/* IN-GAME ELEMENTS */}
      {game.running && (
        <>
          <HUDOverlay
            selectedSlot={game.selected}
            targetBlockName={targetBlockName}
            fps={fps}
            coordsStr={coordsStr}
            clockStr={clockStr}
          />

          {/* Crafting Screen */}
          {uiState.craftOpen && (
            <div id="craftScreen" className="modal-chest" style={{ display: 'flex' }}>
              <div className="chest-card" style={{ maxWidth: '640px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div className="dashboard-tabs" style={{ margin: 0 }}>
                    {['craft','blocks','recipes','manual'].map(tab => (
                      <button key={tab} className={`dash-tab ${craftTab === tab ? 'active' : ''}`}
                        style={{ padding: '4px 10px', fontSize: '10px' }}
                        onClick={() => setCraftTab(tab)}>
                        {tab === 'craft' ? '🔨 Craft' : tab === 'blocks' ? '📚 Encyclopedia' : tab === 'recipes' ? '📜 Recipes' : '📖 Manual'}
                      </button>
                    ))}
                  </div>
                  <button className="chest-close" onClick={closeCraft}>Close [X]</button>
                </div>

                {craftTab === 'craft' && (
                  <div className="craft-body">
                    <div className="craft-col">
                      <div className="craft-label">Your Materials</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                        {Object.keys(inventory).map(Number).filter(id => invCount(id) > 0).map(id => (
                          <div key={id} className="inv-cell">
                            <Swatch3D id={id} />
                            <span className="count">{invCount(id)}</span>
                            <span className="tip">{thingName(id)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="craft-col wide">
                      <div className="craft-label">Recipe Book</div>
                      <input type="text" value={recipeFilter} onChange={e => setRecipeFilter(e.target.value)}
                        placeholder="Search recipes…" className="recipe-search" style={{ background: 'var(--ink)' }} />
                      <div className="recipe-list">
                        {filteredRecipes.map((recipe, i) => {
                          const craftable = canCraftRecipe(recipe);
                          return (
                            <div key={i} className={`recipe-row ${craftable ? 'can-craft' : ''}`}
                              style={{ cursor: craftable ? 'pointer' : 'default', opacity: craftable ? 1 : 0.5 }}
                              onClick={() => { if (craftable) { craft(recipe); forceUpdate(); } }}>
                              <div className="r-swatch-container"><Swatch3D id={recipe.out} /></div>
                              <div style={{ flex: 1, paddingLeft: '10px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff' }}>
                                  {thingName(recipe.out)}{recipe.qty > 1 ? ` ×${recipe.qty}` : ''}
                                </div>
                                <div style={{ fontSize: '9px', color: 'var(--gold)' }}>{recipe.label}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {craftTab === 'blocks' && (
                  <div className="craft-col wide" style={{ flex: 1 }}>
                    <input type="text" value={blockFilter} onChange={e => setBlockFilter(e.target.value)}
                      placeholder="Search blocks…" className="recipe-search" style={{ background: 'var(--ink)', marginBottom: '8px' }} />
                    <div className="block-list">
                      {filteredBlocks.map(id => (
                        <div key={id} className="block-row">
                          <div className="b-swatch-container"><Swatch3D id={id} /></div>
                          <div style={{ flex: 1, paddingLeft: '10px', fontSize: '10px' }}>
                            <div style={{ fontWeight: 'bold', color: '#fff' }}>{BLOCKS[id].name}</div>
                            <div style={{ color: 'var(--gold)', fontSize: '8px' }}>
                              {BLOCKS[id].solid ? 'Solid Voxel' : 'Non-Solid'} · Hardness: {BLOCKS[id].hardness} · ID: {id}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {craftTab === 'recipes' && (() => {
                  const smeltingRecipes = [
                    { inId: 12, outId: 102, desc: 'Iron Ore → Iron Ingot' },
                    { inId: 13, outId: 103, desc: 'Gold Ore → Gold Ingot' },
                    { inId: 14, outId: 104, desc: 'Diamond Ore → Diamond' },
                    { inId: 4,  outId: 9,   desc: 'Sand → Glass' },
                    { inId: 15, outId: 3,   desc: 'Cobblestone → Stone' },
                    { inId: 3,  outId: 40,  desc: 'Stone → Smooth Stone' },
                    { inId: 23, outId: 120, desc: 'Spruce Wood → Charcoal' },
                    { inId: 28, outId: 36,  desc: 'Clay → Terracotta' },
                    { inId: 133,outId: 134, desc: 'Raw Meat → Cooked Meat' },
                  ];
                  const rFilter = recipesTabFilter.toLowerCase();
                  const filtCraft = RECIPES.filter(r => thingName(r.out).toLowerCase().includes(rFilter) || (r.label||'').toLowerCase().includes(rFilter));
                  const filtSmelt = smeltingRecipes.filter(s => s.desc.toLowerCase().includes(rFilter) || thingName(s.outId).toLowerCase().includes(rFilter));
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input type="text" value={recipesTabFilter} onChange={e => setRecipesTabFilter(e.target.value)}
                        placeholder="Search all recipes & smelting…" className="recipe-search"
                        style={{ background: 'var(--ink)', width: '100%', boxSizing: 'border-box' }} />
                      <div className="craft-body" style={{ maxHeight: '250px', overflowY: 'auto', gap: '16px', padding: '4px 0' }}>
                        <div className="craft-col" style={{ flex: 1.2 }}>
                          <div className="craft-label" style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px' }}>🔨 Crafting ({filtCraft.length})</div>
                          <div className="recipe-list" style={{ maxHeight: '210px', overflowY: 'auto', paddingRight: '4px' }}>
                            {filtCraft.map((recipe, i) => (
                              <div key={i} className="recipe-row" style={{ opacity: 1, cursor: 'default', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--slot-line)', borderRadius: '4px', padding: '6px', marginBottom: '4px', display: 'flex', alignItems: 'center', minHeight: '40px' }}>
                                <div className="r-swatch-container" style={{ width: '26px', height: '26px', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Swatch3D id={recipe.out} /></div>
                                <div style={{ flex: 1, paddingLeft: '8px' }}>
                                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff' }}>{thingName(recipe.out)}{recipe.qty > 1 ? ` ×${recipe.qty}` : ''}</div>
                                  <div style={{ fontSize: '8px', color: 'var(--gold)', marginTop: '1px' }}>{Object.keys(recipe.in).map(reqId => `${recipe.in[reqId]}× ${thingName(Number(reqId))}`).join(', ')}</div>
                                </div>
                              </div>
                            ))}
                            {filtCraft.length === 0 && <div style={{ fontSize: '9px', color: '#888', padding: '8px' }}>No crafting recipes match.</div>}
                          </div>
                        </div>
                        <div className="craft-col" style={{ flex: 1 }}>
                          <div className="craft-label" style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px' }}>🔥 Smelting ({filtSmelt.length})</div>
                          <div className="recipe-list" style={{ maxHeight: '210px', overflowY: 'auto', paddingRight: '4px' }}>
                            {filtSmelt.map((s, idx) => (
                              <div key={idx} className="recipe-row" style={{ opacity: 1, cursor: 'default', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--slot-line)', borderRadius: '4px', padding: '6px', marginBottom: '4px', display: 'flex', alignItems: 'center', minHeight: '40px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                  <Swatch3D id={s.inId} />
                                  <span style={{ color: 'var(--gold)', fontSize: '10px', fontWeight: 'bold' }}>→</span>
                                  <Swatch3D id={s.outId} />
                                </div>
                                <div style={{ flex: 1, paddingLeft: '8px' }}>
                                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff' }}>{thingName(s.outId)}</div>
                                  <div style={{ fontSize: '8px', color: '#9a8a76' }}>{s.desc}</div>
                                </div>
                              </div>
                            ))}
                            {filtSmelt.length === 0 && <div style={{ fontSize: '9px', color: '#888', padding: '8px' }}>No smelting recipes match.</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {craftTab === 'manual' && (
                  <div className="manual-body" style={{ maxHeight: '310px', overflowY: 'auto', paddingRight: '6px' }}>

                    <h3>🎮 Welcome to Voxel</h3>
                    <p>A browser-based voxel survival game. Mine resources, craft tools &amp; weapons, build structures, manage hunger and health, and survive hostile mobs through the night. Your entire world saves automatically to the cloud.</p>

                    <h3>⌨️ Controls &amp; Hotkeys</h3>
                    <ul>
                      <li><span className="m-key">W A S D</span> Move &nbsp;|&nbsp; <span className="m-key">Space</span> Jump &nbsp;|&nbsp; <span className="m-key">Shift</span> Sprint (drains hunger faster)</li>
                      <li><span className="m-key">Left-click</span> Mine blocks / attack mobs</li>
                      <li><span className="m-key">Right-click</span> Place blocks / open chests &amp; furnaces / interact</li>
                      <li><span className="m-key">1 – 8</span> Select hotbar slot &nbsp;|&nbsp; <span className="m-key">Scroll</span> Cycle hotbar</li>
                      <li><span className="m-key">E</span> Open / close crafting menu &amp; containers</li>
                      <li><span className="m-key">Q</span> Eat food held in hand (must be a food item)</li>
                      <li><span className="m-key">F</span> Toggle fly mode (Creative) &nbsp;|&nbsp; <span className="m-key">Double-Space</span> Fly up</li>
                      <li><span className="m-key">H</span> / <span className="m-key">F5</span> Cycle camera view: First Person → Third Person Back → Front</li>
                      <li><span className="m-key">Esc</span> Pause &amp; return to Lobby Dashboard</li>
                    </ul>

                    <h3>❤️ Health &amp; Hunger</h3>
                    <ul>
                      <li><strong>Hearts (10 slots, max 20 HP):</strong> Displayed bottom-left. Lose HP from falls (3.5+ blocks), drowning, void, mob attacks, and explosions.</li>
                      <li><strong>Hunger (10 drumsticks, max 20):</strong> Drains over time and faster when sprinting. At 0, you take starvation damage. At 16+, health regenerates passively.</li>
                      <li><strong>Eating:</strong> Hold a food item (Cooked Meat, Bread, etc.) in your active hotbar slot and press <span className="m-key">Q</span>.</li>
                      <li><strong>Tip:</strong> Always carry cooked food. Raw meat restores less hunger and doesn't trigger regeneration.</li>
                    </ul>

                    <h3>⛏️ Mining &amp; Tools</h3>
                    <ul>
                      <li><strong>Bare hands:</strong> Can mine soft blocks (dirt, sand, leaves) slowly. Cannot break stone or ores — you need a pickaxe.</li>
                      <li><strong>Pickaxe:</strong> Required for stone, cobble, ores, bricks, obsidian. Higher tiers break faster.</li>
                      <li><strong>Axe:</strong> Faster on wood, logs, planks, chests, bookshelves, ladders, fences.</li>
                      <li><strong>Shovel:</strong> Faster on dirt, grass, sand, gravel, snow, clay.</li>
                      <li><strong>Hoe:</strong> Right-click dirt or grass to convert it to Farmland for planting Wheat Seeds.</li>
                      <li><strong>Sword:</strong> Deals extra damage to mobs vs. bare hands. Sword tier affects damage output.</li>
                      <li><strong>Tool Tiers:</strong> Wood → Stone → Iron → Diamond. Each tier lasts longer and mines/attacks faster. Durability is shown as a colored bar under the tool icon in the hotbar.</li>
                      <li><strong>Crafting tools:</strong> You need a Crafting Table (4 planks) to craft most items. Place it, right-click, and select the Craft tab.</li>
                    </ul>

                    <h3>🔥 Crafting Table &amp; Furnace</h3>
                    <ul>
                      <li><strong>Crafting Table (4 oak planks):</strong> Required for most recipes. Place it and right-click to open. Use the <em>Craft</em> tab to see all craftable recipes given your current inventory.</li>
                      <li><strong>Furnace (8 cobblestone):</strong> Used to smelt ores and cook food. Right-click to open. Put the raw material in the <em>top</em> slot, fuel (Coal, Charcoal, Log, Plank) in the <em>bottom</em> slot. Smelted output appears on the right.</li>
                      <li><strong>Fuel efficiency:</strong> Coal and Charcoal smelt 8 items per piece. Logs smelt 1.5 items. Planks smelt 1 item each.</li>
                      <li><strong>Charcoal:</strong> Craft by smelting Spruce Wood. Good early-game alternative to Coal.</li>
                    </ul>

                    <h3>📦 Storage &amp; Chests</h3>
                    <ul>
                      <li><strong>Chest (8 planks):</strong> Stores up to 27 item stacks. Place and right-click to open. Click your inventory items to deposit, or click chest items to retrieve.</li>
                      <li>Breaking a chest drops all items inside as pickups — be careful!</li>
                      <li>Chests do not stack — each placed chest is a separate container with its own inventory.</li>
                    </ul>

                    <h3>🌾 Farming</h3>
                    <ul>
                      <li><strong>Hoe:</strong> Craft a hoe (2 planks + 2 sticks) and right-click on Grass or Dirt to convert it to Farmland.</li>
                      <li><strong>Wheat Seeds (138):</strong> Right-click Farmland to plant seeds. Seeds go through 3 growth stages: Seeded → Growing → Ripe.</li>
                      <li><strong>Harvest:</strong> Left-click ripe wheat to harvest. Ripe wheat drops Wheat and seeds. Wheat can be crafted into Bread.</li>
                      <li><strong>Tip:</strong> Farmland near water grows crops faster. Keep your farm lit at night to prevent mob trampling.</li>
                    </ul>

                    <h3>🏗️ Building Blocks &amp; Variants</h3>
                    <ul>
                      <li><strong>Stairs:</strong> Crafted from 6 of a base block → 4 Stairs. Place naturally or upside-down. Great for roofs and hillside paths.</li>
                      <li><strong>Slabs:</strong> 3 of a block → 6 Slabs. Half-height blocks for detail work. Two slabs craft back into a full block.</li>
                      <li><strong>Walls:</strong> 6 blocks + 1 stick → 6 Walls. Thin decorative barrier. Connects automatically to adjacent walls and blocks.</li>
                      <li><strong>Fences &amp; Gates:</strong> Crafted from planks + sticks. Fences prevent mob and player pathfinding. Gates can be opened with right-click.</li>
                      <li><strong>Glass Pane:</strong> 6 Glass → 16 Panes. Thinner than full glass blocks. Use for windows.</li>
                      <li><strong>Trapdoors:</strong> Right-click to toggle open/closed. Useful for hatch entrances and decorative vents.</li>
                      <li><strong>Ladders:</strong> 7 sticks → 3 Ladders. Place on a wall face and climb by walking into them.</li>
                      <li><strong>Torches:</strong> Stick + Coal/Charcoal → 4 Torches. Light sources that prevent mob spawning nearby. Place on walls or floors.</li>
                      <li><strong>Glowstone:</strong> 4 Gold Ingots → Glowstone. Bright permanent light source, great for underground illumination.</li>
                    </ul>

                    <h3>⚔️ Mobs &amp; Combat</h3>
                    <ul>
                      <li><strong>Spawning:</strong> Mobs spawn in dark areas (light level 7 or below) and always outdoors at night. Keep your base lit with torches to prevent spawns.</li>
                      <li><strong>Zombies:</strong> Slow-moving, deal moderate melee damage on contact. Vulnerable to swords. Drop rotten flesh (not useful as food).</li>
                      <li><strong>Creepers:</strong> Silent until close. They inflate and hiss before exploding — destroy blocks in a radius and deal massive damage. Run sideways to escape. They drop Gunpowder.</li>
                      <li><strong>Day/Night:</strong> At dawn (06:00) most mobs naturally despawn. At dusk (18:00) mobs begin spawning. Build a shelter or light your area before nightfall.</li>
                      <li><strong>Combat tip:</strong> A diamond sword + full health lets you survive 2–3 creeper explosions. Keep a sword in slot 1 as your primary weapon.</li>
                    </ul>

                    <h3>🌍 World &amp; Terrain</h3>
                    <ul>
                      <li>The world is procedurally generated and infinite in the X/Z directions. Height is capped at 48 blocks.</li>
                      <li><strong>Biomes:</strong> Grassland (default), beaches near water, and underground cave systems. Terrain height varies using noise functions.</li>
                      <li><strong>Ores:</strong> Found underground in stone. Coal and Iron are common near the surface. Gold and Diamond are rarer and only generate below Y=8 and Y=16 respectively.</li>
                      <li><strong>Caves:</strong> Hollow underground spaces carved into stone. Great for ore hunting but dangerous without torches — mobs spawn in cave darkness.</li>
                      <li><strong>Water:</strong> Fills ocean-level areas. Slows movement. Swimming into the void (Y&lt;0) kills you instantly.</li>
                      <li><strong>Coordinates:</strong> Displayed top-right: <em>X Z Y</em>. X/Z are horizontal, Y is height. Y=0 is the ocean floor. Y=20–30 is typical surface level.</li>
                    </ul>

                    <h3>🏆 Achievements</h3>
                    <ul>
                      <li><strong>First Journey:</strong> Walk 100+ blocks from your spawn.</li>
                      <li><strong>Timber!</strong> Mine 5+ wood log blocks.</li>
                      <li><strong>Subterranean Miner:</strong> Mine 5+ ore blocks (Coal, Iron, Gold, Diamond).</li>
                      <li><strong>Humble Farmer:</strong> Till grass or dirt into Farmland using a Hoe.</li>
                      <li>More achievements unlock as you explore and build. Check the Lobby Dashboard for your full achievement list.</li>
                    </ul>

                    <h3>☁️ Cloud Saving &amp; Multiplayer</h3>
                    <ul>
                      <li>Your world saves automatically — inventory, chest contents, furnace queues, block edits, coordinates, and achievements all persist.</li>
                      <li>Saves sync to your Firestore cloud profile on login. Multi-device play is supported.</li>
                      <li>If you have unsaved local progress and a newer cloud save exists, Voxel will prompt you to choose which save to keep at login.</li>
                      <li>You can also manually save at any time from the Lobby Dashboard.</li>
                    </ul>

                    <h3>💡 Pro Tips</h3>
                    <ul>
                      <li>Always carry at least 64 Cobblestone as building material — it's everywhere underground.</li>
                      <li>Build a Chest room early and organize by category: ores, food, building blocks, tools.</li>
                      <li>Light up caves as you mine them — torches prevent mobs from respawning in cleared areas.</li>
                      <li>Diamond armor and tools dramatically change your survivability. Prioritize reaching Y&lt;8 for diamond ore.</li>
                      <li>Ladders on the inside of a 1×1 shaft let you climb straight down safely — much faster than a spiral staircase.</li>
                      <li>Sleep through the night by pressing <span className="m-key">Esc</span> and letting the day cycle fast-forward, or just survive with torches and a sword.</li>
                    </ul>

                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chest Screen */}
          {uiState.chestOpen && (
            <ChestScreen
              activeChestCoords={uiState.activeChestCoords}
              onClose={handleCloseChest}
              scheduleSave={scheduleSave}
            />
          )}

          {/* Furnace Screen */}
          {uiState.furnaceOpen && (
            <FurnaceScreen
              activeFurnaceCoords={uiState.activeFurnaceCoords}
              onClose={handleCloseFurnace}
              scheduleSave={scheduleSave}
            />
          )}

          {/* Death Screen */}
          {player.dead && (
            <div className="death" style={{ display: 'flex' }}>
              <div className="death-card">
                <h1>You Died</h1>
                <p id="deathCause">{deathCause}</p>
                <button id="respawnBtn" onClick={() => { respawnPlayer(); forceUpdate(); }}>Respawn</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Cloud Conflict Modal */}
      {conflictData && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-card">
            <div className="modal-icon">☁️</div>
            <h2>Cloud Save Found</h2>
            <p style={{ marginBottom: '12px', fontSize: '12px', lineHeight: '1.6', color: '#d8caae' }}>
              We found an existing cloud save, but you also have local progress on this device.
            </p>
            <p style={{ marginBottom: '16px', fontSize: '11px', color: 'var(--gold)' }}>Which save would you like to keep?</p>
            <div className="modal-buttons" style={{ flexDirection: 'column', gap: '8px' }}>
              <button className="modal-btn danger"
                style={{ background: 'var(--gold-bright)', color: 'var(--ink)', width: '100%', border: 'none' }}
                onClick={() => handleResolveConflict(true)}>
                Use Cloud Save (Overwrites local progress)
              </button>
              <button className="modal-btn cancel" style={{ width: '100%' }}
                onClick={() => handleResolveConflict(false)}>
                Use Local Save (Overwrites cloud progress)
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Achievement Unlock Popup */}
      {activeAchievementNotification && (
        <div className="achievement-popup">
          <span className="badge">🏆</span>
          <div style={{ textAlign: 'left' }}>
            <h4>Achievement Unlocked!</h4>
            <p style={{ margin: '2px 0 0 0', color: '#c8b896', fontSize: '9px' }}>
              <strong>{activeAchievementNotification.name}</strong> - {activeAchievementNotification.desc}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
