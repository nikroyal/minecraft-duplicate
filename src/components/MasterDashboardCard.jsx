import React, { useState, useEffect } from 'react';
import { 
  fetchAllUsersForMaster, 
  logoutUser, 
  updateUserRoleInFirestore,
  updateUserDocInFirestore,
  updateWorldSettingsInFirestore,
  sendAdminBroadcast,
  sendAdminDirectMessage
} from '../firebase.js';

export default function MasterDashboardCard({ userEmail }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'online', 'offline'
  const [selectedUser, setSelectedUser] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Admin controls state
  const [broadcastText, setBroadcastText] = useState('');
  const [directMsgText, setDirectMsgText] = useState('');
  const [timeFrozen, setTimeFrozen] = useState(false);
  const [isRaining, setIsRaining] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState('');

  const showFeedback = (msg) => {
    setStatusFeedback(msg);
    setTimeout(() => setStatusFeedback(''), 4000);
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
      maxHeight: '94vh',
      background: 'rgba(14, 11, 8, 0.98)',
      border: '2px solid rgba(230, 180, 80, 0.45)',
      borderRadius: 14,
      boxShadow: '0 25px 90px rgba(0, 0, 0, 0.95), 0 0 40px rgba(230, 180, 80, 0.15)',
      padding: '24px 28px',
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
        </div>
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
            <tr style={{ background: 'rgba(30,22,14,0.9)', borderBottom: '1px solid rgba(214,178,120,0.3)', color: '#d6b278', sticky: 'top' }}>
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
                    <td style={{ padding: '10px 12px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
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
          marginTop: 12,
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

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={() => handleTeleportUserToSpawn(selectedUser)} style={actionBtnStyle}>📍 Teleport to Spawn (0,80,0)</button>
            <button onClick={() => handleGiveItemsToUser(selectedUser, 14, 64, "Diamond")} style={actionBtnStyle}>🎁 Give 64× Diamonds</button>
            <button onClick={() => handleGiveItemsToUser(selectedUser, 56, 64, "TNT")} style={actionBtnStyle}>🎁 Give 64× TNT</button>
            <button onClick={() => handleHealUser(selectedUser)} style={actionBtnStyle}>❤️ Heal to 20 HP</button>
            <button onClick={() => handleKickUser(selectedUser)} style={{ ...actionBtnStyle, background: 'rgba(180,40,40,0.3)', color: '#ffaaaa' }}>🚪 Kick Session</button>
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
