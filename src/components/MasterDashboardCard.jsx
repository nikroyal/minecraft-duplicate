import React, { useState, useEffect } from 'react';
import { fetchAllUsersForMaster, logoutUser, updateUserRoleInFirestore } from '../firebase.js';

export default function MasterDashboardCard({ userEmail }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'online', 'offline'
  const [selectedUser, setSelectedUser] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

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
    loadData();
  };

  useEffect(() => {
    loadData();
    // Auto refresh status every 15 seconds
    const interval = setInterval(loadData, 15000);
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
      width: 'min(960px, 94vw)',
      maxHeight: '92vh',
      background: 'rgba(14, 11, 8, 0.97)',
      border: '2px solid rgba(230, 180, 80, 0.45)',
      borderRadius: 14,
      boxShadow: '0 25px 90px rgba(0, 0, 0, 0.95), 0 0 40px rgba(230, 180, 80, 0.15)',
      padding: '28px 32px',
      color: '#f0e6d2',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
      boxSizing: 'border-box',
    }}>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>👑</span>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: 2, color: '#f5d77f', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
              ADMIN CONTROL CENTER
            </h1>
            <span style={{
              background: 'rgba(230,180,80,0.2)', border: '1px solid rgba(230,180,80,0.6)',
              color: '#f5d77f', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, letterSpacing: 1
            }}>
              ROLE: ADMIN
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#a09075', marginTop: 4 }}>
            Logged in as: <strong style={{ color: '#d6b278' }}>{userEmail}</strong> • Realtime User Presence & Status Monitor
          </div>
        </div>

        <button
          onClick={logoutUser}
          style={{
            background: 'rgba(180,40,40,0.25)', border: '1px solid rgba(220,60,60,0.5)',
            color: '#ff9999', padding: '8px 16px', borderRadius: 6, fontWeight: 600,
            cursor: 'pointer', fontSize: 12, transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,50,50,0.4)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(180,40,40,0.25)'}
        >
          🚪 Sign Out
        </button>
      </div>

      {/* ── NOTICE: NO GAME SIMULATION ALLOWED FOR ADMIN ACCOUNTS ── */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(80,20,20,0.8) 0%, rgba(40,15,15,0.8) 100%)',
        border: '1px solid rgba(240,80,80,0.4)',
        borderRadius: 8,
        padding: '12px 18px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{ fontSize: 20 }}>🚫</div>
        <div>
          <div style={{ color: '#ff8888', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
            GAMEPLAY & WORLD SIMULATION DISABLED FOR ADMIN ACCOUNTS
          </div>
          <div style={{ color: '#c0a0a0', fontSize: 11, marginTop: 2 }}>
            Admin accounts function as supervisory monitoring consoles. To play, change the role field in Firebase Firestore document <code style={{ color: '#ffcc88' }}>users/{'{uid}'}</code> from <code style={{ color: '#ffcc88' }}>role: "admin"</code> to <code style={{ color: '#ffcc88' }}>role: "player"</code>.
          </div>
        </div>
      </div>

      {/* ── SUMMARY STATS BAR ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.2)', padding: '14px 18px', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#a09075', letterSpacing: 1 }}>TOTAL REGISTERED</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#f5d77f', marginTop: 2 }}>{users.length}</div>
        </div>
        <div style={{ background: 'rgba(40,160,80,0.1)', border: '1px solid rgba(40,180,80,0.3)', padding: '14px 18px', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#66bb66', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#44cc44', boxShadow: '0 0 8px #44cc44' }}></span>
            ONLINE NOW
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#66ee66', marginTop: 2 }}>{onlineCount}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '14px 18px', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#888888', letterSpacing: 1 }}>OFFLINE USERS</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#bbbbbb', marginTop: 2 }}>{offlineCount}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.2)', padding: '14px 18px', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#a09075', letterSpacing: 1 }}>WORLD EDITS RECORDED</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#f5d77f', marginTop: 2 }}>{totalEdits}</div>
        </div>
      </div>

      {/* ── SEARCH & FILTER CONTROL BAR ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 Search user by email or UID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 220,
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(214,178,120,0.3)',
            color: '#f0e6d2',
            padding: '10px 14px',
            borderRadius: 6,
            fontSize: 13,
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
                padding: '8px 14px',
                fontSize: 11,
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
            padding: '8px 14px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {loading ? "🔄 Refreshing..." : "🔄 Refresh Status"}
        </button>
      </div>

      {/* ── USER LIST TABLE ── */}
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(214,178,120,0.2)', borderRadius: 8, background: 'rgba(0,0,0,0.3)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(30,22,14,0.9)', borderBottom: '1px solid rgba(214,178,120,0.3)', color: '#d6b278', sticky: 'top' }}>
              <th style={{ padding: '12px 14px' }}>STATUS</th>
              <th style={{ padding: '12px 14px' }}>FIRESTORE ROLE</th>
              <th style={{ padding: '12px 14px' }}>USER EMAIL</th>
              <th style={{ padding: '12px 14px' }}>PASSWORD IN DOC</th>
              <th style={{ padding: '12px 14px' }}>LAST ACTIVE</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>ROLE TOGGLE & INSPECT</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: 30, textAlign: 'center', color: '#887766' }}>
                  {loading ? "Loading registered user accounts..." : "No user accounts match your search or filter."}
                </td>
              </tr>
            ) : (
              filteredUsers.map(u => (
                <tr key={u.uid} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  background: u.isOnline ? 'rgba(40,160,80,0.05)' : 'transparent',
                  transition: 'background 0.15s',
                }}>
                  <td style={{ padding: '12px 14px' }}>
                    {u.isOnline ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        color: '#55ff55', fontWeight: 700, fontSize: 11,
                        background: 'rgba(40,180,80,0.2)', padding: '3px 8px', borderRadius: 12, border: '1px solid rgba(50,200,80,0.4)'
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#44ff44', boxShadow: '0 0 6px #44ff44' }}></span>
                        ONLINE
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        color: '#aaaaaa', fontSize: 11,
                        background: 'rgba(255,255,255,0.05)', padding: '3px 8px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#777777' }}></span>
                        OFFLINE
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 1,
                      background: (u.role === 'admin' || u.role === 'master') ? 'rgba(230,180,80,0.25)' : 'rgba(255,255,255,0.06)',
                      color: (u.role === 'admin' || u.role === 'master') ? '#f5d77f' : '#aaaaaa',
                      border: (u.role === 'admin' || u.role === 'master') ? '1px solid rgba(230,180,80,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    }}>
                      {String(u.role).toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: '#f0e6d2' }}>
                    {u.email}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#ffb380' }}>
                    {u.password}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#a09075' }}>
                    {u.lastActive ? new Date(u.lastActive).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <button
                      onClick={() => handleRoleToggle(u)}
                      title="Changes user role field in Firestore document"
                      style={{
                        background: (u.role === 'admin' || u.role === 'master') ? 'rgba(180,60,60,0.2)' : 'rgba(60,180,80,0.2)',
                        border: (u.role === 'admin' || u.role === 'master') ? '1px solid rgba(220,80,80,0.4)' : '1px solid rgba(80,220,100,0.4)',
                        color: (u.role === 'admin' || u.role === 'master') ? '#ff9999' : '#88ff88',
                        padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600
                      }}
                    >
                      {(u.role === 'admin' || u.role === 'master') ? "Make Player" : "Make Admin"}
                    </button>
                    <button
                      onClick={() => setSelectedUser(selectedUser?.uid === u.uid ? null : u)}
                      style={{
                        background: 'rgba(214,178,120,0.15)', border: '1px solid rgba(214,178,120,0.4)',
                        color: '#f5d77f', padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer'
                      }}
                    >
                      {selectedUser?.uid === u.uid ? "Hide Info" : "Inspect"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── USER DETAILS INSPECTOR MODAL ── */}
      {selectedUser && (
        <div style={{
          marginTop: 16,
          background: 'rgba(20,15,10,0.95)',
          border: '1px solid rgba(214,178,120,0.4)',
          borderRadius: 8,
          padding: 16,
          fontSize: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ color: '#f5d77f', fontSize: 14 }}>User Details: {selectedUser.email}</strong>
            <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>✕ Close</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, color: '#c0b095' }}>
            <div><strong>UID:</strong> {selectedUser.uid}</div>
            <div><strong>Password in Doc:</strong> <code style={{ color: '#ffaa66' }}>{selectedUser.password}</code></div>
            <div><strong>Status:</strong> {selectedUser.isOnline ? "🟢 ONLINE" : "⚪ OFFLINE"}</div>
            <div><strong>Last Active:</strong> {selectedUser.lastActive ? new Date(selectedUser.lastActive).toLocaleString() : 'N/A'}</div>
            <div><strong>Block Edits:</strong> {selectedUser.editsCount}</div>
          </div>
        </div>
      )}
    </div>
  );
}
