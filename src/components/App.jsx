import React, { useState, useEffect } from 'react';
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
  lastAuthStatus, lastSyncConflict
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
      setCoordsStr(`${Math.floor(player.pos.x)} ${Math.floor(player.pos.y)} ${Math.floor(player.pos.z)}`);
      const rawTime = game.timeOfDay * 24;
      const hh = Math.floor(rawTime).toString().padStart(2, '0');
      const mm = Math.floor((rawTime % 1) * 60).toString().padStart(2, '0');
      setClockStr(`${hh}:${mm}`);
      const target = window.__targetBlockId;
      setTargetBlockName(target > 0 ? thingName(target).toUpperCase() : null);
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

  const filteredRecipes = RECIPES.filter(r =>
    thingName(r.out).toLowerCase().includes(recipeFilter.toLowerCase())
  );

  const filteredBlocks = Object.keys(BLOCKS)
    .map(Number)
    .filter(id => BLOCKS[id].name.toLowerCase().includes(blockFilter.toLowerCase()));

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

                {craftTab === 'recipes' && (
                  <div className="craft-body" style={{ maxHeight: '280px', overflowY: 'auto', gap: '20px', padding: '10px 0' }}>
                    {/* Crafting Table Recipes (left) */}
                    <div className="craft-col" style={{ flex: 1.2 }}>
                      <div className="craft-label" style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '8px' }}>🔨 Crafting Table Recipes</div>
                      <div className="recipe-list" style={{ maxHeight: '230px', overflowY: 'auto', paddingRight: '4px' }}>
                        {RECIPES.map((recipe, i) => (
                          <div key={i} className="recipe-row" style={{ opacity: 1, cursor: 'default', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--slot-line)', borderRadius: '4px', padding: '6px', marginBottom: '4px', display: 'flex', alignItems: 'center', minHeight: '44px' }}>
                            <div className="r-swatch-container" style={{ width: '28px', height: '28px', display: 'grid', placeItems: 'center' }}><Swatch3D id={recipe.out} /></div>
                            <div style={{ flex: 1, paddingLeft: '10px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff' }}>
                                {thingName(recipe.out)}{recipe.qty > 1 ? ` ×${recipe.qty}` : ''}
                              </div>
                              <div style={{ fontSize: '8px', color: '#9a8a76', lineHeight: 1.2 }}>{recipe.label}</div>
                              <div style={{ fontSize: '8px', color: 'var(--gold)', marginTop: '2px', fontWeight: 600 }}>
                                Req: {Object.keys(recipe.in).map(reqId => `${recipe.in[reqId]}x ${thingName(Number(reqId))}`).join(', ')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Smelting Recipes (right) */}
                    <div className="craft-col" style={{ flex: 1 }}>
                      <div className="craft-label" style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '8px' }}>🔥 Furnace Smelting Guide</div>
                      <div className="recipe-list" style={{ maxHeight: '230px', overflowY: 'auto', paddingRight: '4px' }}>
                        {[
                          { inId: 12, outId: 102, desc: "Smelts Iron Ore into Iron Ingots" },
                          { inId: 13, outId: 103, desc: "Smelts Gold Ore into Gold Ingots" },
                          { inId: 14, outId: 104, desc: "Smelts Diamond Ore into Diamonds" },
                          { inId: 4, outId: 9, desc: "Smelts Sand blocks into Glass blocks" },
                          { inId: 15, outId: 3, desc: "Smelts Cobblestone into Stone blocks" },
                          { inId: 3, outId: 40, desc: "Smelts Stone into Smooth Stone blocks" },
                          { inId: 23, outId: 120, desc: "Smelts Oak Wood logs into Charcoal fuel" },
                          { inId: 28, outId: 36, desc: "Smelts Clay blocks into Terracotta blocks" },
                          { inId: 133, outId: 134, desc: "Smelts raw meat into Cooked Meat food" }
                        ].map((s, idx) => (
                          <div key={idx} className="recipe-row" style={{ opacity: 1, cursor: 'default', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--slot-line)', borderRadius: '4px', padding: '6px', marginBottom: '4px', display: 'flex', alignItems: 'center', minHeight: '44px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              <Swatch3D id={s.inId} />
                              <span style={{ color: 'var(--gold)', fontSize: '8px', fontWeight: 'bold' }}>➔</span>
                              <Swatch3D id={s.outId} />
                            </div>
                            <div style={{ flex: 1, paddingLeft: '10px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff' }}>
                                {thingName(s.outId)}
                              </div>
                              <div style={{ fontSize: '8px', color: '#9a8a76', lineHeight: 1.2 }}>{s.desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {craftTab === 'manual' && (
                  <div className="manual-body" style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '6px' }}>
                    <h3>Welcome to Voxel</h3>
                    <p>Mine resources, craft tools, build structures, customize your avatar, and survive the monsters of the night. Your progress saves to the cloud automatically.</p>
                    
                    <h3>Controls &amp; Hotkeys</h3>
                    <ul>
                      <li><span className="m-key">W A S D</span> move &nbsp; <span className="m-key">Space</span> jump &nbsp; <span className="m-key">Shift</span> sprint</li>
                      <li><span className="m-key">Left-click</span> mine blocks / attack mobs</li>
                      <li><span className="m-key">Right-click</span> place blocks / open chests &amp; furnaces</li>
                      <li><span className="m-key">1–8</span> select active hotbar slot &nbsp; <span className="m-key">Scroll Wheel</span> cycle hotbar</li>
                      <li><span className="m-key">E</span> open &amp; close crafting / containers</li>
                      <li><span className="m-key">Q</span> eat food held in hand</li>
                      <li><span className="m-key">F</span> toggle flying (Creative mode only)</li>
                      <li><span className="m-key">F5</span> / <span className="m-key">H</span> cycle camera (First Person ➔ Third Person Back ➔ Front)</li>
                      <li><span className="m-key">Esc</span> pause game and return to Lobby Dashboard</li>
                    </ul>

                    <h3>Health &amp; Hunger</h3>
                    <ul>
                      <li><strong>Damage:</strong> Falling from heights (over 3.5 blocks), drowning under water, falling into the void, or getting hit by zombies/creepers reduces health hearts.</li>
                      <li><strong>Starvation:</strong> Running out of hunger pips causes starvation damage. Sprinting depletes hunger faster.</li>
                      <li><strong>Regeneration:</strong> When your hunger is at 16 pips or higher, your health will automatically regenerate over time.</li>
                      <li><strong>Food:</strong> Hold food (e.g. Cooked Meat) in your hand slot and press <kbd>Q</kbd> to eat.</li>
                    </ul>

                    <h3>Chests &amp; Furnaces</h3>
                    <ul>
                      <li><strong>Chests (8 planks):</strong> Place and right-click to open. Click items in your inventory to store them, or click items inside the chest to retrieve them. Breaking a chest drops all stored contents.</li>
                      <li><strong>Furnaces (8 cobble):</strong> Place and right-click to smelt ores. Place smeltable ores (Iron Ore, Gold Ore) in the top slot, and combustible fuel (Coal, Log, Planks) in the bottom slot. Output appears on the right once smelted.</li>
                    </ul>

                    <h3>Monsters &amp; Threats</h3>
                    <ul>
                      <li>Zombies and Creepers spawn in dark areas and during the night cycle.</li>
                      <li><strong>Zombies:</strong> Slow but dangerous in melee range. Deals damage on contact.</li>
                      <li><strong>Creepers:</strong> Quietly sneaks up behind you. Creepers will <strong>hiss and inflate</strong> when close — run away immediately before they detonate and destroy blocks!</li>
                    </ul>

                    <h3>Cloud Saving &amp; Lobby</h3>
                    <ul>
                      <li>Your inventory, chest positions, furnace queues, placements, and coordinates save automatically to local storage and sync to your Firestore cloud profile.</li>
                      <li>If you play on multiple devices, Voxel will automatically detect cloud conflicts on login and prompt you to choose which save state to keep.</li>
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
    </>
  );
}
