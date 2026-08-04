import React, { useState, useEffect, useCallback } from 'react';
import { player, game } from '../state.js';
import { surfaceHeight } from '../config.js';
import { fetchAllUsersForMaster } from '../firebase.js';
import {
  findAlternativeRoutes,
  updatePathTrail,
  setActiveNavigation,
  clearActiveNavigation,
  activeNavigation,
  getSavedWaypoints,
  saveWaypoint,
  deleteWaypoint,
  saveHomeBase,
  saveFarm,
} from '../pathfinder.js';
import { toast } from '../ui.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const STAT_COLOR = '#f2d9a0';
const WARN_COLOR = '#ff9966';
const OK_COLOR   = '#8fd06a';
const DIM_COLOR  = '#9a8a76';

function StatBadge({ label, value, color }) {
  return (
    <span style={{ fontSize: 9, color, background: 'rgba(255,255,255,0.06)', border: `1px solid ${color}44`, borderRadius: 3, padding: '1px 5px', marginRight: 4 }}>
      {label}: <strong>{value}</strong>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Card
// ─────────────────────────────────────────────────────────────────────────────
function RouteCard({ route, isSelected, onSelect, keyHint }) {
  const { label, icon, description, stats, recommended } = route;
  const hasWarnings = stats.warnings.length > 0;

  return (
    <div
      onClick={onSelect}
      style={{
        border: `2px solid ${isSelected ? '#39ff14' : recommended ? 'rgba(57,255,20,0.3)' : 'rgba(214,178,120,0.2)'}`,
        borderRadius: 8,
        padding: '10px 14px',
        cursor: 'pointer',
        background: isSelected
          ? 'rgba(57,255,20,0.10)'
          : recommended
            ? 'rgba(57,255,20,0.04)'
            : 'rgba(255,255,255,0.03)',
        transition: 'all .15s',
        position: 'relative',
      }}
    >
      {/* Key hint badge */}
      <div style={{
        position: 'absolute', top: 8, right: 10,
        fontSize: 12, fontWeight: 900,
        color: isSelected ? '#39ff14' : '#d6b278',
        background: isSelected ? 'rgba(57,255,20,0.2)' : 'rgba(214,178,120,0.12)',
        border: `1px solid ${isSelected ? '#39ff14' : 'rgba(214,178,120,0.3)'}`,
        borderRadius: 4, padding: '1px 7px', letterSpacing: 1,
      }}>
        [{keyHint}]
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#39ff14' : STAT_COLOR }}>
          {label}
        </span>
        {recommended && !isSelected && (
          <span style={{ fontSize: 8, background: 'rgba(57,255,20,0.2)', color: '#39ff14', border: '1px solid #39ff1466', borderRadius: 3, padding: '1px 5px', letterSpacing: 1 }}>
            ★ RECOMMENDED
          </span>
        )}
        {isSelected && (
          <span style={{ fontSize: 8, background: 'rgba(57,255,20,0.3)', color: '#39ff14', border: '1px solid #39ff14', borderRadius: 3, padding: '1px 5px', letterSpacing: 1 }}>
            ✓ ACTIVE
          </span>
        )}
      </div>

      {/* Description */}
      <div style={{ fontSize: 10, color: DIM_COLOR, marginBottom: 7 }}>{description}</div>

      {/* Stats row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 6 }}>
        <StatBadge label="~Dist"   value={`${stats.dist}m`}         color={STAT_COLOR} />
        <StatBadge label="Mines"   value={stats.miningCount || '0'} color={stats.miningCount > 0 ? WARN_COLOR : OK_COLOR} />
        <StatBadge label="Water"   value={stats.waterCount  || '0'} color={stats.waterCount  > 2 ? '#00e5ff'  : DIM_COLOR} />
        {stats.maxFall > 0 && (
          <StatBadge label="Max fall" value={`${stats.maxFall}blk`} color={stats.maxFall > 4 ? '#ff4444' : WARN_COLOR} />
        )}
        {stats.maxShaft > 0 && (
          <StatBadge label="Shaft" value={`${stats.maxShaft}blk`} color={WARN_COLOR} />
        )}
      </div>

      {/* Warnings */}
      {hasWarnings && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {stats.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 9, color: WARN_COLOR, display: 'flex', alignItems: 'center', gap: 4 }}>
              {w}
            </div>
          ))}
        </div>
      )}
      {!hasWarnings && (
        <div style={{ fontSize: 9, color: OK_COLOR }}>✓ No hazards detected</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Modal
// ─────────────────────────────────────────────────────────────────────────────
export default function WayfinderModal({ currentUser, onClose }) {
  const [activeTab, setActiveTab] = useState('nexus');
  const [searchQuery, setSearchQuery]   = useState('');
  const [playersList, setPlayersList]   = useState([]);
  const [loading, setLoading]           = useState(true);

  // Route state
  const [pendingRoutes, setPendingRoutes] = useState(null);   // array of route objects, or null
  const [calculating, setCalculating]     = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [pendingLabel, setPendingLabel]   = useState('');

  // Coordinate inputs
  const [coordX, setCoordX] = useState(Math.floor(player.pos.x));
  const [coordY, setCoordY] = useState(Math.floor(player.pos.y));
  const [coordZ, setCoordZ] = useState(Math.floor(player.pos.z));
  const [autoY, setAutoY]   = useState(true);

  // Waypoints
  const [waypoints, setWaypoints] = useState(getSavedWaypoints());
  const [newWpName, setNewWpName] = useState('');

  // Fetch players
  useEffect(() => {
    fetchAllUsersForMaster()
      .then(list => setPlayersList(list || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  // Release pointer lock + capture Escape on mount
  useEffect(() => {
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch(e) {}
    }

    const handleEsc = (e) => {
      if (e.code === 'Escape' || e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        // If showing route picker, go back instead of closing entirely
        if (pendingRoutes) { setPendingRoutes(null); setCalculating(false); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc, true);
    return () => window.removeEventListener('keydown', handleEsc, true);
  }, [onClose, pendingRoutes]);

  // Number-key route selection (1/2/3) when routes are visible
  useEffect(() => {
    if (!pendingRoutes) return;
    const handleKey = (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 3) {
        const r = pendingRoutes.find(r => r.id === n);
        if (r) activateRoute(r);
      }
    };
    window.addEventListener('keydown', handleKey, false);
    return () => window.removeEventListener('keydown', handleKey, false);
  }, [pendingRoutes]);

  const getDistance = (tx, ty, tz) => {
    const dx = tx - player.pos.x, dy = ty - player.pos.y, dz = tz - player.pos.z;
    return Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
  };

  // ── Compute all 3 route alternatives ──────────────────────────────────────
  const handleStartPathfinding = useCallback((targetX, targetY, targetZ, label = 'Destination', icon = '📍') => {
    let finalY = Math.floor(targetY);
    if (autoY) finalY = surfaceHeight(Math.floor(targetX), Math.floor(targetZ)) + 1;

    setCalculating(true);
    setPendingRoutes(null);
    setSelectedRouteId(null);
    setPendingLabel(`${icon} ${label}`);

    // Defer to next tick so React can render the loading spinner first
    setTimeout(() => {
      const startPos  = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
      const targetPos = { x: targetX, y: finalY, z: targetZ };

      toast(`🧭 Analysing 3 route options to ${label}…`);
      const routes = findAlternativeRoutes(startPos, targetPos);

      if (!routes || routes.length === 0) {
        toast(`⚠️ No path found to ${label}. Destination may be unreachable.`);
        setCalculating(false);
        return;
      }

      // Tag each route with navigation metadata for later activation
      routes.forEach(r => {
        r._targetName = label;
        r._targetIcon = icon;
        r._targetPos  = targetPos;
        r._dist       = getDistance(targetX, finalY, targetZ);
      });

      setCalculating(false);
      setPendingRoutes(routes);
      // Auto-select the recommended route
      const rec = routes.find(r => r.recommended) ?? routes[0];
      setSelectedRouteId(rec.id);
    }, 50);
  }, [autoY]);

  // ── Activate a chosen route ────────────────────────────────────────────────
  const activateRoute = useCallback((route) => {
    updatePathTrail(route.path);
    setActiveNavigation({
      targetName:  route._targetName,
      targetPos:   route._targetPos,
      targetIcon:  route._targetIcon,
      pathNodes:   route.path,
      distance:    route._dist,
      routeLabel:  route.label,
    });
    toast(`${route.icon} ${route.label} activated — follow the glowing blocks! (ESC to exit pathfinding)`);
    onClose();
  }, [onClose]);

  const handleStopPathfinding = () => {
    clearActiveNavigation();
    toast('🛑 Navigation cancelled.');
  };

  const handleSaveCurrentWaypoint = () => {
    if (!newWpName.trim()) return toast('Please enter a waypoint name!');
    const updated = saveWaypoint(newWpName.trim(), player.pos.x, player.pos.y, player.pos.z, '📍');
    setWaypoints(updated); setNewWpName('');
  };

  const handleDeleteWp = (id) => {
    setWaypoints(deleteWaypoint(id));
  };

  // Merged players
  const mergedPlayers = (game.otherPlayersList || []).map(p => ({
    uid: p.uid || p.id,
    email: p.email || p.username || 'Nexus Player',
    isOnline: true, pos: p.pos || { x:0, y:80, z:0 }, role: p.role || 'player',
  }));

  const filteredNexus   = mergedPlayers.filter(p => p.uid !== currentUser?.uid && p.email.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredFriends = playersList.filter(p => {
    if (p.uid === currentUser?.uid) return false;
    const q = searchQuery.toLowerCase();
    return (p.raw?.isFriend || p.role === 'admin' || p.role === 'master') &&
           (p.email.toLowerCase().includes(q) || (p.raw?.bio || '').toLowerCase().includes(q));
  });

  // ── Route picker overlay (shown after calculation) ────────────────────────
  const showRoutePicker = !calculating && pendingRoutes !== null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'rgba(20,15,10,0.98)', border: '2px solid var(--gold)', borderRadius: 12,
        width: '100%', maxWidth: 640, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 70px rgba(0,0,0,0.9)', overflow: 'hidden', color: '#f0e6d2',
      }}>

        {/* ── Header ── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(214,178,120,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, color: 'var(--gold-bright)', fontWeight: 'bold', letterSpacing: 1 }}>
              🧭 {showRoutePicker ? `Route Options — ${pendingLabel}` : 'WHERE DO YOU WANNA GO?'}
            </h2>
            <div style={{ fontSize: 9, color: '#9a8a76', marginTop: 2 }}>
              {showRoutePicker
                ? 'Press [1] [2] [3] or click a route to activate it'
                : 'Smart 3D Voxel Pathfinder • 2-block clearance • Edge case detection'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {showRoutePicker && (
              <button onClick={() => { setPendingRoutes(null); setCalculating(false); }}
                style={{ background: 'rgba(214,178,120,0.15)', border: '1px solid var(--gold)', color: 'var(--gold-bright)', padding: '5px 12px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>
                ← Back
              </button>
            )}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: 20, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* ── Active Navigation Banner ── */}
        {activeNavigation && (
          <div style={{ background: 'rgba(57,255,20,0.10)', borderBottom: '1px solid rgba(57,255,20,0.35)', padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: '#39ff14', fontWeight: 'bold' }}>
              🟢 NAVIGATING: {activeNavigation.targetIcon} {activeNavigation.targetName}
              <span style={{ fontSize: 9, color: '#aaa', fontWeight: 'normal', marginLeft: 6 }}>
                {activeNavigation.routeLabel} • {activeNavigation.distance}m away • Press ESC to cancel
              </span>
            </div>
            <button onClick={handleStopPathfinding}
              style={{ background: 'rgba(255,60,60,0.2)', border: '1px solid #ff6666', color: '#ff9999', padding: '3px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontWeight: 'bold' }}>
              🛑 Cancel
            </button>
          </div>
        )}

        {/* ── Calculating spinner ── */}
        {calculating && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(57,255,20,0.2)', borderTopColor: '#39ff14', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <div style={{ color: '#39ff14', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>Calculating 3 route options…</div>
            <div style={{ color: DIM_COLOR, fontSize: 10 }}>Checking clearances, hazards &amp; alternatives</div>
          </div>
        )}

        {/* ── Route Picker ── */}
        {showRoutePicker && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Keyboard hint */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 4 }}>
              {[1,2,3].map(n => (
                <div key={n} style={{ fontSize: 11, color: pendingRoutes.find(r=>r.id===n) ? '#d6b278' : '#555', background: pendingRoutes.find(r=>r.id===n) ? 'rgba(214,178,120,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${pendingRoutes.find(r=>r.id===n) ? 'rgba(214,178,120,0.3)' : '#333'}`, borderRadius: 4, padding: '3px 10px' }}>
                  {pendingRoutes.find(r=>r.id===n) ? `Press ${n}` : `—`}
                </div>
              ))}
            </div>

            {pendingRoutes.map(route => (
              <RouteCard
                key={route.id}
                route={route}
                isSelected={selectedRouteId === route.id}
                keyHint={route.id}
                onSelect={() => {
                  setSelectedRouteId(route.id);
                  activateRoute(route);
                }}
              />
            ))}

            {/* Activate button */}
            <button
              onClick={() => {
                const r = pendingRoutes.find(r => r.id === selectedRouteId);
                if (r) activateRoute(r);
              }}
              style={{
                marginTop: 6, width: '100%', padding: '10px', background: 'var(--gold)',
                color: '#000', border: 'none', borderRadius: 6, fontWeight: 'bold',
                fontSize: 12, cursor: 'pointer', letterSpacing: 1,
              }}
            >
              🚀 START SELECTED ROUTE [{selectedRouteId}]
            </button>

            {/* Edge-case legend */}
            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(214,178,120,0.1)', borderRadius: 6, padding: '10px 14px', fontSize: 9, color: DIM_COLOR, lineHeight: 2 }}>
              <strong style={{ color: '#d6b278' }}>Glowing Block colors:</strong>
              &nbsp;🟢 Safe Walkable &nbsp;🟠 Requires Mining &nbsp;🔵 Water Swim &nbsp;🟡 Target &nbsp;|&nbsp;
              Press <strong>ESC</strong> to exit pathfinding and return to normal mode.
            </div>
          </div>
        )}

        {/* ── Normal tabs (only shown when not in route picker / calculating) ── */}
        {!calculating && !showRoutePicker && (
          <>
            {/* Tabs */}
            <div className="dashboard-tabs" style={{ flexShrink: 0, marginBottom: 0, padding: '10px 20px 0 20px' }}>
              <button className={`dash-tab ${activeTab === 'nexus'   ? 'active' : ''}`} onClick={() => setActiveTab('nexus')}>🌐 Nexus ({filteredNexus.length})</button>
              <button className={`dash-tab ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => setActiveTab('friends')}>👥 Friends ({filteredFriends.length})</button>
              <button className={`dash-tab ${activeTab === 'coords'  ? 'active' : ''}`} onClick={() => setActiveTab('coords')}>📍 Coordinates &amp; Bookmarks</button>
            </div>

            {/* Search (Nexus / Friends) */}
            {(activeTab === 'nexus' || activeTab === 'friends') && (
              <div style={{ padding: '10px 20px 4px 20px', flexShrink: 0 }}>
                <input
                  type="text"
                  placeholder={activeTab === 'nexus' ? '🔍 Search online players…' : '🔍 Search friends…'}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '7px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', fontSize: 11 }}
                />
              </div>
            )}

            {/* Tab content */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* TAB 1: NEXUS PLAYERS */}
              {activeTab === 'nexus' && (
                filteredNexus.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 11, textAlign: 'center', padding: 30 }}>No other online players in Nexus right now.</div>
                ) : filteredNexus.map(p => {
                  const dist = getDistance(p.pos.x, p.pos.y, p.pos.z);
                  return (
                    <div key={p.uid} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                          🟢 {p.email}
                          <span style={{ fontSize: 9, color: 'var(--gold)', background: 'rgba(214,178,120,0.2)', padding: '1px 5px', borderRadius: 3 }}>{dist}m away</span>
                        </div>
                        <div style={{ fontSize: 9, color: '#aaa', marginTop: 2 }}>Pos: ({Math.floor(p.pos.x)}, {Math.floor(p.pos.y)}, {Math.floor(p.pos.z)})</div>
                      </div>
                      <button onClick={() => handleStartPathfinding(p.pos.x, p.pos.y, p.pos.z, p.email, '👤')}
                        style={{ background: 'rgba(57,255,20,0.18)', border: '1px solid #39ff14', color: '#39ff14', padding: '6px 12px', borderRadius: 4, fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}>
                        🧭 Find Routes
                      </button>
                    </div>
                  );
                })
              )}

              {/* TAB 2: FRIENDS */}
              {activeTab === 'friends' && (
                loading ? (
                  <div style={{ color: 'var(--gold)', fontSize: 11, textAlign: 'center', padding: 20 }}>Loading friends list…</div>
                ) : filteredFriends.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 11, textAlign: 'center', padding: 30 }}>No friends matching filter.</div>
                ) : filteredFriends.map(f => {
                  const tx = f.raw?.pos?.x || 0, ty = f.raw?.pos?.y || 80, tz = f.raw?.pos?.z || 0;
                  const dist = getDistance(tx, ty, tz);
                  return (
                    <div key={f.uid} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.15)', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--gold-bright)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          👥 {f.email}
                          <span style={{ fontSize: 9, color: '#4cd964', background: 'rgba(76,217,100,0.15)', padding: '1px 5px', borderRadius: 3 }}>{dist}m away</span>
                        </div>
                        <div style={{ fontSize: 9, color: '#aaa', marginTop: 2 }}>{f.raw?.bio || 'Friend'}</div>
                      </div>
                      <button onClick={() => handleStartPathfinding(tx, ty, tz, f.email, '👥')}
                        style={{ background: 'rgba(57,255,20,0.18)', border: '1px solid #39ff14', color: '#39ff14', padding: '6px 12px', borderRadius: 4, fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}>
                        🧭 Find Routes
                      </button>
                    </div>
                  );
                })
              )}

              {/* TAB 3: COORDINATES & BOOKMARKS */}
              {activeTab === 'coords' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Custom coordinate entry */}
                  <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--slot-line)', borderRadius: 6, padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: 8 }}>🎯 Target Coordinates</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {[['X', coordX, setCoordX], ['Y', coordY, setCoordY], ['Z', coordZ, setCoordZ]].map(([lbl, val, setter]) => (
                        <input key={lbl} type="number" placeholder={lbl} value={val}
                          onChange={e => setter(Number(e.target.value))}
                          disabled={lbl === 'Y' && autoY}
                          style={{ flex: 1, padding: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: (lbl === 'Y' && autoY) ? '#777' : '#fff', borderRadius: 4, fontSize: 11 }} />
                      ))}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#ccc', marginBottom: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={autoY} onChange={e => setAutoY(e.target.checked)} />
                      Auto-detect surface landing height
                    </label>
                    <button onClick={() => handleStartPathfinding(coordX, coordY, coordZ, `(${coordX}, ${coordZ})`, '🎯')}
                      style={{ width: '100%', padding: 8, background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 'bold', fontSize: 11, cursor: 'pointer' }}>
                      🚀 Find Routes to ({coordX}, {coordZ})
                    </button>
                  </div>

                  {/* Base & Farm quick set */}
                  <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--slot-line)', borderRadius: 6, padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: 8 }}>🏡 Base &amp; Farm</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 14 }}>
                      <button onClick={() => setWaypoints(saveHomeBase(player.pos.x, player.pos.y, player.pos.z))}
                        style={{ padding: '8px 10px', background: 'rgba(214,178,120,0.2)', border: '1px solid var(--gold)', color: 'var(--gold-bright)', borderRadius: 6, fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}>
                        📍 Mark Here as My Base 🏡
                      </button>
                      <button onClick={() => setWaypoints(saveFarm(player.pos.x, player.pos.y, player.pos.z))}
                        style={{ padding: '8px 10px', background: 'rgba(76,217,100,0.18)', border: '1px solid #4cd964', color: '#4cd964', borderRadius: 6, fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}>
                        📍 Mark Here as My Farm 🌾
                      </button>
                    </div>

                    {/* Preset buttons */}
                    <div style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: 8 }}>📍 Presets</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, marginBottom: 12 }}>
                      <button onClick={() => handleStartPathfinding(0, 80, 0, 'World Spawn', '🟢')}
                        style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: 4, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>
                        🟢 World Spawn (0, 80, 0)
                      </button>
                      <button onClick={() => handleStartPathfinding(100, 75, -100, 'Northern Outpost', '🏔️')}
                        style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: 4, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>
                        🏔️ Northern Outpost
                      </button>
                    </div>

                    {/* Save custom waypoint */}
                    <div style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', marginBottom: 6 }}>Bookmark Current Location:</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      <input type="text" placeholder="Waypoint name (e.g. Secret Mineshaft)" value={newWpName}
                        onChange={e => setNewWpName(e.target.value)}
                        style={{ flex: 1, padding: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: 4, fontSize: 10 }} />
                      <button onClick={handleSaveCurrentWaypoint}
                        style={{ padding: '6px 12px', background: 'rgba(76,217,100,0.18)', border: '1px solid #4cd964', color: '#4cd964', borderRadius: 4, fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}>
                        + Save
                      </button>
                    </div>

                    {/* Saved waypoints */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {waypoints.length === 0 ? (
                        <div style={{ fontSize: 10, color: '#888', textAlign: 'center', padding: 8 }}>No saved waypoints yet.</div>
                      ) : waypoints.map(wp => (
                        <div key={wp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', padding: '6px 8px', borderRadius: 4 }}>
                          <span style={{ fontSize: 10, color: '#fff' }}>{wp.icon} <strong>{wp.name}</strong> ({wp.x}, {wp.y}, {wp.z})</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => handleStartPathfinding(wp.x, wp.y, wp.z, wp.name, wp.icon)}
                              style={{ background: 'rgba(57,255,20,0.18)', border: '1px solid #39ff14', color: '#39ff14', padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 'bold', cursor: 'pointer' }}>
                              🧭 Routes
                            </button>
                            <button onClick={() => handleDeleteWp(wp.id)}
                              style={{ background: 'rgba(255,60,60,0.2)', border: '1px solid #ff6666', color: '#ff9999', padding: '2px 6px', borderRadius: 3, fontSize: 9, cursor: 'pointer' }}>
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
