import React, { useState, useEffect } from 'react';
import { 
  fetchAllUsersForMaster, 
  logoutUser, 
  updateUserRoleInFirestore,
  updateUserDocInFirestore,
  updateWorldSettingsInFirestore,
  sendAdminBroadcast,
  sendAdminDirectMessage,
  subscribeToRoomsDirectory,
  deleteTeamRoom,
  resetTeamRoom,
  updateRoomPrivacy,
  fetchGameReviews,
  deleteGameReview,
  subscribeToAllChatsForAdmin,
  subscribeToChatMessages,
  kickUserAccount,
  banUserAccount,
  toggleUserMute,
  summonPlayerToAdmin,
  giveItemToUserInFirestore,
  applyPrefabStructureToRoom,
  subscribeToWorldSettings
} from '../firebase.js';
import { game, player } from '../state.js';
import { spawnLightningStrike } from '../main.js';
import { initAudio } from '../audio.js';
import AdminHandbookModal from './AdminHandbookModal.jsx';

export default function MasterDashboardCard({ userEmail }) {
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'online', 'offline'
  const [selectedUser, setSelectedUser] = useState(null);
  const [worldSettings, setWorldSettings] = useState({ lockdown: false, maintenance: false });
  const [timeSpeed, setTimeSpeed] = useState(1);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [adminTab, setAdminTab] = useState('users'); // 'users', 'rooms', 'reviews', 'chats'
  const [allChatThreads, setAllChatThreads] = useState([]);
  const [selectedAdminChatId, setSelectedAdminChatId] = useState(null);
  const [adminChatMessages, setAdminChatMessages] = useState([]);
  const [showHandbookModal, setShowHandbookModal] = useState(false);

  // Admin controls state
  const [broadcastText, setBroadcastText] = useState('');
  const [directMsgText, setDirectMsgText] = useState('');
  const [timeFrozen, setTimeFrozen] = useState(false);
  const [isRaining, setIsRaining] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState('');

  useEffect(() => {
    const unsub = subscribeToRoomsDirectory((list) => {
      setRooms(list.filter(r => !r.deleted));
    });
    const unsubWorld = subscribeToWorldSettings((s) => {
      if (s) {
        setWorldSettings(s);
        if (typeof window !== 'undefined') window.__worldSettings = s;
      }
    });
    return () => { unsub(); unsubWorld(); };
  }, []);

  useEffect(() => {
    if (adminTab === 'chats') {
      const unsub = subscribeToAllChatsForAdmin((threads) => {
        setAllChatThreads(threads);
      });
      return () => unsub();
    }
  }, [adminTab]);

  useEffect(() => {
    if (selectedAdminChatId) {
      const unsub = subscribeToChatMessages(selectedAdminChatId, (msgs) => {
        setAdminChatMessages(msgs);
      });
      return () => unsub();
    }
  }, [selectedAdminChatId]);

  const loadReviews = async () => {
    const data = await fetchGameReviews();
    setReviews(data.filter(r => !r.deleted));
  };

  useEffect(() => {
    if (adminTab === 'reviews') {
      loadReviews();
    }
  }, [adminTab]);

  const showFeedback = (msg) => {
    setStatusFeedback(msg);
    setTimeout(() => setStatusFeedback(''), 4000);
  };

  const handleStealthEnterRoom = (roomObj) => {
    game.mode = 'room';
    game.activeRoomId = roomObj.id;
    game.activeRoomInfo = roomObj;
    game.running = true;
    game.paused = false;
    initAudio();
    showFeedback(`🕵️ Stealth entering Room '${roomObj.name}' (${roomObj.id})...`);
    setTimeout(() => {
      try {
        const promise = document.getElementById('game')?.requestPointerLock();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});
      } catch(e){}
    }, 100);
  };

  const loadData = async () => {
    setLoading(true);
    const data = await fetchAllUsersForMaster();
    setUsers(data);
    setLastRefreshed(new Date().toLocaleTimeString());
    setLoading(false);
  };

  const handleRoleToggle = async (userObj) => {
    const newRole = userObj.role === 'admin' ? 'player' : 'admin';
    await updateUserRoleInFirestore(userObj.uid, newRole);
    showFeedback(`Role updated to '${newRole}' for ${userObj.email}`);
    loadData();
  };

  const handleSetTime = async (timeVal) => {
    await updateWorldSettingsInFirestore({ timeOfDay: timeVal });
    showFeedback(`World time set to ${timeVal} ticks.`);
  };

  const handleToggleFreezeTime = async () => {
    const newFrozen = !timeFrozen;
    setTimeFrozen(newFrozen);
    await updateWorldSettingsInFirestore({ timeFrozen: newFrozen });
    showFeedback(`Day-Night Cycle ${newFrozen ? 'FROZEN ⏸️' : 'RESUMED ☀️'}`);
  };

  const handleToggleWeather = async () => {
    const newRain = !isRaining;
    setIsRaining(newRain);
    await updateWorldSettingsInFirestore({ weather: newRain ? 'rain' : 'clear' });
    showFeedback(`Weather set to ${newRain ? '🌧️ Rain' : '☀️ Clear'}`);
  };

  const handleSendBroadcast = async () => {
    if (!broadcastText.trim()) return;
    await sendAdminBroadcast(broadcastText, userEmail);
    showFeedback(`📢 Broadcast sent to all online and offline players!`);
    setBroadcastText('');
    loadData();
  };

  const handleSendDirectMessage = async (targetUid, email) => {
    if (!directMsgText.trim() || !targetUid) return;
    await sendAdminDirectMessage(targetUid, directMsgText, userEmail);
    showFeedback(`✉️ Direct message sent to ${email}`);
    setDirectMsgText('');
    loadData();
  };

  const handleToggleFreezeUser = async (userObj) => {
    const isFrozen = Boolean(userObj.raw?.frozen);
    await updateUserDocInFirestore(userObj.uid, { frozen: !isFrozen });
    showFeedback(`${userObj.email} ${!isFrozen ? 'FROZEN ❄️' : 'UNFROZEN 🏃'}`);
    loadData();
  };

  const handleTeleportUserToSpawn = async (userObj) => {
    await updateUserDocInFirestore(userObj.uid, { teleportTarget: { x: 0, y: 80, z: 0 } });
    showFeedback(`📍 Teleport signal sent: ${userObj.email} → World Spawn (0, 80, 0)`);
  };

  const handleGiveItemsToUser = async (userObj, itemId, count, itemName) => {
    const existingAdditions = Array.isArray(userObj.raw?.inventoryAdditions) ? userObj.raw.inventoryAdditions : [];
    const updated = [...existingAdditions, { id: itemId, count }];
    await updateUserDocInFirestore(userObj.uid, { inventoryAdditions: updated });
    showFeedback(`🎁 Injected ${count}× ${itemName} to ${userObj.email}!`);
    loadData();
  };

  const handleHealUser = async (userObj) => {
    await updateUserDocInFirestore(userObj.uid, { healthOverride: 20 });
    showFeedback(`❤️ Restored ${userObj.email} to Full Health (20 HP)!`);
  };

  const handleKickUser = async (userObj) => {
    await updateUserDocInFirestore(userObj.uid, { kickSignal: Date.now() });
    showFeedback(`🚪 Kick signal sent to ${userObj.email}`);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 12000);
    return () => clearInterval(interval);
  }, []);

  // Filtered users
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.email.toLowerCase().includes(search.toLowerCase()) || u.uid.toLowerCase().includes(search.toLowerCase());
    if (filterStatus === 'online') return matchesSearch && u.isOnline;
    if (filterStatus === 'offline') return matchesSearch && !u.isOnline;
    return matchesSearch;
  });

  const onlineCount = users.filter(u => u.isOnline).length;
  const offlineCount = users.length - onlineCount;
  const totalEdits = users.reduce((acc, u) => acc + (u.editsCount || 0), 0);

  return (
    <div style={{
      width: 'min(1060px, 95vw)',
      maxHeight: '92vh',
      background: 'rgba(14, 11, 8, 0.98)',
      border: '2px solid rgba(230, 180, 80, 0.45)',
      borderRadius: 14,
      boxShadow: '0 25px 90px rgba(0, 0, 0, 0.95), 0 0 40px rgba(230, 180, 80, 0.15)',
      padding: '20px 24px',
      color: '#f0e6d2',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
      boxSizing: 'border-box',
    }}>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>👑</span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: 2, color: '#f5d77f', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
              SUPER-ADMIN CONTROL CENTER
            </h1>
            <span style={{
              background: 'rgba(230,180,80,0.2)', border: '1px solid rgba(230,180,80,0.6)',
              color: '#f5d77f', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, letterSpacing: 1
            }}>
              ROLE: ADMIN
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#a09075', marginTop: 3 }}>
            Logged in as: <strong style={{ color: '#d6b278' }}>{userEmail}</strong> • Realtime World & Player Authority Console
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusFeedback && (
            <span style={{
              background: 'rgba(40,180,80,0.2)', border: '1px solid rgba(50,220,100,0.5)',
              color: '#88ff88', fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 6
            }}>
              {statusFeedback}
            </span>
          )}

          <button
            onClick={() => setShowHandbookModal(true)}
            style={{
              background: 'rgba(214,178,120,0.25)', border: '1px solid var(--gold)',
              color: 'var(--gold-bright)', padding: '8px 14px', borderRadius: 6, fontWeight: 700,
              cursor: 'pointer', fontSize: 12, transition: 'all 0.2s',
            }}
          >
            📖 Admin Manual
          </button>

          <button
            onClick={logoutUser}
            style={{
              background: 'rgba(180,40,40,0.25)', border: '1px solid rgba(220,60,60,0.5)',
              color: '#ff9999', padding: '8px 16px', borderRadius: 6, fontWeight: 600,
              cursor: 'pointer', fontSize: 12, transition: 'all 0.2s',
            }}
          >
            🚪 Sign Out
          </button>
        </div>
      </div>

      {/* ── WORLD & ENVIRONMENT CONTROLS BAR ── */}
      <div style={{
        background: 'rgba(30,22,14,0.85)',
        border: '1px solid rgba(214,178,120,0.25)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        justify: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f5d77f', fontWeight: 700 }}>
          <span>☀️ WORLD OVERRIDES:</span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => handleSetTime(6000)} style={adminBtnStyle}>☀️ Day (06:00)</button>
          <button onClick={() => handleSetTime(12000)} style={adminBtnStyle}>🌅 Sunset (18:00)</button>
          <button onClick={() => handleSetTime(18000)} style={adminBtnStyle}>🌙 Night (21:00)</button>
          <button onClick={() => handleSetTime(0)} style={adminBtnStyle}>🌌 Midnight (00:00)</button>
          <button onClick={handleToggleFreezeTime} style={{ ...adminBtnStyle, color: timeFrozen ? '#ffaa66' : '#f5d77f' }}>
            {timeFrozen ? "▶ Resume Time" : "⏸️ Freeze Time"}
          </button>
          <button onClick={handleToggleWeather} style={{ ...adminBtnStyle, color: isRaining ? '#66ccff' : '#f5d77f' }}>
            {isRaining ? "☀️ Clear Weather" : "🌧️ Toggle Rain"}
          </button>
          <button
            onClick={() => {
              const next = timeSpeed === 1 ? 2 : timeSpeed === 2 ? 5 : timeSpeed === 5 ? 10 : 1;
              setTimeSpeed(next);
              game.timeSpeedMultiplier = next;
              showFeedback(`⚡ Day/Night Speed: ${next}×`);
            }}
            style={{ ...adminBtnStyle, color: '#ffaa00' }}
          >
            ⏩ Speed ({timeSpeed}×)
          </button>
          <button
            onClick={() => {
              spawnLightningStrike(player.pos.x, player.pos.y, player.pos.z);
              showFeedback("⚡ Lightning Struck at Admin Position!");
            }}
            style={{ ...adminBtnStyle, color: '#ffff55', border: '1px solid #ffff55' }}
          >
            ⚡ Strike Lightning
          </button>
          <button
            onClick={async () => {
              const nextLock = !worldSettings.lockdown;
              await updateWorldSettingsInFirestore({ lockdown: nextLock });
              showFeedback(nextLock ? "🔒 World Build Lockdown ACTIVATED" : "🔓 World Build Lockdown DEACTIVATED");
            }}
            style={{ ...adminBtnStyle, color: worldSettings.lockdown ? '#ff6666' : '#88ff88' }}
          >
            {worldSettings.lockdown ? "🔒 LOCKDOWN ACTIVE" : "🔓 LOCKDOWN OFF"}
          </button>
          <button
            onClick={async () => {
              const nextMaint = !worldSettings.maintenance;
              await updateWorldSettingsInFirestore({ maintenance: nextMaint });
              showFeedback(nextMaint ? "🚧 Maintenance Mode ENABLED" : "🟢 Maintenance Mode DISABLED");
            }}
            style={{ ...adminBtnStyle, color: worldSettings.maintenance ? '#ff9999' : '#88ff88' }}
          >
            {worldSettings.maintenance ? "🚧 MAINTENANCE ON" : "🟢 MAINTENANCE OFF"}
          </button>
        </div>
      </div>

      {/* ── PREFAB STRUCTURE SPAWNER BAR ── */}
      <div style={{
        background: 'rgba(20,15,10,0.85)',
        border: '1px solid rgba(214,178,120,0.3)',
        borderRadius: 8,
        padding: '8px 14px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold-bright)' }}>🏗️ PREFAB STRUCTURE SPAWNER:</span>
        <button
          onClick={async () => {
            const ok = await applyPrefabStructureToRoom(game.activeRoomId || 'nexus', 'castle', player.pos.x, player.pos.y, player.pos.z);
            if (ok) showFeedback("🏰 Fortress Castle Spawned at Admin Position!");
          }}
          style={adminBtnStyle}
        >
          🏰 7×7 Castle
        </button>
        <button
          onClick={async () => {
            const ok = await applyPrefabStructureToRoom(game.activeRoomId || 'nexus', 'tower', player.pos.x, player.pos.y, player.pos.z);
            if (ok) showFeedback("🗼 Obsidian Beacon Spire Spawned!");
          }}
          style={adminBtnStyle}
        >
          🗼 Obsidian Spire
        </button>
        <button
          onClick={async () => {
            const ok = await applyPrefabStructureToRoom(game.activeRoomId || 'nexus', 'arena', player.pos.x, player.pos.y, player.pos.z);
            if (ok) showFeedback("🏟️ PvP Arena Ring Spawned!");
          }}
          style={adminBtnStyle}
        >
          🏟️ 11×11 PvP Arena
        </button>
        <button
          onClick={async () => {
            const ok = await applyPrefabStructureToRoom(game.activeRoomId || 'nexus', 'bunker', player.pos.x, player.pos.y, player.pos.z);
            if (ok) showFeedback("🛖 Survival Bunker Spawned!");
          }}
          style={adminBtnStyle}
        >
          🛖 Survival Bunker
        </button>
      </div>

      {/* ── SERVER BROADCAST BOX ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          type="text"
          placeholder="📢 Send global server announcement (delivered live to online players & saved to all offline inboxes)..."
          value={broadcastText}
          onChange={e => setBroadcastText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSendBroadcast()}
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(230,180,80,0.3)',
            color: '#f0e6d2',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSendBroadcast}
          style={{
            background: 'rgba(230,180,80,0.2)',
            border: '1px solid rgba(230,180,80,0.6)',
            color: '#f5d77f',
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          📢 BROADCAST TO ALL
        </button>
      </div>

      {/* ── SUMMARY STATS BAR ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10,
        marginBottom: 14,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.2)', padding: '10px 14px', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#a09075', letterSpacing: 1 }}>REGISTERED ACCOUNTS</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f5d77f', marginTop: 2 }}>{users.length}</div>
        </div>
        <div style={{ background: 'rgba(40,160,80,0.1)', border: '1px solid rgba(40,180,80,0.3)', padding: '10px 14px', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#66bb66', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#44cc44', boxShadow: '0 0 8px #44cc44' }}></span>
            ONLINE PLAYERS
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#66ee66', marginTop: 2 }}>{onlineCount}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#888888', letterSpacing: 1 }}>OFFLINE ACCOUNTS</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#bbbbbb', marginTop: 2 }}>{offlineCount}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.2)', padding: '10px 14px', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#a09075', letterSpacing: 1 }}>WORLD EDITS SAVED</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f5d77f', marginTop: 2 }}>{totalEdits}</div>
        </div>
      </div>

      {/* ── ADMIN NAV TABS ── */}
      <div className="dashboard-tabs" style={{ marginBottom: 12, borderBottom: '1px solid rgba(214,178,120,0.2)', paddingBottom: 8, flexShrink: 0 }}>
        <button
          onClick={() => setAdminTab('users')}
          className={`dash-tab ${adminTab === 'users' ? 'active' : ''}`}
          style={{
            background: adminTab === 'users' ? 'rgba(214,178,120,0.25)' : 'transparent',
            border: adminTab === 'users' ? '1px solid var(--gold)' : '1px solid transparent',
            color: adminTab === 'users' ? 'var(--gold-bright)' : '#aaa',
            padding: '8px 16px', borderRadius: 6, fontWeight: 'bold', fontSize: 11, cursor: 'pointer', flexShrink: 0
          }}
        >
          👤 Registered Accounts ({users.length})
        </button>

        <button
          onClick={() => setAdminTab('rooms')}
          className={`dash-tab ${adminTab === 'rooms' ? 'active' : ''}`}
          style={{
            background: adminTab === 'rooms' ? 'rgba(214,178,120,0.25)' : 'transparent',
            border: adminTab === 'rooms' ? '1px solid var(--gold)' : '1px solid transparent',
            color: adminTab === 'rooms' ? 'var(--gold-bright)' : '#aaa',
            padding: '8px 16px', borderRadius: 6, fontWeight: 'bold', fontSize: 11, cursor: 'pointer', flexShrink: 0
          }}
        >
          🌐 Team & Private Rooms ({rooms.length})
        </button>

        <button
          onClick={() => setAdminTab('reviews')}
          className={`dash-tab ${adminTab === 'reviews' ? 'active' : ''}`}
          style={{
            background: adminTab === 'reviews' ? 'rgba(214,178,120,0.25)' : 'transparent',
            border: adminTab === 'reviews' ? '1px solid var(--gold)' : '1px solid transparent',
            color: adminTab === 'reviews' ? 'var(--gold-bright)' : '#aaa',
            padding: '8px 16px', borderRadius: 6, fontWeight: 'bold', fontSize: 11, cursor: 'pointer', flexShrink: 0
          }}
        >
          ⭐ Reviews ({reviews.length})
        </button>

        <button
          onClick={() => setAdminTab('chats')}
          className={`dash-tab ${adminTab === 'chats' ? 'active' : ''}`}
          style={{
            background: adminTab === 'chats' ? 'rgba(214,178,120,0.25)' : 'transparent',
            border: adminTab === 'chats' ? '1px solid var(--gold)' : '1px solid transparent',
            color: adminTab === 'chats' ? 'var(--gold-bright)' : '#aaa',
            padding: '8px 16px', borderRadius: 6, fontWeight: 'bold', fontSize: 11, cursor: 'pointer', flexShrink: 0
          }}
        >
          💬 All Chats Stream ({allChatThreads.length})
        </button>

        <button
          onClick={() => setAdminTab('manual')}
          className={`dash-tab ${adminTab === 'manual' ? 'active' : ''}`}
          style={{
            background: adminTab === 'manual' ? 'rgba(214,178,120,0.25)' : 'rgba(214,178,120,0.1)',
            border: adminTab === 'manual' ? '1px solid var(--gold)' : '1px solid rgba(214,178,120,0.4)',
            color: 'var(--gold-bright)',
            padding: '8px 16px', borderRadius: 6, fontWeight: 'bold', fontSize: 11, cursor: 'pointer', flexShrink: 0
          }}
        >
          📖 Operations Manual
        </button>
      </div>

      {adminTab === 'manual' && (
        /* ── EMBEDDED OPERATIONS MANUAL ── */
        <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(10,8,5,0.7)', border: '1px solid rgba(214,178,120,0.3)', borderRadius: 8, padding: 18, textAlign: 'left', lineHeight: 1.6, fontSize: 12, color: '#e0d0b8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid rgba(214,178,120,0.3)', paddingBottom: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--gold-bright)' }}>📜 Master Admin Operations & Protocol Handbook</h2>
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>Official Administrative Governance Guide for Voxel Ecosystem</div>
            </div>
            <button
              onClick={() => setShowHandbookModal(true)}
              style={{ background: 'var(--gold)', color: '#000', border: 'none', padding: '6px 12px', borderRadius: 4, fontWeight: 'bold', cursor: 'pointer', fontSize: 11 }}
            >
              ↗️ Pop-Out Modal View
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.2)', padding: 12, borderRadius: 6 }}>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0, fontSize: 13 }}>👑 1. Master Privileges & Authority</h3>
              <p style={{ margin: 0, fontSize: 11, color: '#ccc' }}>Full administrative governance over the Voxel Ecosystem. Master Dashboard gives live command over player states, room instances, real-time chat surveillance, global broadcasts, and server time.</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.2)', padding: 12, borderRadius: 6 }}>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0, fontSize: 13 }}>👥 2. User & Moderation Controls</h3>
              <p style={{ margin: 0, fontSize: 11, color: '#ccc' }}>Freeze/unfreeze movement, heal HP, give items, teleport players, promote/demote roles, or message players directly.</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.2)', padding: 12, borderRadius: 6 }}>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0, fontSize: 13 }}>🌐 3. Room & World Inspector</h3>
              <p style={{ margin: 0, fontSize: 11, color: '#ccc' }}>Stealth enter any active world/room, toggle public/private privacy, or reset Global Nexus world data to clean state.</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.2)', padding: 12, borderRadius: 6 }}>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0, fontSize: 13 }}>💬 4. Live Chat Oversight</h3>
              <p style={{ margin: 0, fontSize: 11, color: '#ccc' }}>Monitor all public world chat, team room chats, and 1-on-1 private messages across the network for safety.</p>
            </div>
          </div>
        </div>
      )}

      {adminTab === 'reviews' && (
        /* ── COMMUNITY REVIEWS INBOX ── */
        <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(214,178,120,0.2)', borderRadius: 8, padding: 14, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--gold-bright)' }}>⭐ Community Reviews Inbox ({reviews.length})</span>
            <button onClick={loadReviews} style={{ background: 'rgba(214,178,120,0.15)', border: '1px solid var(--gold)', color: 'var(--gold-bright)', padding: '4px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontWeight: 'bold' }}>
              🔄 Refresh Reviews
            </button>
          </div>

          {reviews.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 11, textAlign: 'center', padding: 24 }}>No community reviews received yet.</div>
          ) : (
            reviews.map(rev => (
              <div key={rev.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(214,178,120,0.2)', borderRadius: 6, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--gold-bright)' }}>
                      {'⭐'.repeat(Math.min(5, Math.ceil(rev.rating / 2)))} ({rev.rating} / 10 Stars)
                    </span>
                    <span style={{ fontSize: 10, color: '#aaa', marginLeft: 10 }}>From: {rev.email}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, color: '#777' }}>{rev.timestamp ? new Date(rev.timestamp).toLocaleString() : ''}</span>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete review from ${rev.email}?`)) {
                          await deleteGameReview(rev.id);
                          showFeedback("Deleted review.");
                          loadReviews();
                        }
                      }}
                      style={{ background: 'rgba(255,60,60,0.2)', border: '1px solid #ff6666', color: '#ff9999', padding: '2px 8px', borderRadius: 4, fontSize: 9, cursor: 'pointer' }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#eee', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {rev.text}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {adminTab === 'rooms' && (
        /* ── TEAM ROOMS MANAGEMENT TABLE ── */
        <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(214,178,120,0.2)', borderRadius: 8, padding: 12, textAlign: 'left' }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: 10 }}>
            👑 Master Room Inspector & Stealth Direct Access
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(30,22,14,0.95)', borderBottom: '1px solid rgba(214,178,120,0.3)', color: '#a09075', textTransform: 'uppercase', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Room Name / ID</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Owner</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Privacy</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Created</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>Admin Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>No team rooms created yet.</td>
                </tr>
              ) : (
                rooms.map(r => {
                  const isNexus = r.id === 'nexus' || r.id === 'global_nexus' || (r.name && r.name.toLowerCase().includes('nexus'));
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: '#fff' }}>
                        {r.isPrivate ? '🔒' : '🌐'} {r.name}
                        <div style={{ fontSize: 9, color: '#777' }}>{r.id}</div>
                      </td>
                      <td style={{ padding: '8px', color: '#ccc' }}>{r.ownerEmail}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 'bold',
                          background: r.isPrivate ? 'rgba(255,100,100,0.15)' : 'rgba(76,217,100,0.15)',
                          color: r.isPrivate ? '#ff9999' : '#4cd964'
                        }}>
                          {r.isPrivate ? 'PRIVATE / INVITE' : 'PUBLIC'}
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: '#888', fontSize: 10 }}>
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            onClick={() => handleStealthEnterRoom(r)}
                            style={{ background: 'rgba(214,178,120,0.2)', border: '1px solid var(--gold)', color: 'var(--gold-bright)', padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            🕵️ Stealth Enter
                          </button>
                          <button
                            onClick={async () => {
                              await updateRoomPrivacy(r.id, !r.isPrivate);
                              showFeedback(`Toggled privacy for room '${r.name}'`);
                            }}
                            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #777', color: '#ccc', padding: '4px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}
                          >
                            ⚙️ {r.isPrivate ? 'Make Public' : 'Make Private'}
                          </button>
                          {isNexus ? (
                            <button
                              onClick={async () => {
                                if (confirm(`Are you sure you want to reset Global Nexus world data (edits, chests, furnaces)?`)) {
                                  await resetTeamRoom(r.id);
                                  showFeedback(`Reset Global Nexus world!`);
                                }
                              }}
                              style={{ background: 'rgba(255,165,0,0.2)', border: '1px solid #ffa500', color: '#ffcc00', padding: '4px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}
                            >
                              🔄 Reset Nexus
                            </button>
                          ) : (
                            <button
                              onClick={async () => {
                                if (confirm(`Are you sure you want to delete room '${r.name}'?`)) {
                                  await deleteTeamRoom(r.id);
                                  showFeedback(`Deleted room '${r.name}'`);
                                }
                              }}
                              style={{ background: 'rgba(255,60,60,0.2)', border: '1px solid #ff6666', color: '#ff9999', padding: '4px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {adminTab === 'users' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── SEARCH & FILTER CONTROL BAR ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 Search account email or UID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200,
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(214,178,120,0.3)',
            color: '#f0e6d2',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            outline: 'none',
          }}
        />

        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderRadius: 6, border: '1px solid rgba(214,178,120,0.2)', overflow: 'hidden' }}>
          {['all', 'online', 'offline'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              style={{
                background: filterStatus === st ? '#f5d77f' : 'transparent',
                color: filterStatus === st ? '#1a1410' : '#d6b278',
                border: 'none',
                padding: '6px 12px',
                fontSize: 10,
                fontWeight: filterStatus === st ? 700 : 500,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {st === 'all' ? `All (${users.length})` : st === 'online' ? `Online (${onlineCount})` : `Offline (${offlineCount})`}
            </button>
          ))}
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          style={{
            background: 'rgba(214,178,120,0.15)',
            border: '1px solid rgba(214,178,120,0.4)',
            color: '#f5d77f',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {loading ? "🔄 Refreshing..." : "🔄 Refresh"}
        </button>
      </div>

      {/* ── USER LIST TABLE ── */}
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(214,178,120,0.2)', borderRadius: 8, background: 'rgba(0,0,0,0.3)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'rgba(30,22,14,0.95)', borderBottom: '1px solid rgba(214,178,120,0.3)', color: '#d6b278', position: 'sticky', top: 0, zIndex: 10 }}>
              <th style={{ padding: '10px 12px' }}>STATUS</th>
              <th style={{ padding: '10px 12px' }}>ROLE</th>
              <th style={{ padding: '10px 12px' }}>ACCOUNT EMAIL</th>
              <th style={{ padding: '10px 12px' }}>PASSWORD</th>
              <th style={{ padding: '10px 12px' }}>LAST ACTIVE</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>ADMIN ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: 24, textAlign: 'center', color: '#887766' }}>
                  {loading ? "Loading user accounts..." : "No accounts match search filter."}
                </td>
              </tr>
            ) : (
              filteredUsers.map(u => {
                const isFrozen = Boolean(u.raw?.frozen);
                return (
                  <tr key={u.uid} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: u.isOnline ? 'rgba(40,160,80,0.05)' : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    <td style={{ padding: '10px 12px' }}>
                      {u.isOnline ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          color: '#55ff55', fontWeight: 700, fontSize: 10,
                          background: 'rgba(40,180,80,0.2)', padding: '2px 7px', borderRadius: 10, border: '1px solid rgba(50,200,80,0.4)'
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#44ff44', boxShadow: '0 0 6px #44ff44' }}></span>
                          ONLINE
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          color: '#aaaaaa', fontSize: 10,
                          background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#777777' }}></span>
                          OFFLINE
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                        background: (u.role === 'admin' || u.role === 'master') ? 'rgba(230,180,80,0.25)' : 'rgba(255,255,255,0.06)',
                        color: (u.role === 'admin' || u.role === 'master') ? '#f5d77f' : '#aaaaaa',
                        border: (u.role === 'admin' || u.role === 'master') ? '1px solid rgba(230,180,80,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      }}>
                        {String(u.role).toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f0e6d2' }}>
                      {u.email}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#ffb380' }}>
                      {u.password}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#a09075' }}>
                      {u.lastActive ? new Date(u.lastActive).toLocaleString() : 'Never'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleToggleFreezeUser(u)}
                          title="Freeze/unfreeze player movement"
                          style={{
                            background: isFrozen ? 'rgba(240,120,40,0.3)' : 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: isFrozen ? '#ffaa66' : '#d6b278',
                            padding: '3px 7px', borderRadius: 4, fontSize: 10, cursor: 'pointer'
                          }}
                        >
                          {isFrozen ? "❄️ Unfreeze" : "❄️ Freeze"}
                        </button>

                        <button
                          onClick={() => handleRoleToggle(u)}
                          style={{
                            background: (u.role === 'admin' || u.role === 'master') ? 'rgba(180,60,60,0.2)' : 'rgba(60,180,80,0.2)',
                            border: (u.role === 'admin' || u.role === 'master') ? '1px solid rgba(220,80,80,0.4)' : '1px solid rgba(80,220,100,0.4)',
                            color: (u.role === 'admin' || u.role === 'master') ? '#ff9999' : '#88ff88',
                            padding: '3px 7px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontWeight: 600
                          }}
                        >
                          {(u.role === 'admin' || u.role === 'master') ? "Make Player" : "Make Admin"}
                        </button>

                        <button
                          onClick={() => setSelectedUser(selectedUser?.uid === u.uid ? null : u)}
                          style={{
                            background: 'rgba(214,178,120,0.15)', border: '1px solid rgba(214,178,120,0.4)',
                            color: '#f5d77f', padding: '3px 7px', borderRadius: 4, fontSize: 10, cursor: 'pointer'
                          }}
                        >
                          {selectedUser?.uid === u.uid ? "Hide Info" : "⚙️ Controls"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── USER SUPER-POWERS INSPECTOR MODAL ── */}
      {selectedUser && (
        <div style={{
          marginTop: 10,
          flexShrink: 0,
          maxHeight: '220px',
          overflowY: 'auto',
          background: 'rgba(20,15,10,0.97)',
          border: '1px solid rgba(214,178,120,0.45)',
          borderRadius: 8,
          padding: 14,
          fontSize: 11,
          boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
            <strong style={{ color: '#f5d77f', fontSize: 13 }}>
              👑 Super-Admin Authority Console: <span style={{ color: '#ffffff' }}>{selectedUser.email}</span> ({selectedUser.isOnline ? "🟢 ONLINE" : "⚪ OFFLINE"})
            </strong>
            <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>✕ Close</button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={() => handleTeleportUserToSpawn(selectedUser)} style={actionBtnStyle}>📍 Teleport to Spawn</button>
            <button
              onClick={async () => {
                await summonPlayerToAdmin(selectedUser.uid, player.pos);
                showFeedback(`⚡ Summoned ${selectedUser.email} to Admin Position!`);
              }}
              style={{ ...actionBtnStyle, background: 'rgba(230,180,80,0.25)', color: '#f5d77f' }}
            >
              ⚡ Summon to Me
            </button>
            <button onClick={() => handleGiveItemsToUser(selectedUser, 14, 64, "Diamond")} style={actionBtnStyle}>🎁 64× Diamonds</button>
            <button onClick={() => handleGiveItemsToUser(selectedUser, 56, 64, "TNT")} style={actionBtnStyle}>🎁 64× TNT</button>
            <button onClick={() => handleGiveItemsToUser(selectedUser, 47, 64, "Obsidian")} style={actionBtnStyle}>🎁 64× Obsidian</button>
            <button onClick={() => handleHealUser(selectedUser)} style={actionBtnStyle}>❤️ Heal to 20 HP</button>
            <button
              onClick={async () => {
                const nextMute = !selectedUser.raw?.muted;
                await toggleUserMute(selectedUser.uid, nextMute);
                showFeedback(nextMute ? `🔇 Muted ${selectedUser.email}` : `🔊 Unmuted ${selectedUser.email}`);
                loadUsers();
              }}
              style={{ ...actionBtnStyle, background: selectedUser.raw?.muted ? 'rgba(255,160,50,0.3)' : 'rgba(255,255,255,0.08)' }}
            >
              {selectedUser.raw?.muted ? "🔊 Unmute Chat" : "🔇 Mute Chat"}
            </button>
            <button onClick={() => handleKickUser(selectedUser)} style={{ ...actionBtnStyle, background: 'rgba(180,40,40,0.3)', color: '#ffaaaa' }}>🚪 Kick Session</button>
            <button
              onClick={async () => {
                const nextBan = !selectedUser.raw?.banned;
                if (confirm(nextBan ? `BAN account ${selectedUser.email}?` : `UNBAN account ${selectedUser.email}?`)) {
                  await banUserAccount(selectedUser.uid, nextBan);
                  showFeedback(nextBan ? `⛔ Banned ${selectedUser.email}` : `🟢 Unbanned ${selectedUser.email}`);
                  loadUsers();
                }
              }}
              style={{ ...actionBtnStyle, background: selectedUser.raw?.banned ? 'rgba(80,200,80,0.3)' : 'rgba(220,40,40,0.4)', color: selectedUser.raw?.banned ? '#88ff88' : '#ff9999' }}
            >
              {selectedUser.raw?.banned ? "🟢 Unban Account" : "⛔ Ban Account"}
            </button>
          </div>

          {/* Send Direct Message */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder={`✉️ Send private admin message to ${selectedUser.email} (saved to user inbox)...`}
              value={directMsgText}
              onChange={e => setDirectMsgText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendDirectMessage(selectedUser.uid, selectedUser.email)}
              style={{
                flex: 1,
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(214,178,120,0.3)',
                color: '#f0e6d2',
                padding: '6px 10px',
                borderRadius: 4,
                fontSize: 11,
                outline: 'none',
              }}
            />
            <button
              onClick={() => handleSendDirectMessage(selectedUser.uid, selectedUser.email)}
              style={{
                background: 'rgba(214,178,120,0.2)',
                border: '1px solid rgba(214,178,120,0.5)',
                color: '#f5d77f',
                padding: '6px 12px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✉️ SEND PRIVATE MESSAGE
            </button>
          </div>
        </div>
      )}
      </div>
      )}

      {adminTab === 'chats' && (
        /* ── LIVE ALL CHATS SURVEILLANCE PANEL ── */
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(214,178,120,0.2)', borderRadius: 8, padding: 14, textAlign: 'left' }}>
          {/* Threads list (left) */}
          <div style={{ width: '220px', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: 4 }}>
              💬 Chat Channels ({allChatThreads.length})
            </div>
            {allChatThreads.length === 0 ? (
              <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>No chat channels active</div>
            ) : (
              allChatThreads.map(thread => (
                <div
                  key={thread.id}
                  onClick={() => setSelectedAdminChatId(thread.id)}
                  style={{
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 10,
                    background: selectedAdminChatId === thread.id ? 'rgba(214,178,120,0.2)' : 'rgba(255,255,255,0.03)',
                    border: selectedAdminChatId === thread.id ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.06)'
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: '#fff' }}>
                    {thread.isDirect ? `✉️ DM: ${thread.id.slice(0, 12)}...` : `🌐 Room: ${thread.name || thread.id}`}
                  </div>
                  <div style={{ color: '#aaa', fontSize: 9, marginTop: 2 }}>
                    Last active: {new Date(thread.updatedAt || 0).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Messages Live Stream (right) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: 8 }}>
              {selectedAdminChatId ? `📡 Surveillance Stream: ${selectedAdminChatId}` : 'Select a Chat Channel to monitor in real-time'}
            </div>
            <div style={{ flex: 1, maxHeight: '340px', overflowY: 'auto', background: 'rgba(0,0,0,0.4)', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {!selectedAdminChatId ? (
                <div style={{ color: '#777', fontSize: 11, textAlign: 'center', margin: 'auto' }}>
                  👈 Click any chat channel on the left to monitor player messages live.
                </div>
              ) : adminChatMessages.length === 0 ? (
                <div style={{ color: '#777', fontSize: 11, textAlign: 'center', margin: 'auto' }}>
                  No messages recorded in this channel yet.
                </div>
              ) : (
                adminChatMessages.map((msg, idx) => (
                  <div key={idx} style={{ fontSize: 11, padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                    <span style={{ color: 'var(--gold-bright)', fontWeight: 'bold', marginRight: 6 }}>
                      {msg.senderEmail || msg.sender}:
                    </span>
                    <span style={{ color: '#eee' }}>{msg.text}</span>
                    <span style={{ color: '#777', fontSize: 9, marginLeft: 8 }}>
                      {new Date(msg.timestamp || Date.now()).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showHandbookModal && (
        <AdminHandbookModal onClose={() => setShowHandbookModal(false)} />
      )}
    </div>
  );
}

const adminBtnStyle = {
  background: 'rgba(214,178,120,0.15)',
  border: '1px solid rgba(214,178,120,0.35)',
  color: '#f5d77f',
  padding: '5px 10px',
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};

const actionBtnStyle = {
  background: 'rgba(214,178,120,0.2)',
  border: '1px solid rgba(214,178,120,0.5)',
  color: '#f5d77f',
  padding: '6px 12px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};
