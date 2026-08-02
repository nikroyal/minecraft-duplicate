import React, { useState, useEffect } from 'react';
import { player, game, world, inventory, SAVE_KEY, avatarCallbacks, achievements } from '../state.js';
import { Chunk, getChunk, generateChunk, getBlock } from '../world.js';
import { isSolid, keyOf, HEIGHT } from '../config.js';
import { invCount } from '../player.js';
import { 
  logoutUser, fetchLeaderboard, manuallySyncLocalToCloud, resetWorldData,
  createTeamRoom, subscribeToRoomsDirectory, deleteTeamRoom, updateRoomPrivacy,
  submitGameReview
} from '../firebase.js';
import { updateLobbyAvatarPreview, toast } from '../ui.js';
import { initAudio } from '../audio.js';

import ChatPanel from './ChatPanel.jsx';

export default function LobbyCard({ userEmail, userRole, currentUser, syncStatus, onStartGame, scheduleSave, onOpenDirectory, onOpenDailyRewards, onOpenCosmetics, notificationsCount = 0, onOpenNotifications }) {
  const [activeTab, setActiveTab] = useState('play');
  const [resetStep, setResetStep] = useState(null);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [leaderboardList, setLeaderboardList] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const isUserAdmin = userRole === 'admin' || userRole === 'master';

  // Review & Feedback State
  const [reviewRating, setReviewRating] = useState(10);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMsg, setReviewMsg] = useState('');

  // World Mode & Room States
  const [worldMode, setWorldMode] = useState(game.mode || 'singleplayer');
  const [roomsList, setRoomsList] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomPrivate, setNewRoomPrivate] = useState(false);

  // Avatar states
  const [avatarHead, setAvatarHead] = useState(player.avatar?.headType || 'steve');
  const [avatarShirt, setAvatarShirt] = useState(player.avatar?.shirtColor || '#008080');
  const [avatarPants, setAvatarPants] = useState(player.avatar?.pantsColor || '#3c4e8c');
  const [avatarSkin, setAvatarSkin] = useState(player.avatar?.skinColor || '#dfcfb7');

  const visibleRooms = roomsList.filter(r => {
    if (!r.isPrivate) return true;
    if (isUserAdmin) return true; // Admins can see all hidden/private rooms!
    if (currentUser && (r.ownerUid === currentUser.uid || (r.members || []).includes(currentUser.uid))) return true;
    return false;
  });

  useEffect(() => {
    const unsub = subscribeToRoomsDirectory((list) => {
      setRoomsList(list.filter(r => !r.deleted));
    });
    return () => unsub();
  }, []);

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

  const handleReviewSubmit = async () => {
    if (!reviewText.trim()) return setReviewMsg("Please write your experience or feedback.");
    setSubmittingReview(true);
    setReviewMsg('');
    const res = await submitGameReview(reviewRating, reviewText);
    setSubmittingReview(false);
    setReviewMsg(res.msg);
    if (res.success) {
      setReviewText('');
    }
  };

  const handleCreateRoomSubmit = async () => {
    if (!newRoomName.trim()) return toast("Please enter a room name.");
    const id = await createTeamRoom(newRoomName.trim(), newRoomDesc.trim(), newRoomPrivate);
    if (id) {
      toast(`Created Team Room '${newRoomName.trim()}'!`);
      setSelectedRoomId(id);
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomDesc('');
      setNewRoomPrivate(false);
    }
  };

  const handleStartWithMode = () => {
    game.mode = worldMode;
    if (worldMode === 'singleplayer') {
      game.activeRoomId = null;
    } else if (worldMode === 'public') {
      game.activeRoomId = 'global_public';
    } else if (worldMode === 'room') {
      if (!selectedRoomId) {
        return toast("Please select or create a Team Room to join!");
      }
      game.activeRoomId = selectedRoomId;
      const rObj = roomsList.find(r => r.id === selectedRoomId);
      game.activeRoomInfo = rObj || null;
    }
    onStartGame();
  };

  const handleTeleportSurface = () => {
    const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
    const cx = Math.floor(px/16), cz = Math.floor(pz/16);
    let ch = getChunk(cx,cz);
    if (!ch) { ch = new Chunk(cx,cz); world.chunks.set(keyOf(cx,cz), ch); }
    if (!ch.generated) generateChunk(ch);
    let topY = 1;
    for (let y = HEIGHT-1; y >= 0; y--) { if (isSolid(getBlock(px,y,pz))) { topY = y + 1; break; } }
    player.pos.set(px+0.5, topY+0.5, pz+0.5);
    player.vel.set(0,0,0);
    player.flying = false;
    
    initAudio();
    handleStartWithMode();
  };

  const handleEnterWorld = () => {
    initAudio();
    handleStartWithMode();
  };

  const handleManualSync = () => {
    setSyncLoading(true);
    manuallySyncLocalToCloud(() => {})
      .then(() => setSyncLoading(false))
      .catch(() => setSyncLoading(false));
  };

  const handleResetWorld = async () => {
    await resetWorldData();
    setResetStep(null);
    location.reload();
  };

  // Fetch leaderboard data when tab changes
  useEffect(() => {
    if (activeTab === 'leaderboard') {
      setLoadingLeaderboard(true);
      fetchLeaderboard()
        .then(data => setLeaderboardList(data))
        .catch(err => console.error(err))
        .finally(() => setLoadingLeaderboard(false));
    }
  }, [activeTab]);

  // Formatted stats
  const minedBlocks = (player.minedWoodCount || 0) + (player.minedOresCount || 0);
  const placedBlocks = Object.keys(world.edits || {}).length;
  const timeVal = typeof game?.timeOfDay === 'number' ? game.timeOfDay : 0.3;
  const rawTime = (timeVal * 24) % 24;
  const hh = Math.floor(rawTime).toString().padStart(2, '0');
  const mm = Math.floor((rawTime % 1) * 60).toString().padStart(2, '0');

  return (
    <div className="card" id="lobbyCard" style={{ maxWidth: '640px', width: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden', padding: '20px 24px' }}>
      <h1 style={{ flexShrink: 0 }}>VOXEL ECOSYSTEM</h1>
      <div className="tag" style={{ flexShrink: 0 }}>A MULTIPLAYER VOXEL WORLD</div>

      {/* Navigation */}
      <div className="dashboard-tabs" style={{ flexShrink: 0, flexWrap: 'wrap' }}>
        <button id="tabPlayBtn" className={`dash-tab ${activeTab === 'play' ? 'active' : ''}`} onClick={() => setActiveTab('play')}>🎮 Play Mode</button>
        <button className="dash-tab" style={{ background: notificationsCount > 0 ? 'rgba(214,178,120,0.35)' : 'rgba(214,178,120,0.15)', border: '1px solid var(--gold)', color: 'var(--gold-bright)' }} onClick={onOpenNotifications}>🔔 Notifications ({notificationsCount})</button>
        <button className="dash-tab" style={{ background: 'rgba(214,178,120,0.2)', border: '1px solid var(--gold)', color: 'var(--gold-bright)' }} onClick={onOpenDailyRewards}>🎁 Daily Gift</button>
        <button className="dash-tab" onClick={onOpenDirectory}>🔍 Directory</button>
        <button id="tabChatBtn" className={`dash-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>💬 Chat Hub</button>
        <button id="tabReviewBtn" className={`dash-tab ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>⭐ Reviews</button>
        <button id="tabStatsBtn" className={`dash-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>📊 My Stats</button>
        <button id="tabLeaderboardBtn" className={`dash-tab ${activeTab === 'leaderboard' ? 'active' : ''}`} onClick={() => setActiveTab('leaderboard')}>🥇 Leaderboard</button>
        <button id="tabAchievementsBtn" className={`dash-tab ${activeTab === 'achievements' ? 'active' : ''}`} onClick={() => setActiveTab('achievements')}>🏆 Badges</button>
        <button id="tabAvatarBtn" className={`dash-tab ${activeTab === 'avatar' ? 'active' : ''}`} onClick={() => setActiveTab('avatar')}>👕 Avatar</button>
      </div>

      {/* Tabs panels */}
      {activeTab === 'play' && (
        <div className="dash-panel" id="dash-play">
          <div style={{ marginBottom: '14px', fontSize: '12px', color: 'var(--gold-bright)' }}>
            Welcome back, <span style={{ fontWeight: 700, color: '#fff' }}>{userEmail}</span>!
          </div>

          {/* WORLD MODE SELECTOR */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => setWorldMode('singleplayer')}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                background: worldMode === 'singleplayer' ? 'rgba(214,178,120,0.25)' : 'rgba(0,0,0,0.2)',
                border: worldMode === 'singleplayer' ? '1px solid var(--gold)' : '1px solid var(--slot-line)',
                color: worldMode === 'singleplayer' ? 'var(--gold-bright)' : '#aaa',
                transition: 'all 0.15s'
              }}
            >
              🔒 Singleplayer
              <div style={{ fontSize: '9px', fontWeight: 'normal', opacity: 0.7, marginTop: '2px' }}>Private Sandbox</div>
            </button>

            <button
              onClick={() => setWorldMode('public')}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                background: worldMode === 'public' ? 'rgba(214,178,120,0.25)' : 'rgba(0,0,0,0.2)',
                border: worldMode === 'public' ? '1px solid var(--gold)' : '1px solid var(--slot-line)',
                color: worldMode === 'public' ? 'var(--gold-bright)' : '#aaa',
                transition: 'all 0.15s'
              }}
            >
              🌐 Nexus World
              <div style={{ fontSize: '9px', fontWeight: 'normal', opacity: 0.7, marginTop: '2px' }}>Global Shared World</div>
            </button>

            <button
              onClick={() => setWorldMode('room')}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                background: worldMode === 'room' ? 'rgba(214,178,120,0.25)' : 'rgba(0,0,0,0.2)',
                border: worldMode === 'room' ? '1px solid var(--gold)' : '1px solid var(--slot-line)',
                color: worldMode === 'room' ? 'var(--gold-bright)' : '#aaa',
                transition: 'all 0.15s'
              }}
            >
              👥 Team Rooms
              <div style={{ fontSize: '9px', fontWeight: 'normal', opacity: 0.7, marginTop: '2px' }}>Custom Group Worlds</div>
            </button>
          </div>

          {/* TEAM ROOMS BROWSER PANEL */}
          {worldMode === 'room' && (
            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--slot-line)', borderRadius: '6px', padding: '12px', marginBottom: '16px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold-bright)' }}>👥 Select a Team Room</span>
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{ background: 'rgba(76,217,100,0.18)', border: '1px solid #4cd964', color: '#4cd964', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  + Create Room
                </button>
              </div>

              <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {visibleRooms.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', padding: '12px' }}>No team rooms found. Click "+ Create Room" to make one!</div>
                ) : (
                  visibleRooms.map(r => {
                    const isSelected = selectedRoomId === r.id;
                    const isPrivate = Boolean(r.isPrivate);
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRoomId(r.id)}
                        style={{
                          padding: '8px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          background: isSelected ? 'rgba(214,178,120,0.18)' : 'rgba(255,255,255,0.04)',
                          border: isSelected ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 'bold', color: isSelected ? 'var(--gold-bright)' : '#fff', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>{isPrivate ? '🔒' : '🌐'} {r.name}</span>
                            {isPrivate && isUserAdmin && (
                              <span style={{ fontSize: '8px', background: 'rgba(255,60,60,0.2)', color: '#ff9999', padding: '1px 4px', borderRadius: '3px', border: '1px solid rgba(255,60,60,0.4)' }}>
                                👑 ADMIN VIEW
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '9px', color: '#aaa' }}>{r.description || 'Custom room'} • Owner: {r.ownerEmail}</div>
                        </div>
                        <span style={{ fontSize: '9px', color: isSelected ? 'var(--gold)' : '#777', fontWeight: 'bold' }}>
                          {isSelected ? 'SELECTED' : 'SELECT'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* CREATE ROOM MODAL */}
          {showCreateModal && (
            <div style={{ background: 'rgba(20,15,10,0.95)', border: '1px solid var(--gold)', borderRadius: '8px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: '10px' }}>➕ Create a New Team Room</div>
              <input
                type="text"
                placeholder="Room Name (e.g. Castle Builders)"
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                style={{ width: '100%', padding: '8px', marginBottom: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: '4px', fontSize: '11px' }}
              />
              <input
                type="text"
                placeholder="Description (Optional)"
                value={newRoomDesc}
                onChange={e => setNewRoomDesc(e.target.value)}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: '4px', fontSize: '11px' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#ccc', marginBottom: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newRoomPrivate}
                  onChange={e => setNewRoomPrivate(e.target.checked)}
                />
                Make Room Private / Invite-Only (Hidden from directory)
              </label>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleCreateRoomSubmit} style={{ flex: 1, padding: '8px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}>
                  Create & Select
                </button>
                <button onClick={() => setShowCreateModal(false)} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.1)', color: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="keys" style={{ margin: '0 0 20px 0' }}>
            <div><kbd>W A S D</kbd> move &nbsp; <kbd>Space</kbd> jump &nbsp; <kbd>Shift</kbd> sprint</div>
            <div><kbd>Mouse</kbd> look &nbsp; <kbd>Left</kbd> mine &nbsp; <kbd>Right</kbd> place</div>
            <div><kbd>1–8</kbd> select &nbsp; <kbd>E</kbd> inventory &nbsp; <kbd>Q</kbd> eat &nbsp; <kbd>F</kbd> fly &nbsp; <kbd>F5</kbd> camera &nbsp; <kbd>Esc</kbd> pause</div>
          </div>

          <button id="playBtn" onClick={handleEnterWorld}>
            ENTER {worldMode === 'singleplayer' ? 'PRIVATE WORLD' : worldMode === 'public' ? 'GLOBAL NEXUS' : 'TEAM ROOM'}
          </button>
          
          <div className="secondary-actions">
            <button className="minor-btn" onClick={handleTeleportSurface}>↑ Teleport to surface</button>
            <button className="minor-btn danger" onClick={() => setResetStep(0)}>Reset world</button>
          </div>
        </div>
      )}

      {/* CHAT HUB PANEL */}
      {activeTab === 'chat' && (
        <div style={{ height: '340px', marginTop: '10px' }}>
          <ChatPanel currentUser={currentUser} />
        </div>
      )}

      {/* REVIEWS & FEEDBACK PANEL */}
      {activeTab === 'reviews' && (
        <div className="dash-panel" id="dash-reviews" style={{ textAlign: 'left' }}>
          <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--gold-bright)', fontWeight: 'bold' }}>
            ⭐ Community Feedback & Bug Reports
          </div>
          <div style={{ fontSize: '11px', color: '#d8caae', lineHeight: '1.5', marginBottom: '14px' }}>
            Help us continuously update and improve the game! Share your experience, negatives, positives, bugs, or feature ideas directly with the game developers.
          </div>

          {/* Star Selector (1 to 10 Stars) */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold)', display: 'block', marginBottom: '6px' }}>
              Rating: {reviewRating} / 10 Stars {'⭐'.repeat(Math.min(5, Math.ceil(reviewRating / 2)))}
            </label>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                <button
                  key={num}
                  onClick={() => setReviewRating(num)}
                  style={{
                    padding: '6px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                    background: reviewRating === num ? 'var(--gold)' : 'rgba(255,255,255,0.06)',
                    color: reviewRating === num ? '#000' : '#ccc',
                    border: reviewRating === num ? '1px solid var(--gold-bright)' : '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  {num}★
                </button>
              ))}
            </div>
          </div>

          {/* Required Text Review Box */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff', display: 'block', marginBottom: '6px' }}>
              Your Review / Suggestions (Mandatory):
            </label>
            <textarea
              rows="4"
              value={reviewText}
              onChange={e => setReviewText(e.target.value)}
              placeholder="Talk about your experience, negatives, positives, bugs, or how we can make the game better..."
              style={{
                width: '100%', padding: '10px', borderRadius: '6px', fontSize: '11px', lineHeight: '1.4',
                background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', resize: 'vertical'
              }}
            />
          </div>

          {reviewMsg && (
            <div style={{ fontSize: '11px', color: reviewMsg.includes('Thank') ? '#4cd964' : '#ff9999', marginBottom: '12px', fontWeight: 'bold' }}>
              {reviewMsg}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', color: '#888' }}>🛡️ Anti-Spam Active (5-min cooldown between reviews)</span>
            <button
              onClick={handleReviewSubmit}
              disabled={submittingReview}
              style={{
                background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '4px',
                padding: '8px 16px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer'
              }}
            >
              {submittingReview ? "Submitting..." : "Submit Review"}
            </button>
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
              <div className="stat-val">{(inventory ? Object.values(inventory) : []).reduce((a, b) => a + b, 0)}</div>
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
