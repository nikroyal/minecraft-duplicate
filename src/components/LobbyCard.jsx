import React, { useState, useEffect } from 'react';
import { player, game, world, inventory, SAVE_KEY, avatarCallbacks, achievements } from '../state.js';
import { Chunk, getChunk, generateChunk, getBlock } from '../world.js';
import { isSolid, keyOf } from '../config.js';
import { invCount } from '../player.js';
import { logoutUser, fetchLeaderboard, manuallySyncLocalToCloud } from '../firebase.js';
import { updateLobbyAvatarPreview } from '../ui.js';
import { initAudio } from '../audio.js';

export default function LobbyCard({ userEmail, syncStatus, onStartGame, scheduleSave }) {
  const [activeTab, setActiveTab] = useState('play');
  const [resetStep, setResetStep] = useState(null);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [leaderboardList, setLeaderboardList] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  // Avatar states
  const [avatarHead, setAvatarHead] = useState(player.avatar?.headType || 'steve');
  const [avatarShirt, setAvatarShirt] = useState(player.avatar?.shirtColor || '#008080');
  const [avatarPants, setAvatarPants] = useState(player.avatar?.pantsColor || '#3c4e8c');
  const [avatarSkin, setAvatarSkin] = useState(player.avatar?.skinColor || '#dfcfb7');

  // Trigger avatar 3D preview render whenever states change
  useEffect(() => {
    if (activeTab === 'avatar') {
      updateLobbyAvatarPreview();
    }
  }, [activeTab, avatarHead, avatarShirt, avatarPants, avatarSkin]);

  const handleAvatarChange = (field, val) => {
    player.avatar = player.avatar || {};
    if (field === 'headType') {
      player.avatar.headType = val;
      setAvatarHead(val);
    } else if (field === 'shirtColor') {
      player.avatar.shirtColor = val;
      setAvatarShirt(val);
    } else if (field === 'pantsColor') {
      player.avatar.pantsColor = val;
      setAvatarPants(val);
    } else if (field === 'skinColor') {
      player.avatar.skinColor = val;
      setAvatarSkin(val);
    }
    
    // trigger updates
    if (avatarCallbacks.update) avatarCallbacks.update();
    scheduleSave();
  };

  const handleTeleportSurface = () => {
    const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
    const cx = Math.floor(px/16), cz = Math.floor(pz/16);
    let ch = getChunk(cx,cz);
    if (!ch) { ch = new Chunk(cx,cz); world.chunks.set(keyOf(cx,cz), ch); }
    if (!ch.generated) generateChunk(ch);
    let topY = 1;
    for (let y = 48-1; y >= 0; y--) { if (isSolid(getBlock(px,y,pz))) { topY = y + 1; break; } }
    player.pos.set(px+0.5, topY+0.5, pz+0.5);
    player.vel.set(0,0,0);
    player.flying = false;
    
    initAudio();
    onStartGame();
  };

  const handleEnterWorld = () => {
    initAudio();
    onStartGame();
  };

  const handleManualSync = () => {
    setSyncLoading(true);
    manuallySyncLocalToCloud(() => {})
      .then(() => setSyncLoading(false))
      .catch(() => setSyncLoading(false));
  };

  const handleResetWorld = () => {
    localStorage.removeItem(SAVE_KEY);
    setResetStep(null);
    location.reload();
  };

  // Fetch leaderboard data when tab changes
  useEffect(() => {
    let isMounted = true;
    if (activeTab === 'leaderboard') {
      setLoadingLeaderboard(true);
      fetchLeaderboard().then(list => {
        if (isMounted) {
          setLeaderboardList(list);
          setLoadingLeaderboard(false);
        }
      }).catch(() => {
        if (isMounted) setLoadingLeaderboard(false);
      });
    }
    return () => { isMounted = false; };
  }, [activeTab]);

  // Formatted stats
  const minedBlocks = Object.values(world.edits || {}).filter(v => v === 0).length;
  const placedBlocks = Object.values(world.edits || {}).filter(v => v > 0).length;
  
  const rawTime = game.timeOfDay * 24;
  const hh = Math.floor(rawTime).toString().padStart(2, '0');
  const mm = Math.floor((rawTime % 1) * 60).toString().padStart(2, '0');

  return (
    <div className="card" id="lobbyCard" style={{ maxWidth: '680px', width: '95vw', padding: '25px 30px' }}>
      <h1>VOXEL</h1>
      <div className="tag">A TINY WORLD</div>

      {/* Navigation */}
      <div className="dashboard-tabs">
        <button id="tabPlayBtn" className={`dash-tab ${activeTab === 'play' ? 'active' : ''}`} onClick={() => setActiveTab('play')}>🎮 Play</button>
        <button id="tabStatsBtn" className={`dash-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>📊 My Stats</button>
        <button id="tabLeaderboardBtn" className={`dash-tab ${activeTab === 'leaderboard' ? 'active' : ''}`} onClick={() => setActiveTab('leaderboard')}>🥇 Leaderboard</button>
        <button id="tabAchievementsBtn" className={`dash-tab ${activeTab === 'achievements' ? 'active' : ''}`} onClick={() => setActiveTab('achievements')}>🏆 Achievements</button>
        <button id="tabAvatarBtn" className={`dash-tab ${activeTab === 'avatar' ? 'active' : ''}`} onClick={() => setActiveTab('avatar')}>👕 Avatar</button>
      </div>

      {/* Tabs panels */}
      {activeTab === 'play' && (
        <div className="dash-panel" id="dash-play">
          <div style={{ marginBottom: '18px', fontSize: '12px', color: 'var(--gold-bright)' }}>
            Welcome back, <span style={{ fontWeight: 700, color: '#fff' }}>{userEmail}</span>!
          </div>

          <div className="keys" style={{ margin: '0 0 20px 0' }}>
            <div><kbd>W A S D</kbd> move &nbsp; <kbd>Space</kbd> jump &nbsp; <kbd>Shift</kbd> sprint</div>
            <div><kbd>Mouse</kbd> look &nbsp; <kbd>Left</kbd> mine &nbsp; <kbd>Right</kbd> place</div>
            <div><kbd>1–8</kbd> select &nbsp; <kbd>E</kbd> inventory &nbsp; <kbd>Q</kbd> eat &nbsp; <kbd>F</kbd> fly &nbsp; <kbd>F5</kbd> camera &nbsp; <kbd>Esc</kbd> pause</div>
          </div>

          <button id="playBtn" onClick={handleEnterWorld}>ENTER WORLD</button>
          
          <div className="secondary-actions">
            <button className="minor-btn" onClick={handleTeleportSurface}>↑ Teleport to surface</button>
            <button className="minor-btn danger" onClick={() => setResetStep(0)}>Reset world</button>
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="dash-panel" id="dash-stats">
          <div className="stats-grid">
            <div className="stat-box">
              <div className="stat-val">{minedBlocks}</div>
              <div className="stat-lbl">Blocks Mined</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">{placedBlocks}</div>
              <div className="stat-lbl">Blocks Placed</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">{`${Math.floor(player.pos.x)}, ${Math.floor(player.pos.y)}, ${Math.floor(player.pos.z)}`}</div>
              <div className="stat-lbl">Coordinates</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">{Object.values(inventory).reduce((a, b) => a + b, 0)}</div>
              <div className="stat-lbl">Items Carried</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">{`${hh}:${mm}`}</div>
              <div className="stat-lbl">World Time</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">{`❤️ ${player.health} / 🍗 ${player.hunger}`}</div>
              <div className="stat-lbl">Survival Stats</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div className="dash-panel" id="dash-leaderboard" style={{ width: '100%' }}>
          <div className="leaderboard-container">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Rank</th>
                  <th>Player</th>
                  <th style={{ width: '120px' }}>Blocks Placed</th>
                  <th style={{ width: '120px' }}>Blocks Mined</th>
                </tr>
              </thead>
              <tbody>
                {loadingLeaderboard ? (
                  <tr>
                    <td colSpan="4" style={{ color: 'var(--gold)', textAlign: 'center', padding: '20px' }}>Fetching global records...</td>
                  </tr>
                ) : leaderboardList.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ color: '#9a8a76', textAlign: 'center', padding: '20px' }}>No records found yet.</td>
                  </tr>
                ) : (
                  leaderboardList.map((entry, index) => (
                    <tr key={index}>
                      <td style={{ fontWeight: 700, color: index === 0 ? 'var(--gold-bright)' : '#fff' }}>#{index + 1}</td>
                      <td style={{ color: '#fff', textAlign: 'left' }}>{entry.username || 'Anonymous'}</td>
                      <td>{entry.placedBlocks || 0}</td>
                      <td>{entry.minedBlocks || 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'achievements' && (
        <div className="dash-panel" id="dash-achievements" style={{ width: '100%' }}>
          <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
            {[
              { id: 1, name: "First Journey", desc: "Walk at least 100 blocks in the voxel world." },
              { id: 2, name: "Timber!", desc: "Mine at least 5 wood log blocks." },
              { id: 3, name: "Subterranean Miner", desc: "Mine at least 5 ore blocks (Coal, Iron, Gold, Diamond)." },
              { id: 4, name: "Expert Smelter", desc: "Smelt ores or foods inside an active furnace." },
              { id: 5, name: "Safe Storage", desc: "Craft and place a Chest block." },
              { id: 6, name: "Humble Farmer", desc: "Till grass or dirt into farmland using a Hoe." },
              { id: 7, name: "Green Thumb", desc: "Plant wheat seeds on farmland." },
              { id: 8, name: "Bountiful Harvest", desc: "Harvest fully grown ripe wheat crops." },
              { id: 9, name: "Diamonds!", desc: "Find and mine a rare Diamond Ore block." },
              { id: 10, name: "Night Survivor", desc: "Survive a full night cycle without dying." }
            ].map(a => {
              const unlocked = achievements[a.id];
              return (
                <div key={a.id} className="recipe-row" style={{
                  opacity: unlocked ? 1 : 0.45,
                  cursor: 'default',
                  background: unlocked ? 'rgba(214,178,120,0.06)' : 'rgba(0,0,0,0.15)',
                  border: unlocked ? '1px solid var(--gold)' : '1px solid var(--slot-line)',
                  borderRadius: '4px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '20px', filter: unlocked ? '' : 'grayscale(1)' }}>🏆</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', color: unlocked ? 'var(--gold-bright)' : '#aaa' }}>
                        {a.name}
                      </div>
                      <div style={{ fontSize: '9px', color: '#9a8a76', marginTop: '2px' }}>{a.desc}</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '8px',
                    fontWeight: 'bold',
                    padding: '3px 8px',
                    borderRadius: '3px',
                    background: unlocked ? 'rgba(76,217,100,0.15)' : 'rgba(255,255,255,0.05)',
                    color: unlocked ? '#4cd964' : '#9a8a76',
                    border: unlocked ? '1px solid #4cd964' : '1px solid var(--slot-line)'
                  }}>
                    {unlocked ? "UNLOCKED" : "LOCKED"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'avatar' && (
        <div className="dash-panel" id="dash-avatar" style={{ width: '100%' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch', marginTop: '10px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '6px', border: '1px solid var(--slot-line)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Head Type</label>
                <select 
                  id="avatarHead" 
                  className="cloud-input" 
                  value={avatarHead}
                  onChange={e => handleAvatarChange('headType', e.target.value)}
                  style={{ width: '100%', maxWidth: 'none', background: 'var(--ink)', border: '1px solid var(--panel-line)', color: '#fff' }}
                >
                  <option value="steve">Steve (Classic)</option>
                  <option value="alex">Alex (Ginger)</option>
                  <option value="zombie">Zombie Skin</option>
                  <option value="creeper">Creeper Skin</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Shirt Color</label>
                <input 
                  type="color" 
                  id="avatarShirtColor" 
                  value={avatarShirt}
                  onChange={e => handleAvatarChange('shirtColor', e.target.value)}
                  style={{ width: '100%', height: '32px', border: '1px solid var(--panel-line)', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Pants Color</label>
                <input 
                  type="color" 
                  id="avatarPantsColor" 
                  value={avatarPants}
                  onChange={e => handleAvatarChange('pantsColor', e.target.value)}
                  style={{ width: '100%', height: '32px', border: '1px solid var(--panel-line)', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Skin Color</label>
                <input 
                  type="color" 
                  id="avatarSkinColor" 
                  value={avatarSkin}
                  onChange={e => handleAvatarChange('skinColor', e.target.value)}
                  style={{ width: '100%', height: '32px', border: '1px solid var(--panel-line)', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                />
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)', border: '1px dashed var(--slot-line)', borderRadius: '6px', padding: '12px', minHeight: '220px', overflow: 'hidden' }}>
              <div id="avatar3DPreviewContainer" style={{ width: '120px', height: '160px', position: 'relative', perspective: '400px' }}>
                <div id="stevePreview" className="steve-model">
                  <div className="steve-head">
                    <div className="sf face-front"></div>
                    <div className="sf face-back"></div>
                    <div className="sf face-left"></div>
                    <div className="sf face-right"></div>
                    <div className="sf face-top"></div>
                    <div className="sf face-bottom"></div>
                  </div>
                  <div className="steve-body">
                    <div className="sf face-front"></div>
                    <div className="sf face-back"></div>
                    <div className="sf face-left"></div>
                    <div className="sf face-right"></div>
                    <div className="sf face-top"></div>
                    <div className="sf face-bottom"></div>
                  </div>
                  <div className="steve-limb left-arm">
                    <div className="sf face-front"></div>
                    <div className="sf face-back"></div>
                    <div className="sf face-left"></div>
                    <div className="sf face-right"></div>
                    <div className="sf face-top"></div>
                    <div className="sf face-bottom"></div>
                  </div>
                  <div className="steve-limb right-arm">
                    <div className="sf face-front"></div>
                    <div className="sf face-back"></div>
                    <div className="sf face-left"></div>
                    <div className="sf face-right"></div>
                    <div className="sf face-top"></div>
                    <div className="sf face-bottom"></div>
                  </div>
                  <div className="steve-limb left-leg">
                    <div className="sf face-front"></div>
                    <div className="sf face-back"></div>
                    <div className="sf face-left"></div>
                    <div className="sf face-right"></div>
                    <div className="sf face-top"></div>
                    <div className="sf face-bottom"></div>
                  </div>
                  <div className="steve-limb right-leg">
                    <div className="sf face-front"></div>
                    <div className="sf face-back"></div>
                    <div className="sf face-left"></div>
                    <div className="sf face-right"></div>
                    <div className="sf face-top"></div>
                    <div className="sf face-bottom"></div>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '9px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '8px' }}>Preview</div>
            </div>
          </div>
        </div>
      )}

      {/* Sync Status Footer */}
      <div className="cloud-panel" style={{ marginTop: '20px', width: '100%' }}>
        <div className="cloud-title">☁️ Cloud Sync Status</div>
        <div id="cloudStatus" className="cloud-status">{typeof syncStatus === 'string' ? syncStatus.replace(/<[^>]*>?/gm, '') : String(syncStatus || '')}</div>
        <div className="cloud-actions" style={{ marginTop: '8px' }}>
          <button className="cloud-btn secondary" disabled={syncLoading} onClick={handleManualSync}>
            {syncLoading ? "Syncing..." : "Sync Now"}
          </button>
          <button className="cloud-btn danger" onClick={() => { logoutUser().catch(() => location.reload()); }}>Logout / Switch Account</button>
        </div>
      </div>

      {/* Reset Modal */}
      {resetStep !== null && (
        <div className="modal" style={{ zIndex: 50 }}>
          <div className="modal-card">
            <div className="modal-icon">⚠️</div>
            {resetStep === 0 && (
              <>
                <h2>Reset World?</h2>
                <p style={{ color: '#d8caae', fontSize: '12px', lineHeight: 1.5, marginBottom: '20px' }}>Are you absolutely sure you want to erase this voxel world? This cannot be undone.</p>
                <div className="modal-buttons">
                  <button className="modal-btn danger" onClick={() => setResetStep(1)}>Proceed</button>
                  <button className="modal-btn cancel" onClick={() => setResetStep(null)}>Cancel</button>
                </div>
              </>
            )}
            {resetStep === 1 && (
              <>
                <h2>Are you REALLY sure?</h2>
                <p style={{ color: '#ff9a86', fontSize: '11px', lineHeight: 1.5, marginBottom: '20px', fontWeight: 'bold' }}>All your building edits, storage chests, and inventory items will be deleted forever.</p>
                <div className="modal-buttons">
                  <button className="modal-btn danger" onClick={() => setResetStep(2)}>I Understand</button>
                  <button className="modal-btn cancel" onClick={() => setResetStep(null)}>Cancel</button>
                </div>
              </>
            )}
            {resetStep === 2 && (
              <>
                <h2>Final Confirmation</h2>
                <p style={{ color: '#d8caae', fontSize: '11px', marginBottom: '10px' }}>To confirm destruction of this world, type the word <strong style={{ color: 'var(--gold-bright)' }}>RESET</strong> below:</p>
                <input 
                  type="text" 
                  value={resetConfirmText}
                  onChange={e => setResetConfirmText(e.target.value)}
                  placeholder="Type RESET"
                  className="cloud-input"
                  style={{ width: '100%', marginBottom: '15px', textAlign: 'center', background: 'var(--ink)' }}
                />
                <div className="modal-buttons">
                  <button 
                    className="modal-btn danger" 
                    disabled={resetConfirmText.trim().toUpperCase() !== 'RESET'} 
                    onClick={handleResetWorld}
                  >
                    DESTROY WORLD
                  </button>
                  <button className="modal-btn cancel" onClick={() => setResetStep(null)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
