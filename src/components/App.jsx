import React, { useState, useEffect, useMemo } from 'react';
import { player, game, world, inventory, hotbar, reactBridge } from '../state.js';
import { getBlock } from '../world.js';
import { isSolid } from '../config.js';
import { respawnPlayer, invCount, addItem } from '../player.js';
import { resolveSyncConflict, subscribeToUserDoc, subscribeToWorldSettings, updateUserDocInFirestore } from '../firebase.js';
import { thingName, BLOCKS, RECIPES, isPlaceable } from '../config.js';
import { initAudio } from '../audio.js';

import Swatch3D from './Swatch3D.jsx';
import AuthCard from './AuthCard.jsx';
import LobbyCard from './LobbyCard.jsx';
import HUDOverlay from './HUDOverlay.jsx';
import ChestScreen from './ChestScreen.jsx';
import FurnaceScreen from './FurnaceScreen.jsx';
import CraftingScreen from './CraftingScreen.jsx';
import MasterDashboardCard from './MasterDashboardCard.jsx';
import { 
  uiState, setChestOpen, setFurnaceOpen, setActiveChestCoords, setActiveFurnaceCoords,
  closeCraft, closeChest, closeFurnace, scheduleSave, craft, updateLobbyAvatarPreview, toast, deathCause,
  lastAuthStatus, lastSyncConflict, activeAchievementNotification
} from '../ui.js';

