import React, { useState, useEffect } from 'react';
import { player, game } from '../state.js';
import { surfaceHeight } from '../config.js';
import { fetchAllUsersForMaster } from '../firebase.js';
import { 
  findPath, 
  updatePathTrail, 
  setActiveNavigation, 
  clearActiveNavigation, 
  activeNavigation,
  getSavedWaypoints,
  saveWaypoint,
  deleteWaypoint,
  saveHomeBase,
  saveFarm
} from '../pathfinder.js';
import { toast } from '../ui.js';

export default function WayfinderModal({ currentUser, onClose }) {
  const [activeTab, setActiveTab] = useState('nexus'); // 'nexus', 'friends', 'coords'
  const [searchQuery, setSearchQuery] = useState('');
  const [playersList, setPlayersList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Coordinate Inputs
  const [coordX, setCoordX] = useState(Math.floor(player.pos.x));
  const [coordY, setCoordY] = useState(Math.floor(player.pos.y));
  const [coordZ, setCoordZ] = useState(Math.floor(player.pos.z));
  const [autoY, setAutoY] = useState(true);

  // Waypoints state
  const [waypoints, setWaypoints] = useState(getSavedWaypoints());
  const [newWpName, setNewWpName] = useState('');

  useEffect(() => {
    fetchAllUsersForMaster()
      .then(list => {
        setPlayersList(list || []);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  // Compute distance from player
  const getDistance = (targetX, targetY, targetZ) => {
    const dx = targetX - player.pos.x;
    const dy = targetY - player.pos.y;
    const dz = targetZ - player.pos.z;
    return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
  };

  // Start Pathfinding Action
  const handleStartPathfinding = (targetX, targetY, targetZ, label = 'Destination', icon = '📍') => {
    let finalY = Math.floor(targetY);
    if (autoY) {
      finalY = surfaceHeight(Math.floor(targetX), Math.floor(targetZ)) + 1;
    }

    const startPos = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
    const targetPos = { x: targetX, y: finalY, z: targetZ };

    toast(`🧭 Calculating optimal path to ${label}...`);
    const pathNodes = findPath(startPos, targetPos, 800);

    if (pathNodes && pathNodes.length > 0) {
      updatePathTrail(pathNodes);
      setActiveNavigation({
        targetName: label,
        targetPos: targetPos,
        targetIcon: icon,
        pathNodes: pathNodes,
        distance: getDistance(targetX, finalY, targetZ)
      });
      toast(`🟢 Navigation started! Follow the glowing 3D trail.`);
      onClose();
    } else {
      toast(`⚠️ Could not find a safe path to destination.`);
    }
  };

  const handleStopPathfinding = () => {
    clearActiveNavigation();
    toast(`🛑 Pathfinding cancelled.`);
  };

  const handleSaveCurrentWaypoint = () => {
    if (!newWpName.trim()) return toast("Please enter a name for your waypoint!");
    const updated = saveWaypoint(newWpName.trim(), player.pos.x, player.pos.y, player.pos.z, '📍');
    setWaypoints(updated);
    setNewWpName('');
  };

  const handleDeleteWp = (id) => {
    const updated = deleteWaypoint(id);
    setWaypoints(updated);
  };

  // Combine real-time presence player list with fetched master accounts
  const mergedPlayers = (game.otherPlayersList || []).map(p => ({
    uid: p.uid || p.id,
    email: p.email || p.username || 'Nexus Player',
    isOnline: true,
    pos: p.pos || { x: 0, y: 80, z: 0 },
    role: p.role || 'player'
  }));

  // Filter lists
  const filteredNexusPlayers = mergedPlayers.filter(p => {
    if (p.uid === currentUser?.uid) return false;
    const q = searchQuery.toLowerCase();
    return p.email.toLowerCase().includes(q);
  });

  const filteredFriends = playersList.filter(p => {
    if (p.uid === currentUser?.uid) return false;
    const q = searchQuery.toLowerCase();
    const isFriend = p.raw?.isFriend || p.role === 'admin' || p.role === 'master';
    return isFriend && (p.email.toLowerCase().includes(q) || (p.raw?.bio || '').toLowerCase().includes(q));
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.82)',
      backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'rgba(20,15,10,0.98)', border: '2px solid var(--gold)', borderRadius: '12px',
        width: '100%', maxWidth: '640px', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 70px rgba(0,0,0,0.9)', overflow: 'hidden', color: '#f0e6d2'
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--slot-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--gold-bright)', fontWeight: 'bold', letterSpacing: '1px' }}>
              🧭 WHERE DO YOU WANNA GO?
            </h2>
            <div style={{ fontSize: '10px', color: '#9a8a76', marginTop: '2px' }}>
              Real-time 3D Voxel Pathfinder & Radar System
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Active Navigation Banner */}
        {activeNavigation && (
          <div style={{
            background: 'rgba(57, 255, 20, 0.12)', borderBottom: '1px solid rgba(57, 255, 20, 0.4)',
            padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
          }}>
            <div style={{ fontSize: '11px', color: '#39ff14', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🟢 ACTIVE TRAIL: {activeNavigation.targetIcon || '📍'} {activeNavigation.targetName}</span>
              <span style={{ fontSize: '10px', color: '#aaa', fontWeight: 'normal' }}>({activeNavigation.distance}m away)</span>
            </div>
            <button
              onClick={handleStopPathfinding}
              style={{ background: 'rgba(255,60,60,0.2)', border: '1px solid #ff6666', color: '#ff9999', padding: '3px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              🛑 Stop Navigation
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="dashboard-tabs" style={{ flexShrink: 0, marginBottom: 0, padding: '10px 20px 0 20px' }}>
          <button className={`dash-tab ${activeTab === 'nexus' ? 'active' : ''}`} onClick={() => setActiveTab('nexus')}>🌐 Nexus Players ({filteredNexusPlayers.length})</button>
          <button className={`dash-tab ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => setActiveTab('friends')}>👥 Friends ({filteredFriends.length})</button>
          <button className={`dash-tab ${activeTab === 'coords' ? 'active' : ''}`} onClick={() => setActiveTab('coords')}>📍 Coordinates & Bookmarks</button>
        </div>

        {/* Search Bar for Players/Friends */}
        {(activeTab === 'nexus' || activeTab === 'friends') && (
          <div style={{ padding: '12px 20px 4px 20px', flexShrink: 0 }}>
            <input
              type="text"
              placeholder={activeTab === 'nexus' ? "🔍 Search all online players in Nexus..." : "🔍 Search friends..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', fontSize: '11px' }}
            />
          </div>
        )}

        {/* Tab Content Panel */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          
          {/* TAB 1: NEXUS PLAYERS */}
          {activeTab === 'nexus' && (
            <>
              {filteredNexusPlayers.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: '11px', textAlign: 'center', padding: '30px' }}>
                  No other online players found in Nexus right now.
                </div>
              ) : (
                filteredNexusPlayers.map(p => {
                  const dist = getDistance(p.pos.x, p.pos.y, p.pos.z);
                  return (
                    <div key={p.uid} style={{
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                      padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          🟢 {p.email}
                          <span style={{ fontSize: '9px', color: 'var(--gold)', background: 'rgba(214,178,120,0.2)', padding: '1px 5px', borderRadius: '3px' }}>
                            {dist}m away
                          </span>
                        </div>
                        <div style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>
                          Pos: ({Math.floor(p.pos.x)}, {Math.floor(p.pos.y)}, {Math.floor(p.pos.z)})
                        </div>
                      </div>

                      <button
                        onClick={() => handleStartPathfinding(p.pos.x, p.pos.y, p.pos.z, p.email, '👤')}
                        style={{ background: 'rgba(57,255,20,0.18)', border: '1px solid #39ff14', color: '#39ff14', padding: '6px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        🧭 Trace Path
                      </button>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* TAB 2: FRIENDS DIRECTORY */}
          {activeTab === 'friends' && (
            <>
              {loading ? (
                <div style={{ color: 'var(--gold)', fontSize: '11px', textAlign: 'center', padding: '20px' }}>Loading friends list...</div>
              ) : filteredFriends.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: '11px', textAlign: 'center', padding: '30px' }}>
                  No friends online matching filter.
                </div>
              ) : (
                filteredFriends.map(f => {
                  const targetX = f.raw?.pos?.x || 0;
                  const targetY = f.raw?.pos?.y || 80;
                  const targetZ = f.raw?.pos?.z || 0;
                  const dist = getDistance(targetX, targetY, targetZ);

                  return (
                    <div key={f.uid} style={{
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.15)', borderRadius: '6px',
                      padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--gold-bright)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          👥 {f.email}
                          <span style={{ fontSize: '9px', color: '#4cd964', background: 'rgba(76,217,100,0.15)', padding: '1px 5px', borderRadius: '3px' }}>
                            {dist}m away
                          </span>
                        </div>
                        <div style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>{f.raw?.bio || 'Friend'}</div>
                      </div>

                      <button
                        onClick={() => handleStartPathfinding(targetX, targetY, targetZ, f.email, '👥')}
                        style={{ background: 'rgba(57,255,20,0.18)', border: '1px solid #39ff14', color: '#39ff14', padding: '6px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        🧭 Trace Path
                      </button>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* TAB 3: COORDINATES & WAYPOINTS */}
          {activeTab === 'coords' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Custom Coordinate Target Form */}
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--slot-line)', borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: '8px' }}>
                  🎯 Target Coordinates Entry
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="number"
                    placeholder="X"
                    value={coordX}
                    onChange={e => setCoordX(Number(e.target.value))}
                    style={{ flex: 1, padding: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: '4px', fontSize: '11px' }}
                  />
                  <input
                    type="number"
                    placeholder="Y"
                    disabled={autoY}
                    value={coordY}
                    onChange={e => setCoordY(Number(e.target.value))}
                    style={{ flex: 1, padding: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: autoY ? '#777' : '#fff', borderRadius: '4px', fontSize: '11px' }}
                  />
                  <input
                    type="number"
                    placeholder="Z"
                    value={coordZ}
                    onChange={e => setCoordZ(Number(e.target.value))}
                    style={{ flex: 1, padding: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: '4px', fontSize: '11px' }}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#ccc', marginBottom: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoY}
                    onChange={e => setAutoY(e.target.checked)}
                  />
                  Auto-Detect Surface Landing Height (Prevents spawning inside solid rock)
                </label>

                <button
                  onClick={() => handleStartPathfinding(coordX, coordY, coordZ, `(${coordX}, ${coordZ})`, '🎯')}
                  style={{ width: '100%', padding: '8px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
                >
                  🚀 Calculate 3D Path to ({coordX}, {coordZ})
                </button>
              </div>

              {/* Presets & Bookmarks */}
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--slot-line)', borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: '8px' }}>
                  🏡 My Base & Farm Quick Controls
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '14px' }}>
                  <button
                    onClick={() => {
                      const updated = saveHomeBase(player.pos.x, player.pos.y, player.pos.z);
                      setWaypoints(updated);
                    }}
                    style={{ padding: '8px 10px', background: 'rgba(214,178,120,0.2)', border: '1px solid var(--gold)', color: 'var(--gold-bright)', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}
                  >
                    📍 Set Current Position as My Base 🏡
                  </button>

                  <button
                    onClick={() => {
                      const updated = saveFarm(player.pos.x, player.pos.y, player.pos.z);
                      setWaypoints(updated);
                    }}
                    style={{ padding: '8px 10px', background: 'rgba(76,217,100,0.18)', border: '1px solid #4cd964', color: '#4cd964', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}
                  >
                    📍 Set Current Position as My Farm 🌾
                  </button>
                </div>

                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: '8px' }}>
                  📍 Presets & Saved Locations
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '12px' }}>
                  <button
                    onClick={() => handleStartPathfinding(0, 80, 0, 'World Spawn', '🟢')}
                    style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    🟢 World Spawn (0, 80, 0)
                  </button>

                  <button
                    onClick={() => handleStartPathfinding(100, 75, -100, 'Northern Outpost', '🏔️')}
                    style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    🏔️ Northern Outpost (100, -100)
                  </button>
                </div>

                {/* Save Custom Waypoint */}
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff', marginBottom: '6px' }}>
                  Bookmark Custom Location:
                </div>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Waypoint Name (e.g. Secret Mineshaft)"
                    value={newWpName}
                    onChange={e => setNewWpName(e.target.value)}
                    style={{ flex: 1, padding: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: '4px', fontSize: '10px' }}
                  />
                  <button
                    onClick={handleSaveCurrentWaypoint}
                    style={{ padding: '6px 12px', background: 'rgba(76,217,100,0.18)', border: '1px solid #4cd964', color: '#4cd964', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    + Save Here
                  </button>
                </div>

                {/* Saved Waypoints List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {waypoints.length === 0 ? (
                    <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', padding: '8px' }}>No saved waypoints yet. Click "Set as My Base" or "+ Save Here" to save infinite locations!</div>
                  ) : (
                    waypoints.map(wp => (
                      <div key={wp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', padding: '6px 8px', borderRadius: '4px' }}>
                        <span style={{ fontSize: '10px', color: '#fff' }}>{wp.icon} <strong>{wp.name}</strong> ({wp.x}, {wp.y}, {wp.z})</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => handleStartPathfinding(wp.x, wp.y, wp.z, wp.name, wp.icon)}
                            style={{ background: 'rgba(57,255,20,0.18)', border: '1px solid #39ff14', color: '#39ff14', padding: '2px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            🧭 Trace Path
                          </button>
                          <button
                            onClick={() => handleDeleteWp(wp.id)}
                            style={{ background: 'rgba(255,60,60,0.2)', border: '1px solid #ff6666', color: '#ff9999', padding: '2px 6px', borderRadius: '3px', fontSize: '9px', cursor: 'pointer' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
