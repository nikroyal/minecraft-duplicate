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
import CraftingScreen from './CraftingScreen.jsx';
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

    let lastCoords = '', lastClock = '', lastTarget = null, lastFpsVal = 0;

    reactBridge.updateUI = () => {
      forceUpdate();
      const px = player?.pos ? Math.floor(player.pos.x) : 0;
      const py = player?.pos ? Math.floor(player.pos.y) : 0;
      const pz = player?.pos ? Math.floor(player.pos.z) : 0;
      const newCoords = `${px} ${py} ${pz}`;
      if (newCoords !== lastCoords) { lastCoords = newCoords; setCoordsStr(newCoords); }

      const timeVal = typeof game?.timeOfDay === 'number' && !isNaN(game.timeOfDay) ? game.timeOfDay : 0.3;
      const rawTime = (timeVal * 24) % 24;
      const hh = Math.floor(rawTime).toString().padStart(2, '0');
      const mm = Math.floor((rawTime % 1) * 60).toString().padStart(2, '0');
      const newClock = `${hh}:${mm}`;
      if (newClock !== lastClock) { lastClock = newClock; setClockStr(newClock); }

      const target = window.__targetBlockId;
      const name = target > 0 ? thingName(target) : null;
      const newTarget = name ? String(name).toUpperCase() : null;
      if (newTarget !== lastTarget) { lastTarget = newTarget; setTargetBlockName(newTarget); }

      const currentFps = game.fps || 60;
      if (currentFps !== lastFpsVal) { lastFpsVal = currentFps; setFps(currentFps); }
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

          {/* ── Crafting Screen (new grid-based) ── */}
          {uiState.craftOpen && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 35,
              display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center',
              background: 'rgba(6,4,3,0.85)', backdropFilter: 'blur(6px)',
              padding: '20px 12px',
              gap: 18,
              overflowY: 'auto',
            }}>
              {/* Left: Crafting Grid (standalone, full component) */}
              <div style={{ flex: '0 0 auto' }}>
                <CraftingScreen onClose={closeCraft} />
              </div>

              {/* Right: Reference Panel */}
              <div style={{
                flex: '1 1 340px', maxWidth: 380, minWidth: 280,
                background: 'rgba(20,15,10,0.97)',
                border: '1px solid rgba(214,178,120,0.3)',
                borderRadius: 10,
                boxShadow: '0 20px 80px rgba(0,0,0,0.7)',
                display: 'flex', flexDirection: 'column',
                maxHeight: 'calc(90vh - 0px)',
                overflow: 'hidden',
              }}>
                {/* Tabs header */}
                <div style={{
                  display: 'flex', borderBottom: '1px solid rgba(214,178,120,0.2)',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '6px 10px 0',
                  gap: 2,
                }}>
                  {['blocks','recipes','manual'].map(tab => (
                    <button key={tab}
                      onClick={() => setCraftTab(tab)}
                      style={{
                        fontFamily: 'inherit', fontSize: 10, letterSpacing: 1,
                        color: craftTab === tab ? '#1a1410' : '#d6b278',
                        background: craftTab === tab ? '#f2d9a0' : 'transparent',
                        border: 'none', borderRadius: '4px 4px 0 0',
                        padding: '6px 12px', cursor: 'pointer',
                        fontWeight: craftTab === tab ? 700 : 400,
                      }}>
                      {tab === 'blocks' ? '📚 Blocks' : tab === 'recipes' ? '📜 Recipes' : '📖 Manual'}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

                  {/* ── Encyclopedia tab ── */}
                  {craftTab === 'blocks' && (
                    <div>
                      <input type="text" value={blockFilter} onChange={e => setBlockFilter(e.target.value)}
                        placeholder="Search blocks…" className="recipe-search"
                        style={{ background: 'var(--ink)', width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
                      <div className="block-list">
                        {filteredBlocks.map(id => (
                          <div key={id} className="block-row">
                            <div className="b-swatch-container"><Swatch3D id={id} /></div>
                            <div style={{ flex: 1, paddingLeft: '10px', fontSize: '10px' }}>
                              <div style={{ fontWeight: 'bold', color: '#fff' }}>{BLOCKS[id].name}</div>
                              <div style={{ color: 'var(--gold)', fontSize: '8px' }}>
                                {BLOCKS[id].solid ? 'Solid' : 'Non-Solid'} · Hard: {BLOCKS[id].hardness} · ID: {id}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Recipes reference tab ── */}
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <input type="text" value={recipesTabFilter} onChange={e => setRecipesTabFilter(e.target.value)}
                          placeholder="Search recipes & smelting…" className="recipe-search"
                          style={{ background: 'var(--ink)', width: '100%', boxSizing: 'border-box' }} />

                        <div style={{ fontSize: 10, fontWeight: 700, color: '#d6b278', letterSpacing: 1, textTransform: 'uppercase' }}>🔨 Crafting ({filtCraft.length})</div>
                        <div className="recipe-list" style={{ gap: 4 }}>
                          {filtCraft.map((recipe, i) => (
                            <div key={i} className="recipe-row" style={{ opacity: 1, cursor: 'default', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--slot-line)', borderRadius: 4, padding: '5px 8px', display: 'flex', alignItems: 'center', minHeight: 38 }}>
                              <div style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Swatch3D id={recipe.out} /></div>
                              <div style={{ flex: 1, paddingLeft: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{thingName(recipe.out)}{recipe.qty > 1 ? ` ×${recipe.qty}` : ''}</div>
                                <div style={{ fontSize: 8, color: 'var(--gold)', marginTop: 1 }}>{Object.keys(recipe.in).map(reqId => `${recipe.in[reqId]}× ${thingName(Number(reqId))}`).join(', ')}</div>
                              </div>
                            </div>
                          ))}
                          {filtCraft.length === 0 && <div style={{ fontSize: 9, color: '#888', padding: 8 }}>No crafting recipes match.</div>}
                        </div>

                        <div style={{ fontSize: 10, fontWeight: 700, color: '#d6b278', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 }}>🔥 Smelting ({filtSmelt.length})</div>
                        <div className="recipe-list" style={{ gap: 4 }}>
                          {filtSmelt.map((s, idx) => (
                            <div key={idx} className="recipe-row" style={{ opacity: 1, cursor: 'default', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--slot-line)', borderRadius: 4, padding: '5px 8px', display: 'flex', alignItems: 'center', minHeight: 38 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <Swatch3D id={s.inId} />
                                <span style={{ color: 'var(--gold)', fontSize: 10, fontWeight: 'bold' }}>→</span>
                                <Swatch3D id={s.outId} />
                              </div>
                              <div style={{ flex: 1, paddingLeft: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{thingName(s.outId)}</div>
                                <div style={{ fontSize: 8, color: '#9a8a76' }}>{s.desc}</div>
                              </div>
                            </div>
                          ))}
                          {filtSmelt.length === 0 && <div style={{ fontSize: 9, color: '#888', padding: 8 }}>No smelting recipes match.</div>}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Manual tab ── */}
                  {craftTab === 'manual' && (
                    <div className="manual-body" style={{ padding: 0 }}>
                      <h3>🎮 Welcome to Voxel</h3>
                      <p>Mine resources, craft tools &amp; weapons, build structures, farm crops, cook in furnaces, manage health and hunger, and survive hostile mobs through the night in an infinitely expandable voxel world.</p>
                      
                      <h3>⌨️ Controls &amp; Shortcuts</h3>
                      <ul>
                        <li><span className="m-key">W A S D</span> Move &nbsp;|&nbsp; <span className="m-key">Space</span> Jump &nbsp;|&nbsp; <span className="m-key">Ctrl / Shift</span> Sprint</li>
                        <li><span className="m-key">Left-click</span> Mine block / attack mob (hold to break)</li>
                        <li><span className="m-key">Right-click</span> Place block / interact (Chest, Furnace, Bed, TNT, Hoe, Seeds)</li>
                        <li><span className="m-key">1–8</span> Select Hotbar Slot &nbsp;|&nbsp; <span className="m-key">Scroll Wheel</span> Cycle Hotbar</li>
                        <li><span className="m-key">E</span> Open / Close Handbook (Inventory &amp; Crafting)</li>
                        <li><span className="m-key">Q</span> Drop 1 held item (or eat food when holding food)</li>
                        <li><span className="m-key">F</span> Toggle Creative Flying</li>
                        <li><span className="m-key">F3</span> Toggle 3D Physics Debug Overlay &amp; Telemetry</li>
                        <li><span className="m-key">F5 / H</span> Cycle Camera View (First-Person, Third-Person Back, Third-Person Front)</li>
                        <li><span className="m-key">Esc</span> Pause / Open Main Menu / Release Pointer Lock</li>
                      </ul>

                      <h3>🏃 Movement &amp; Jump Mechanics</h3>
                      <ul>
                        <li><strong>Ground &amp; Step-Up:</strong> Smoothly step up 0.5-block slabs, carpets, trapdoors, and 1-block steps while walking grounded.</li>
                        <li><strong>Jump Buffering:</strong> Pressing <span className="m-key">Space</span> up to 150ms before touching the ground automatically triggers an instant jump upon landing.</li>
                        <li><strong>Coyote Timer:</strong> Allows jumping up to 120ms after walking off ledges or block edges.</li>
                        <li><strong>Fluid Swimming:</strong> Hold <span className="m-key">Space</span> to swim up. Leaping out of water at the surface gives a boost to land on adjacent terrain.</li>
                        <li><strong>Underwater Interaction:</strong> Full support for underwater mining and placing blocks into water voxels.</li>
                      </ul>

                      <h3>❤️ Health, Hunger &amp; Survival</h3>
                      <ul>
                        <li><strong>Health (20 HP / 10 Hearts):</strong> Damage taken from fall (3.5+ blocks), drowning, void, zombies, creepers, or starvation.</li>
                        <li><strong>Hunger (20 / 10 Drumsticks):</strong> Drains over time (faster while sprinting). At 16+ HP regens over time. At 0 hunger, starvation damage occurs.</li>
                        <li><strong>Eating Food:</strong> Select food in hotbar and press <span className="m-key">Q</span> (or right-click) to restore hunger &amp; health.</li>
                      </ul>

                      <h3>⛏️ Tools &amp; Durability Tiers</h3>
                      <ul>
                        <li><strong>Pickaxe:</strong> Required for Stone, Cobblestone, Coal/Iron/Gold/Diamond Ores, Bricks, Sandstone, Obsidian.</li>
                        <li><strong>Axe:</strong> Efficiently chops Logs, Planks, Wood, Crafting Tables, Chests, Bookshelves.</li>
                        <li><strong>Shovel:</strong> Fast digging for Dirt, Grass, Sand, Gravel, Snow, Clay.</li>
                        <li><strong>Hoe:</strong> Right-click Grass or Dirt to till into Farmland for planting crops.</li>
                        <li><strong>Tool Tiers:</strong> Wood (30 durability) &rarr; Stone (60) &rarr; Iron (150) &rarr; Diamond (500). Higher tiers mine faster and unlock higher-grade ores.</li>
                      </ul>

                      <h3>🔥 Smelting &amp; Cooking (Furnace)</h3>
                      <ul>
                        <li>Right-click a placed <strong>Furnace</strong> to open the smelting interface.</li>
                        <li><strong>Top Input Slot:</strong> Raw Iron Ore, Gold Ore, Sand (smelts into Glass), Clay (smelts into Terracotta).</li>
                        <li><strong>Bottom Fuel Slot:</strong> Coal, Charcoal, Wood Logs, or Planks.</li>
                        <li>smelting progress bar runs automatically and outputs refined ingots/materials.</li>
                      </ul>

                      <h3>🌾 Farming &amp; Agriculture</h3>
                      <ul>
                        <li>Right-click Grass/Dirt with a <strong>Hoe</strong> to create Farmland (ID 89).</li>
                        <li>Right-click Farmland with <strong>Wheat Seeds</strong> (ID 138) to plant crops.</li>
                        <li>Watch crops grow through growth stages &rarr; Harvest ripe wheat &rarr; Craft 3 Wheat into 1 Bread!</li>
                      </ul>

                      <h3>🏹 Combat, Weapons &amp; TNT</h3>
                      <ul>
                        <li><strong>Swords:</strong> High melee damage for fighting zombies &amp; creepers.</li>
                        <li><strong>Bow &amp; Arrows:</strong> Craft Bow (146) and Arrows (147). Right-click to fire high-velocity physics arrows!</li>
                        <li><strong>TNT Explosions:</strong> Place TNT (56) and right-click to ignite. Primed TNT pulses and flashes white for 3s before triggering a 4-block radius terrain explosion.</li>
                      </ul>

                      <h3>🛌 Bed &amp; Passing the Night</h3>
                      <ul>
                        <li>Right-click a placed <strong>Bed</strong> (57) at night to pass the night instantly to dawn, restore HP/hunger, and update your respawn point.</li>
                      </ul>

                      <h3>🌊 Modern Shader Water</h3>
                      <ul>
                        <li>Features procedural animated wave scrolling, dual-layer normal map ripples, Schlick Fresnel reflections, specular sun glints, and depth-based color transitions from vibrant turquoise shallow water to deep blue oceans.</li>
                      </ul>

                      <h3>🛠️ Debug &amp; Telemetry (F3)</h3>
                      <ul>
                        <li>Press <span className="m-key">F3</span> to toggle 3D AABB wireframe player boxes, collision contact highlights, ground normal indicators, and live telemetry for position, velocity, and camera sync.</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Chest Screen */}
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