export default function App() {
  const [tick, setTick] = useState(0);

  // Auth
  const [authStatus, setAuthStatus] = useState('connecting');
  const [syncMsg, setSyncMsg] = useState('Connecting to Firebase...');
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('player');
  const [conflictData, setConflictData] = useState(null);

  // Messages & Broadcasts
  const [userMessages, setUserMessages] = useState([]);
  const [latestBroadcastBanner, setLatestBroadcastBanner] = useState(null);

  // Check if current user is a Master Admin Account (strictly based on Firestore document 'role' field)
  const isMasterAccount = userRole === 'admin' || userRole === 'master';

  // HUD
  const [fps, setFps] = useState(60);
  const [coordsStr, setCoordsStr] = useState('0, 0, 0');
  const [clockStr, setClockStr] = useState('--:--');
  const [targetBlockName, setTargetBlockName] = useState(null);

  // Crafting
  const [craftTab, setCraftTab] = useState('blocks');
  const [recipeFilter, setRecipeFilter] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [recipesTabFilter, setRecipesTabFilter] = useState('');

  // Force re-render helper used from game loop
  const forceUpdate = () => setTick(t => t + 1);

  // ── Real-Time Admin Subscriptions (World Settings & User Document) ──
  useEffect(() => {
    // 1. Subscribe to World Settings (Time of Day, Weather, Global Broadcasts)
    const unsubWorld = subscribeToWorldSettings((worldData) => {
      if (!worldData) return;
      if (typeof worldData.timeOfDay === 'number') {
        game.timeOfDay = worldData.timeOfDay / 24000;
      }
      if (typeof worldData.timeFrozen === 'boolean') {
        game.timeFrozen = worldData.timeFrozen;
      }
      if (worldData.latestBroadcast && worldData.latestBroadcast.id) {
        setLatestBroadcastBanner(worldData.latestBroadcast);
        toast(`📢 ${worldData.latestBroadcast.sender}: ${worldData.latestBroadcast.text}`);
      }
    });

    return () => unsubWorld();
  }, []);

  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;

    // 2. Subscribe to User Document (Freeze, Teleport, Give Items, Heal, Messages)
    const unsubUser = subscribeToUserDoc(currentUser.uid, (userData) => {
      if (!userData) return;

      // Frozen status
      player.frozen = Boolean(userData.frozen);

      // Messages
      if (Array.isArray(userData.messages)) {
        setUserMessages(userData.messages);
      }

      // Teleport signal
      if (userData.teleportTarget) {
        const { x, y, z } = userData.teleportTarget;
        player.pos.set(x, y, z);
        player.vel.set(0, 0, 0);
        toast(`📍 Teleported by Admin to (${x}, ${y}, ${z})`);
        updateUserDocInFirestore(currentUser.uid, { teleportTarget: null });
      }

      // Item additions (Gift items)
      if (Array.isArray(userData.inventoryAdditions) && userData.inventoryAdditions.length > 0) {
        userData.inventoryAdditions.forEach(item => {
          if (item && item.id) {
            addItem(item.id, item.count || 1);
            toast(`🎁 Admin gave you ${item.count || 1}× ${thingName(item.id)}!`);
          }
        });
        updateUserDocInFirestore(currentUser.uid, { inventoryAdditions: null });
      }

      // Health restore
      if (typeof userData.healthOverride === 'number') {
        player.hp = Math.min(20, userData.healthOverride);
        player.dead = false;
        toast(`❤️ Health restored to 20 HP by Admin!`);
        updateUserDocInFirestore(currentUser.uid, { healthOverride: null });
      }
    });

    return () => unsubUser();
  }, [currentUser]);

  useEffect(() => {
    window.__onStatusChange = (status) => {
      if (status.state === 'connecting') {
        setAuthStatus('connecting'); setSyncMsg(status.message);
      } else if (status.state === 'unconfigured') {
        setAuthStatus('unconfigured'); setSyncMsg(status.message);
        setCurrentUser({ email: 'Offline Mode' });
        setUserRole('player');
      } else if (status.state === 'logged_in') {
        setAuthStatus('logged_in'); setSyncMsg(status.message);
        setCurrentUser(status.user);
        setUserRole(status.role || 'player');
        window.__currentUserEmail = status.user.email;
      } else if (status.state === 'logged_out') {
        setAuthStatus('logged_out'); setSyncMsg(status.message);
        setCurrentUser(null);
        setUserRole('player');
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
    closeChest();
  };

  const handleCloseFurnace = () => {
    closeFurnace();
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
  const showLobby = showOverlay && (authStatus === 'logged_in' || authStatus === 'unconfigured') && !isMasterAccount;
  const showMaster = showOverlay && authStatus === 'logged_in' && isMasterAccount;
  const showPaused = game.running && game.paused && !uiState.craftOpen && !uiState.chestOpen && !uiState.furnaceOpen;

  return (
    <>
      {/* AUTH / LOBBY / MASTER OVERLAY */}
      {showOverlay && (
        <div id="overlay">
          {showAuth && <AuthCard />}
          {showMaster && (
            <MasterDashboardCard userEmail={currentUser?.email || 'Master Admin'} />
          )}
          {showLobby && (
            <LobbyCard
              userEmail={currentUser?.email || 'Offline Player'}
              syncStatus={syncMsg}
              scheduleSave={scheduleSave}
              onStartGame={() => {
                game.running = true;
                game.paused = false;
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

      {/* PAUSE OVERLAY — shown when Escape/focus loss exits pointer lock mid-game */}
      {showPaused && (
        <div
          onClick={() => {
            game.paused = false;
            try {
              const promise = document.getElementById('game')?.requestPointerLock();
              if (promise && typeof promise.catch === 'function') promise.catch(() => {});
            } catch(e){}
            forceUpdate();
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(20,15,10,0.97)',
              border: '2px solid rgba(214,178,120,0.45)',
              borderRadius: 14,
              padding: '36px 52px',
              textAlign: 'center',
              boxShadow: '0 25px 90px rgba(0,0,0,0.9), 0 0 30px rgba(214,178,120,0.1)',
              maxWidth: 420,
              width: '90vw',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 6 }}>⏸</div>
            <div style={{ color: '#f5d77f', fontSize: 24, fontWeight: 800, letterSpacing: 3, marginBottom: 6 }}>
              GAME PAUSED
            </div>
            <div style={{ color: '#a89060', fontSize: 12, letterSpacing: 1, marginBottom: 20 }}>
              Session paused • Click button or canvas to resume
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => {
                  game.paused = false;
                  try {
                    const promise = document.getElementById('game')?.requestPointerLock();
                    if (promise && typeof promise.catch === 'function') promise.catch(() => {});
                  } catch(e){}
                  forceUpdate();
                }}
                style={{
                  background: 'rgba(214,178,120,0.2)',
                  border: '1px solid rgba(214,178,120,0.6)',
                  color: '#f5d77f',
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: 1,
                  transition: 'all 0.2s',
                }}
              >
                ▶ RESUME GAME
              </button>

              <button
                onClick={() => {
                  game.running = false;
                  game.paused = false;
                  if (document.pointerLockElement) document.exitPointerLock();
                  forceUpdate();
                }}
                style={{
                  background: 'rgba(180,50,50,0.25)',
                  border: '1px solid rgba(220,70,70,0.5)',
                  color: '#ff9999',
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: 1,
                  transition: 'all 0.2s',
                }}
              >
                🏠 EXIT TO HOME SCREEN
              </button>
            </div>

            <div style={{ color: '#786040', fontSize: 10, marginTop: 18, lineHeight: 1.5 }}>
              💡 Press <span style={{ color: '#d6b278', border: '1px solid #786040', padding: '1px 5px', borderRadius: 3 }}>Esc</span> twice to exit to Home Screen • Press <span style={{ color: '#d6b278', border: '1px solid #786040', padding: '1px 5px', borderRadius: 3 }}>E</span> for Handbook
            </div>
          </div>
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
        </>
      )}

      {/* CHEST MODAL */}
      {uiState.chestOpen && (
        <ChestScreen
          coordsStr={uiState.activeChestCoords}
          onClose={handleCloseChest}
        />
      )}

      {/* FURNACE MODAL */}
      {uiState.furnaceOpen && (
        <FurnaceScreen
          coordsStr={uiState.activeFurnaceCoords}
          onClose={handleCloseFurnace}
        />
      )}

      {/* CRAFTING & HANDBOOK MODAL */}
      {uiState.craftOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)',
        }}>
          <div style={{
            display: 'flex', gap: 14,
            width: 'min(1100px, 96vw)',
            height: 'min(640px, 90vh)',
          }}>
            {/* Main Crafting Window */}
            <CraftingScreen onClose={closeCraft} />

            {/* Side Reference Panel */}
            <div style={{
              width: 380,
              background: 'rgba(20,15,10,0.97)',
              border: '1px solid rgba(214,178,120,0.35)',
              borderRadius: 10,
              boxShadow: '0 20px 80px rgba(0,0,0,0.8)',
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
                {['blocks','recipes','manual','messages'].map(tab => (
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
                    {tab === 'blocks' ? '📚 Blocks' : tab === 'recipes' ? '📜 Recipes' : tab === 'manual' ? '📖 Manual' : `✉️ Messages (${userMessages.length})`}
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
                              <div style={{ fontSize: 8, color: 'var(--gold-dim)' }}>
                                {Object.entries(recipe.in).map(([inId, qty]) => `${thingName(Number(inId))} ×${qty}`).join(', ')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize: 10, fontWeight: 700, color: '#d6b278', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 }}>🔥 Smelting ({filtSmelt.length})</div>
                      <div className="recipe-list" style={{ gap: 4 }}>
                        {filtSmelt.map((smelt, i) => (
                          <div key={i} className="recipe-row" style={{ opacity: 1, cursor: 'default', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--slot-line)', borderRadius: 4, padding: '5px 8px', display: 'flex', alignItems: 'center', minHeight: 38 }}>
                            <div style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Swatch3D id={smelt.outId} /></div>
                            <div style={{ flex: 1, paddingLeft: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{thingName(smelt.outId)}</div>
                              <div style={{ fontSize: 8, color: 'var(--gold-dim)' }}>Input: {thingName(smelt.inId)} + Fuel (Coal/Logs)</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Comprehensive Official Game Manual ── */}
                {craftTab === 'manual' && (
                  <div className="manual-body" style={{ padding: 0 }}>
                    <h3>🎮 Welcome to Voxel</h3>
                    <p>Mine resources, craft tools &amp; weapons, build structures, farm crops, cook in furnaces, manage health and hunger, and survive hostile mobs through the night in an infinitely expandable voxel world.</p>
                    
                    <h3>⌨️ Key Bindings &amp; Navigation</h3>
                    <ul>
                      <li><span className="m-key">W A S D</span> Move &nbsp;|&nbsp; <span className="m-key">Space</span> Jump &nbsp;|&nbsp; <span className="m-key">Ctrl / Shift</span> Sprint</li>
                      <li><span className="m-key">Left-click</span> Mine block / attack mob (hold left-click to break)</li>
                      <li><span className="m-key">Right-click</span> Place block / interact with Chest, Furnace, Bed, TNT, Hoe, Seeds</li>
                      <li><span className="m-key">1–8</span> Select Hotbar Slot &nbsp;|&nbsp; <span className="m-key">Scroll Wheel</span> Cycle Hotbar</li>
                      <li><span className="m-key">E</span> Open / Close Handbook (Inventory &amp; Crafting)</li>
                      <li><span className="m-key">Q</span> Drop 1 held item (or eat food when holding food)</li>
                      <li><span className="m-key">F</span> Toggle Creative Flying</li>
                      <li><span className="m-key">F3</span> Toggle 3D Physics Debug Overlay &amp; Telemetry</li>
                      <li><span className="m-key">F5 / H</span> Cycle Camera View (First-Person, Third-Person Back, Third-Person Front)</li>
                      <li><span className="m-key">Esc (Press 1x)</span> Pause session &amp; show pause menu</li>
                      <li><span className="m-key">Esc (Press 2x)</span> Exit game session &amp; return to Home Screen / Main Menu</li>
                    </ul>

                    <h3>🧲 Long-Range Item Pickup (30-Block Magnet)</h3>
                    <ul>
                      <li><strong>Instant Long-Range Magnet:</strong> Mined blocks and experience orbs feature a 30-block magnetic pickup range. Mined items fly directly to your inventory from across large caves or cliffs.</li>
                      <li><strong>Surface Placement:</strong> Dropped items land cleanly on top of block surfaces without getting stuck inside terrain geometry.</li>
                    </ul>

                    <h3>🪣 Bucket &amp; Fluid Interactions</h3>
                    <ul>
                      <li><strong>Empty Bucket (144):</strong> Right-click a water source block (8) to scoop it up into a Water Bucket (145).</li>
                      <li><strong>Water Bucket (145):</strong> Right-click air or flowing water to place a water source block (8), returning an Empty Bucket.</li>
                    </ul>

                    <h3>🧰 Editable Hotbar &amp; Inventory Management</h3>
                    <ul>
                      <li>Click any item in your inventory to pick it up, then click a Hotbar slot (1–8) or Crafting Grid slot to place/swap it.</li>
                      <li>Hold an item and press number keys <span className="m-key">1–8</span> to assign it directly to that Hotbar slot.</li>
                    </ul>

                    <h3>🏃 Movement &amp; Parkour Physics</h3>
                    <ul>
                      <li><strong>Ground Step-Up:</strong> Step up 0.5-block slabs, carpets, trapdoors, and 1-block steps while walking grounded.</li>
                      <li><strong>Jump Buffering:</strong> Pressing <span className="m-key">Space</span> up to 150ms before touching the ground triggers an instant jump upon landing.</li>
                      <li><strong>Coyote Timer:</strong> Allows jumping up to 120ms after walking off ledges or block edges.</li>
                      <li><strong>Fluid Swimming:</strong> Hold <span className="m-key">Space</span> to swim up. Leaping out of water at the surface gives a boost to land on terrain.</li>
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
                      <li>Right-click a placed <strong>Furnace (42)</strong> to open the smelting interface.</li>
                      <li><strong>Top Input Slot:</strong> Raw Iron Ore, Gold Ore, Sand (smelts into Glass), Clay (smelts into Terracotta), Raw Meat.</li>
                      <li><strong>Bottom Fuel Slot:</strong> Coal, Charcoal, Wood Logs, or Planks.</li>
                      <li>Automated smelting progress bar refines inputs into pure ingots, glass, terracotta, or cooked meals.</li>
                    </ul>

                    <h3>📦 Chest Storage &amp; Cloud Sync</h3>
                    <ul>
                      <li>Right-click a placed <strong>Chest (43)</strong> to store up to 27 item slots.</li>
                      <li>World edits and chest inventories automatically save locally and sync with Firebase Firestore cloud storage.</li>
                    </ul>

                    <h3>🌾 Farming &amp; Agriculture</h3>
                    <ul>
                      <li>Right-click Grass/Dirt with a <strong>Hoe</strong> to create Farmland (89).</li>
                      <li>Right-click Farmland with <strong>Wheat Seeds</strong> (138) to plant crops.</li>
                      <li>Harvest ripe wheat &rarr; Craft 3 Wheat into 1 Bread!</li>
                    </ul>

                    <h3>🏹 Combat, Weapons &amp; TNT</h3>
                    <ul>
                      <li><strong>Swords:</strong> High melee damage for fighting zombies &amp; creepers.</li>
                      <li><strong>Bow &amp; Arrows:</strong> Craft Bow (146) and Arrows (147). Right-click to fire high-velocity physics arrows!</li>
                      <li><strong>TNT Explosions:</strong> Place TNT (56) and right-click to ignite. Primed TNT pulses for 3s before triggering a 4-block radius terrain explosion.</li>
                    </ul>

                    <h3>🛌 Bed &amp; Passing the Night</h3>
                    <ul>
                      <li>Right-click a placed <strong>Bed (57)</strong> at night to pass the night instantly to dawn, restore HP/hunger, and update your respawn point.</li>
                    </ul>
                  </div>
                )}

                {/* ── Admin Messages & Announcements Inbox ── */}
                {craftTab === 'messages' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#f5d77f', letterSpacing: 1, textTransform: 'uppercase' }}>
                      ✉️ ADMIN MESSAGES &amp; SERVER ANNOUNCEMENTS ({userMessages.length})
                    </div>
                    {userMessages.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#9a8a76', padding: '24px 0', textAlign: 'center', lineHeight: 1.6 }}>
                        No messages from server admins yet.<br/>All server-wide broadcasts and private admin messages will appear here!
                      </div>
                    ) : (
                      userMessages.map(msg => (
                        <div key={msg.id} style={{
                          background: msg.type === 'broadcast' ? 'rgba(230,180,80,0.12)' : 'rgba(40,160,220,0.12)',
                          border: msg.type === 'broadcast' ? '1px solid rgba(230,180,80,0.4)' : '1px solid rgba(40,160,220,0.4)',
                          borderRadius: 8,
                          padding: '10px 12px',
                          fontSize: 11,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{
                              fontWeight: 700,
                              color: msg.type === 'broadcast' ? '#f5d77f' : '#66ccff',
                              fontSize: 10, textTransform: 'uppercase', letterSpacing: 1
                            }}>
                              {msg.type === 'broadcast' ? "📢 SERVER BROADCAST" : "✉️ DIRECT PRIVATE MESSAGE"}
                            </span>
                            <span style={{ fontSize: 9, color: '#887766' }}>
                              {msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''}
                            </span>
                          </div>
                          <div style={{ color: '#f0e6d2', lineHeight: 1.4, margin: '4px 0' }}>
                            {msg.text}
                          </div>
                          <div style={{ fontSize: 9, color: '#a09075', marginTop: 2 }}>
                            From: <strong style={{ color: '#d6b278' }}>{msg.sender || 'Admin Server'}</strong>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
