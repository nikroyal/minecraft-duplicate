import React, { useState, useEffect, useMemo } from 'react';
import { player, game, world, inventory, hotbar, reactBridge } from '../state.js';
import { getBlock } from '../world.js';
import { isSolid } from '../config.js';
import { respawnPlayer, invCount, addItem } from '../player.js';
import { 
  resolveSyncConflict, subscribeToUserDoc, subscribeToWorldSettings, updateUserDocInFirestore,
  subscribeToRoomWorld, subscribeToRoomPresence, subscribeToUserInvites
} from '../firebase.js';
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
import PlayerDirectoryModal from './PlayerDirectoryModal.jsx';
import WayfinderModal from './WayfinderModal.jsx';
import OnboardingAgentModal from './OnboardingAgentModal.jsx';
import ChatPanel from './ChatPanel.jsx';
import DailyLoginModal from './DailyLoginModal.jsx';
import NotificationCenterModal from './NotificationCenterModal.jsx';
import ErrorConsoleModal from './ErrorConsoleModal.jsx';
import { activeNavigation, clearActiveNavigation } from '../pathfinder.js';
import { toggleAmbientBGM } from '../audio.js';
import { 
  uiState, setChestOpen, setFurnaceOpen, setOnboardingOpen, setActiveChestCoords, setActiveFurnaceCoords,
  closeCraft, closeChest, closeFurnace, scheduleSave, craft, updateLobbyAvatarPreview, toast, deathCause,
  lastAuthStatus, lastSyncConflict, activeAchievementNotification
} from '../ui.js';

export default function App() {
  const [tick, setTick] = useState(0);
  const [showWayfinder, setShowWayfinder] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showChatSidePanel, setShowChatSidePanel] = useState(false);
  const [chatTargetUser, setChatTargetUser] = useState(null);
  const [showErrorConsole, setShowErrorConsole] = useState(false);

  useEffect(() => {
    window.__toggleErrorConsole = () => {
      setShowErrorConsole(prev => !prev);
    };
    window.__openErrorConsole = () => {
      setShowErrorConsole(true);
    };
    window.__toggleWayfinder = () => {
      setShowWayfinder(prev => {
        const next = !prev;
        uiState.wayfinderOpen = next;
        return next;
      });
    };
    window.__closeWayfinder = () => {
      uiState.wayfinderOpen = false;
      setShowWayfinder(false);
    };
    window.__openOnboarding = () => {
      setOnboardingOpen(true);
      setShowOnboarding(true);
    };
    window.__openChatSidePanel = (targetUser = null) => {
      if (targetUser) setChatTargetUser(targetUser);
      setShowChatSidePanel(true);
      uiState.chatOpen = true;
    };
    window.__closeChatSidePanel = () => {
      setShowChatSidePanel(false);
      uiState.chatOpen = false;
    };
    return () => {
      window.__toggleWayfinder = null;
      window.__closeWayfinder = null;
      window.__openOnboarding = null;
      window.__openChatSidePanel = null;
      window.__closeChatSidePanel = null;
    };
  }, []);

  // Auth
  const [authStatus, setAuthStatus] = useState('connecting');
  const [syncMsg, setSyncMsg] = useState('Connecting to Firebase...');
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('player');
  const [conflictData, setConflictData] = useState(null);

  // Messages & Broadcasts
  const [userMessages, setUserMessages] = useState([]);
  const [latestBroadcastBanner, setLatestBroadcastBanner] = useState(null);

  // Retention Modals State
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [bgmActive, setBgmActive] = useState(false);

  // Notification Center & Requests State
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState([]);
  const [incomingRoomInvites, setIncomingRoomInvites] = useState([]);
  const [sideNotificationPopup, setSideNotificationPopup] = useState(null);
  const [autoPilotArrival, setAutoPilotArrival] = useState(null);

  useEffect(() => {
    window.__onAutoPilotArrival = (name, icon) => {
      setAutoPilotArrival({ name, icon, id: Date.now() });
      setTimeout(() => {
        setAutoPilotArrival(null);
      }, 5500);
    };
    return () => {
      window.__onAutoPilotArrival = null;
    };
  }, []);

  // Check if current user is a Master Admin Account (strictly based on Firestore document 'role' field)
  const isMasterAccount = userRole === 'admin' || userRole === 'master';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        Object.defineProperty(window, '__userRole', {
          get: () => userRole,
          configurable: true
        });
      } catch (e) {
        window.__userRole = userRole;
      }
    }
  }, [userRole]);

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

  // Real-time Room World Subscription (for Public Nexus & Team Rooms)
  useEffect(() => {
    if (!game.running || !game.activeRoomId) return;
    const unsubRoom = subscribeToRoomWorld(game.activeRoomId, (roomData) => {
      if (!roomData) return;
      if (roomData.deleted) {
        toast("ℹ️ This team room was closed by an admin. Transitioning to Lobby...");
        if (document.pointerLockElement) {
          try { document.exitPointerLock(); } catch(e){}
        }
        game.running = false;
        game.paused = false;
        game.mode = 'singleplayer';
        game.activeRoomId = null;
        game.activeRoomInfo = null;
        if (typeof window.__clearOtherPlayerMeshes === 'function') {
          window.__clearOtherPlayerMeshes();
        }
        forceUpdate();
        return;
      }
      if (!roomData.edits) return;
      for (const k in roomData.edits) {
        if (world.edits[k] !== roomData.edits[k]) {
          world.edits[k] = roomData.edits[k];
          const [wx, wy, wz] = k.split(',').map(Number);
          const cx = Math.floor(wx / 16), cz = Math.floor(wz / 16);
          const ch = world.chunks.get(`${cx},${cz}`);
          if (ch && ch.generated) ch.dirty = true;
        }
      }
    });

    const unsubPresence = subscribeToRoomPresence(game.activeRoomId, (presenceList) => {
      game.otherPlayersList = presenceList || [];
    });

    return () => {
      unsubRoom();
      unsubPresence();
    };
  }, [game.running, game.activeRoomId]);

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

    // Auto-open Daily Rewards modal on first daily login
    try {
      const todayStr = new Date().toDateString();
      const lastLogin = localStorage.getItem('voxel_daily_last_date');
      if (lastLogin !== todayStr) {
        setShowDailyModal(true);
        localStorage.setItem('voxel_daily_last_date', todayStr);
      }
    } catch (e) {}

    // 2. Subscribe to User Document (Freeze, Teleport, Give Items, Heal, Messages, Kick, Ban, Mute)
    const unsubUser = subscribeToUserDoc(currentUser.uid, (userData) => {
      if (!userData) return;

      // Banned account check
      if (userData.banned && !(userRole === 'admin' || userRole === 'master')) {
        game.running = false;
        game.paused = false;
        if (document.pointerLockElement) document.exitPointerLock();
        toast("⛔ Account banned by Administrator.");
        setAuthStatus('signedOut');
        setCurrentUser(null);
        return;
      }

      // Kick signal check
      if (userData.kickSignal && userData.kickSignal !== window.__lastKickSignal && !(userRole === 'admin' || userRole === 'master')) {
        window.__lastKickSignal = userData.kickSignal;
        game.running = false;
        game.paused = false;
        if (document.pointerLockElement) document.exitPointerLock();
        toast("⚠️ You were kicked from the session by an Admin.");
      }

      // Muted status
      if (typeof window !== 'undefined') {
        window.__userMuted = Boolean(userData.muted);
      }

      // Frozen status
      player.frozen = Boolean(userData.frozen);

      // Messages
      if (Array.isArray(userData.messages)) {
        setUserMessages(userData.messages);
      }

      // Friend Requests & Room Invites Sync + Side Popup Trigger
      const reqs = Array.isArray(userData.friendRequests) ? userData.friendRequests : [];
      const invs = Array.isArray(userData.invites) ? userData.invites : [];

      setIncomingFriendRequests(prev => {
        if (reqs.length > prev.length && reqs.length > 0) {
          const newest = reqs[reqs.length - 1];
          setSideNotificationPopup({
            id: Date.now(),
            title: '📩 New Friend Request!',
            body: `${newest.senderEmail || 'A player'} wants to add you as a friend.`
          });
        }
        return reqs;
      });

      setIncomingRoomInvites(prev => {
        if (invs.length > prev.length && invs.length > 0) {
          const newest = invs[invs.length - 1];
          setSideNotificationPopup({
            id: Date.now(),
            title: '✉️ New Team Room Invite!',
            body: `${newest.senderEmail || 'A player'} invited you to join '${newest.roomName || 'World Room'}'.`
          });
        }
        return invs;
      });

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
        player.health = Math.min(20, userData.healthOverride);
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

    let lastCoords = '', lastClock = '', lastTarget = null, lastFpsVal = 0, lastTickTime = 0;

    reactBridge.updateUI = () => {
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

      // Throttle React state re-rendering tick to max 10 Hz (every 100ms) so 60 FPS render loop isn't choked by React DOM diffs
      const now = performance.now();
      if (now - lastTickTime >= 100) {
        lastTickTime = now;
        setTick(t => t + 1);
      }
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

  const [showPlayerDirectory, setShowPlayerDirectory] = useState(false);
  const [incomingInvites, setIncomingInvites] = useState([]);

  // Subscribe to User Room Invites
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    const unsub = subscribeToUserInvites(currentUser.uid, (invites) => {
      setIncomingInvites(invites || []);
    });
    return () => unsub();
  }, [currentUser]);

  const showOverlay = !game.running;
  const showConnecting = showOverlay && authStatus === 'connecting';
  const showAuth = showOverlay && authStatus === 'logged_out';
  const showLobby = showOverlay && (authStatus === 'logged_in' || authStatus === 'unconfigured') && !isMasterAccount;
  const showMaster = showOverlay && authStatus === 'logged_in' && isMasterAccount;
  const showPaused = game.running && game.paused && !uiState?.craftOpen && !uiState?.chestOpen && !uiState?.furnaceOpen;

  return (
    <>
      {/* AUTH / LOBBY / MASTER / CONNECTING OVERLAY */}
      {showOverlay && (
        <div id="overlay">
          {showConnecting && (
            <div className="card" id="connectingCard" style={{ maxWidth: '440px', width: '90vw', padding: '35px 30px' }}>
              <h1>VOXEL</h1>
              <div className="tag">A MULTIPLAYER VOXEL WORLD</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', margin: '24px 0 10px 0' }}>
                <div style={{
                  width: '32px', height: '32px', border: '3px solid rgba(214, 178, 120, 0.2)',
                  borderTopColor: 'var(--gold-bright)', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                }} />
                <div style={{ fontSize: '12px', color: '#d8caae', letterSpacing: '1px', fontWeight: 600 }}>
                  {syncMsg || 'Connecting to Firebase...'}
                </div>
              </div>
            </div>
          )}
          {showAuth && <AuthCard />}
          {showMaster && (
            <MasterDashboardCard userEmail={currentUser?.email || 'Master Admin'} />
          )}
          {showLobby && (
            <LobbyCard
              userEmail={currentUser?.email || 'Offline Player'}
              userRole={userRole}
              currentUser={currentUser}
              syncStatus={syncMsg}
              scheduleSave={scheduleSave}
              notificationsCount={incomingFriendRequests.length + incomingRoomInvites.length}
              onOpenNotifications={() => setShowNotificationsModal(true)}
              onOpenDirectory={() => setShowPlayerDirectory(true)}
              onOpenDailyRewards={() => setShowDailyModal(true)}
              onOpenCosmetics={() => setShowCosmeticsModal(true)}
              onStartGame={() => {
                game.running = true;
                game.paused = false;
                for (const ch of world.chunks.values()) {
                  ch.dirty = true;
                }
                initAudio();
                if (typeof window !== 'undefined' && localStorage.getItem("hasCompletedOnboarding_v1") !== "true") {
                  setOnboardingOpen(true);
                  setShowOnboarding(true);
                }
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

      {/* PLAYER DIRECTORY MODAL */}
      {showPlayerDirectory && (
        <PlayerDirectoryModal
          currentUser={currentUser}
          onClose={() => setShowPlayerDirectory(false)}
          onOpenChatWithUser={(user) => {
            setChatTargetUser(user);
            setShowChatSidePanel(true);
            uiState.chatOpen = true;
          }}
        />
      )}

      {/* WAYFINDER MODAL */}
      {showWayfinder && (
        <WayfinderModal
          currentUser={currentUser}
          onClose={() => {
            uiState.wayfinderOpen = false;
            setShowWayfinder(false);
            // Re-engage game after closing
            if (game.running && !game.paused) {
              setTimeout(() => {
                try {
                  const el = document.getElementById('game');
                  if (el) { const p = el.requestPointerLock(); if (p && typeof p.catch === 'function') p.catch(() => {}); }
                } catch(e) {}
              }, 80);
            } else if (game.running) {
              game.paused = true;
            }
          }}
        />
      )}

      {/* INCOMING ROOM INVITES BANNER */}
      {incomingInvites.length > 0 && (
        <div style={{
          position: 'fixed', top: '16px', right: '16px', zIndex: 110,
          background: 'rgba(20,16,10,0.95)', border: '1px solid var(--gold)', borderRadius: '8px',
          padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 8px 30px rgba(0,0,0,0.7)'
        }}>
          {incomingInvites.map(inv => (
            <div key={inv.id} style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold-bright)' }}>✉️ Room Invitation</div>
              <div style={{ fontSize: '10px', color: '#fff', margin: '3px 0' }}>
                <strong>{inv.senderEmail}</strong> invited you to join <strong>{inv.roomName}</strong>!
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <button
                  onClick={() => {
                    game.mode = 'room';
                    game.activeRoomId = inv.roomId;
                    game.activeRoomInfo = { id: inv.roomId, name: inv.roomName };
                    game.running = true;
                    game.paused = false;
                    initAudio();
                    toast(`Joined '${inv.roomName}'!`);
                    setIncomingInvites(prev => prev.filter(i => i.id !== inv.id));
                    forceUpdate();
                  }}
                  style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Accept & Join
                </button>
                <button
                  onClick={() => setIncomingInvites(prev => prev.filter(i => i.id !== inv.id))}
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#aaa', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', cursor: 'pointer' }}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ACTIVE AUTO-PILOT & NAVIGATION HUD BAR */}
      {game.running && !game.paused && activeNavigation && (
        <div style={{
          position: 'fixed', top: '18px', left: '50%', transform: 'translateX(-50%)', zIndex: 95,
          background: activeNavigation.autoPilot
            ? 'linear-gradient(135deg, rgba(10,30,10,0.95), rgba(15,45,15,0.95))'
            : 'rgba(20, 16, 10, 0.92)',
          border: `2px solid ${activeNavigation.autoPilot ? '#39ff14' : 'var(--gold)'}`,
          borderRadius: '30px', padding: '8px 22px',
          display: 'flex', alignItems: 'center', gap: '12px',
          boxShadow: activeNavigation.autoPilot ? '0 0 30px rgba(57,255,20,0.45)' : '0 8px 30px rgba(0,0,0,0.7)',
          color: '#fff', backdropFilter: 'blur(6px)', pointerEvents: 'auto'
        }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: activeNavigation.autoPilot ? '#39ff14' : 'var(--gold)',
            boxShadow: `0 0 10px ${activeNavigation.autoPilot ? '#39ff14' : 'var(--gold)'}`,
            animation: 'pulse 1.2s infinite'
          }} />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '12px', fontWeight: '900', color: activeNavigation.autoPilot ? '#39ff14' : 'var(--gold-bright)', letterSpacing: '0.5px' }}>
              {activeNavigation.autoPilot ? '🤖 AUTO-PILOT ACTIVE' : '🧭 NAVIGATING'}
            </span>
            <span style={{ fontSize: '10px', color: '#ccc' }}>
              {activeNavigation.targetIcon} <strong>{activeNavigation.targetName}</strong> • {activeNavigation.distance}m away
            </span>
          </div>

          <button
            onClick={() => {
              activeNavigation.autoPilot = !activeNavigation.autoPilot;
              toast(activeNavigation.autoPilot ? '🤖 Auto-Pilot ON' : '🧭 Auto-Pilot OFF (Manual Control)');
              forceUpdate();
            }}
            style={{
              background: activeNavigation.autoPilot ? 'rgba(57,255,20,0.2)' : 'rgba(255,255,255,0.1)',
              border: `1px solid ${activeNavigation.autoPilot ? '#39ff14' : '#888'}`,
              color: activeNavigation.autoPilot ? '#39ff14' : '#fff',
              padding: '4px 10px', borderRadius: '14px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
            }}
          >
            {activeNavigation.autoPilot ? '🤖 Auto-Pilot: ON' : '🎮 Auto-Pilot: OFF'}
          </button>

          <button
            onClick={() => {
              clearActiveNavigation();
              toast('🛑 Navigation cancelled. Returned to normal mode.');
              forceUpdate();
            }}
            style={{
              background: 'rgba(255,60,60,0.2)', border: '1px solid #ff6666', color: '#ff9999',
              padding: '4px 10px', borderRadius: '14px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
            }}
          >
            🛑 Exit (ESC)
          </button>
        </div>
      )}

      {/* DESTINATION REACHED CELEBRATION BANNER */}
      {autoPilotArrival && (
        <div style={{
          position: 'fixed', top: '28%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 130,
          background: 'linear-gradient(135deg, rgba(15,35,15,0.96), rgba(8,20,8,0.96))',
          border: '3px solid #39ff14', borderRadius: '18px', padding: '24px 40px', textAlign: 'center',
          boxShadow: '0 0 60px rgba(57,255,20,0.6)', color: '#fff', backdropFilter: 'blur(10px)'
        }}>
          <div style={{ fontSize: '44px', marginBottom: '4px' }}>🎉</div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#39ff14', letterSpacing: '1px', textShadow: '0 0 12px rgba(57,255,20,0.5)' }}>
            DESTINATION REACHED!
          </div>
          <div style={{ fontSize: '14px', color: '#f0e6d2', marginTop: '8px' }}>
            You have arrived safely at <strong>{autoPilotArrival.icon} {autoPilotArrival.name}</strong>
          </div>
          <div style={{
            fontSize: '11px', color: '#8fd06a', marginTop: '14px',
            background: 'rgba(57,255,20,0.15)', border: '1px solid rgba(57,255,20,0.3)',
            padding: '5px 14px', borderRadius: '10px', display: 'inline-block', fontWeight: 'bold'
          }}>
            🤖 Auto-Pilot Mode Exited • Manual Gameplay Restored
          </div>
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
                  setOnboardingOpen(true);
                  setShowOnboarding(true);
                }}
                style={{
                  background: 'rgba(214,178,120,0.18)',
                  border: '1px solid rgba(214,178,120,0.5)',
                  color: '#f5d77f',
                  padding: '10px 24px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: 1,
                  transition: 'all 0.2s',
                }}
              >
                📖 REPLAY SURVIVAL GUIDE
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
            notificationsCount={incomingFriendRequests.length + incomingRoomInvites.length}
            unreadChatCount={0}
            bgmActive={bgmActive}
            onToggleBGM={() => {
              const playing = toggleAmbientBGM();
              setBgmActive(playing);
              toast(playing ? "🎵 Ambient Background Music Started!" : "🔇 Background Music Muted.");
            }}
            onOpenNotifications={() => {
              if (document.pointerLockElement) document.exitPointerLock();
              setShowNotificationsModal(true);
            }}
            onOpenChat={() => {
              if (document.pointerLockElement) document.exitPointerLock();
              setShowChatSidePanel(prev => {
                const next = !prev;
                uiState.chatOpen = next;
                return next;
              });
            }}
            onOpenErrorConsole={() => {
              if (document.pointerLockElement) document.exitPointerLock();
              setShowErrorConsole(true);
            }}
          />

        </>
      )}

      {/* DAILY LOGIN REWARDS MODAL */}
      {showDailyModal && (
        <DailyLoginModal
          currentUser={currentUser}
          onClose={() => setShowDailyModal(false)}
        />
      )}

      {/* NOTIFICATION CENTER MODAL */}
      {showNotificationsModal && (
        <NotificationCenterModal
          currentUser={currentUser}
          friendRequests={incomingFriendRequests}
          roomInvites={incomingRoomInvites}
          onClose={() => setShowNotificationsModal(false)}
          onJoinRoom={(roomId, roomName) => {
            game.roomName = roomName;
            game.roomId = roomId;
            game.mode = 'room';
            game.running = true;
            game.paused = false;
            initAudio();
            forceUpdate();
            toast(`🚀 Joined Room '${roomName}'!`);
          }}
        />
      )}

      {/* ONLINE SIDE NOTIFICATION TOAST POPUP */}
      {sideNotificationPopup && (
        <div
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 1200,
            background: 'linear-gradient(135deg, rgba(20,24,30,0.98), rgba(10,12,16,0.99))',
            border: '2px solid var(--gold)', borderRadius: '12px', padding: '14px 18px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.8)', color: '#fff', width: '320px',
            display: 'flex', flexDirection: 'column', gap: '8px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--gold-bright)' }}>
              {sideNotificationPopup.title}
            </span>
            <button
              onClick={() => setSideNotificationPopup(null)}
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '14px' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '11px', color: '#ddd' }}>
            {sideNotificationPopup.body}
          </div>
          <button
            onClick={() => {
              if (document.pointerLockElement) document.exitPointerLock();
              setShowNotificationsModal(true);
              setSideNotificationPopup(null);
            }}
            style={{
              background: 'var(--gold)', color: '#000', border: 'none', borderRadius: '6px',
              padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', alignSelf: 'flex-end'
            }}
          >
            Open Center 🔔
          </button>
        </div>
      )}

      {/* Sliding Side-Panel Overlay — Available in both Lobby and In-Game */}
      {showChatSidePanel && (
        <div style={{
          position: 'fixed', top: '16px', right: '16px', bottom: '16px',
          width: '380px', maxWidth: '90vw', zIndex: 9999
        }}>
          <ChatPanel
            currentUser={currentUser}
            isSidePanel={true}
            initialTargetUser={chatTargetUser}
            onClose={() => {
              setShowChatSidePanel(false);
              uiState.chatOpen = false;
            }}
          />
        </div>
      )}

      {/* CHEST MODAL */}
      {Boolean(uiState?.chestOpen) && (
        <ChestScreen
          activeChestCoords={uiState?.activeChestCoords}
          onClose={handleCloseChest}
          scheduleSave={scheduleSave}
        />
      )}

      {/* FURNACE MODAL */}
      {Boolean(uiState?.furnaceOpen) && (
        <FurnaceScreen
          coordsStr={uiState?.activeFurnaceCoords}
          onClose={handleCloseFurnace}
        />
      )}

      {/* CRAFTING & HANDBOOK MODAL */}
      {Boolean(uiState?.craftOpen) && (
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
              <div className="dashboard-tabs" style={{
                display: 'flex', borderBottom: '1px solid rgba(214,178,120,0.2)',
                background: 'rgba(0,0,0,0.3)',
                padding: '6px 10px 0',
                gap: 2, marginBottom: 0, flexShrink: 0
              }}>
                {['blocks','recipes','manual','messages'].map(tab => (
                  <button key={tab}
                    onClick={() => setCraftTab(tab)}
                    className="dash-tab"
                    style={{
                      fontFamily: 'inherit', fontSize: 10, letterSpacing: 1,
                      color: craftTab === tab ? '#1a1410' : '#d6b278',
                      background: craftTab === tab ? '#f2d9a0' : 'transparent',
                      border: 'none', borderRadius: '4px 4px 0 0',
                      padding: '6px 12px', cursor: 'pointer',
                      fontWeight: craftTab === tab ? 700 : 400, flexShrink: 0
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
                      {filteredBlocks.map(id => {
                        const b = BLOCKS[id];
                        if (!b) return null;
                        return (
                          <div key={id} className="block-row">
                            <div className="b-swatch-container"><Swatch3D id={id} /></div>
                            <div style={{ flex: 1, paddingLeft: '10px', fontSize: '10px' }}>
                              <div style={{ fontWeight: 'bold', color: '#fff' }}>{b.name || `Block #${id}`}</div>
                              <div style={{ color: 'var(--gold)', fontSize: '8px' }}>
                                {b.solid ? 'Solid' : 'Non-Solid'} · Hard: {b.hardness ?? 1} · ID: {id}
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
                                {Object.entries(recipe?.in || {}).map(([inId, qty]) => `${thingName(Number(inId))} ×${qty}`).join(', ')}
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
                    <p>Mine resources, craft tools &amp; weapons, build structures, farm crops, cook in furnaces, manage health and hunger, and survive hostile mobs through the night in an infinitely expandable 3D voxel world.</p>
                    <div className="m-tip"><strong>Unbreakable Bedrock:</strong> Deep underground at <strong>Y = 0</strong> lies unbreakable Bedrock that cannot be destroyed.</div>

                    <h3>⌨️ Key Bindings, Controls &amp; Camera</h3>
                    <ul>
                      <li><span className="m-key">W A S D</span> Move forward, left, backward, right.</li>
                      <li><span className="m-key">Mouse Move</span> Look around in 360° 3D space.</li>
                      <li><span className="m-key">Left-Click Game Screen</span> Locks mouse pointer into the game for smooth camera rotation.</li>
                      <li><span className="m-key">Left-Click Block</span> Mine block / attack mob (hold left-click to see block crack overlay).</li>
                      <li><span className="m-key">Right-Click</span> Place block / interact with Chest, Furnace, Bed, TNT, Hoe, Seeds, Levers, Buttons.</li>
                      <li><span className="m-key">1–8</span> Select Hotbar Slot &nbsp;|&nbsp; <span className="m-key">Scroll Wheel</span> Cycle Hotbar</li>
                      <li><span className="m-key">E</span> Open / Close Handbook (Inventory &amp; Crafting)</li>
                      <li><span className="m-key">Q</span> Drop 1 held item (or eat food when holding food)</li>
                      <li><span className="m-key">F</span> Toggle Creative Flying mode</li>
                      <li><span className="m-key">F3</span> Toggle 3D Physics Debug Overlay &amp; Telemetry</li>
                      <li><span className="m-key">F5 / H</span> Cycle Camera View (First-Person, Third-Person Back, Third-Person Front)</li>
                      <li><span className="m-key">G / V</span> Open 3D Voxel Pathfinder &amp; GPS Wayfinder modal</li>
                      <li><span className="m-key">Esc (Press 1x)</span> Pause session &amp; release pointer lock to access UI</li>
                      <li><span className="m-key">Esc (Press 2x)</span> Exit game session &amp; return to Home Screen / Main Menu</li>
                    </ul>

                    <h3>🏃 Movement, Sprinting &amp; Parkour Physics</h3>
                    <ul>
                      <li><span className="m-key">Space</span> Jump / Swim Up in water.</li>
                      <li><span className="m-key">Ctrl / Shift</span> Sprint (increases movement speed &amp; expands FOV; drains hunger faster).</li>
                      <li><strong>Ground Step-Up:</strong> Walking forward into <strong>0.5-block slabs, carpets, or trapdoors</strong> automatically steps up onto them. (Full 1-block steps require Space to jump).</li>
                      <li><strong>Jump Buffering:</strong> Pressing <span className="m-key">Space</span> up to 150ms before touching the ground triggers an instant jump upon landing.</li>
                      <li><strong>Coyote Timer:</strong> Allows jumping up to 120ms after walking off ledges or block edges.</li>
                      <li><strong>Fluid Swimming:</strong> Hold <span className="m-key">Space</span> to swim up. Leaping out of water at the surface gives a boost to land on terrain.</li>
                    </ul>

                    <h3>⛏️ Mining, Harvesting &amp; Tool Tiers</h3>
                    <ul>
                      <li><strong>Hold Left-Click:</strong> Mine targeted block. Progressive crack overlay shows mining progress.</li>
                      <li><strong>Block Hardness:</strong> Dirt and leaves break fast, while Stone and Ores require Pickaxes.</li>
                      <li><strong>Tool Efficiency:</strong> Pickaxes mine Stone/Ores, Axes chop Wood/Logs, Shovels dig Dirt/Sand.</li>
                      <li><strong>Tool Tiers:</strong> Wood (30 durability) &rarr; Stone (60) &rarr; Iron (150) &rarr; Diamond (500). Higher tiers mine faster and unlock higher-grade ores.</li>
                    </ul>

                    <h3>📦 3D Floating Item Drops &amp; Magnetic Pickup</h3>
                    <ul>
                      <li><strong>Magnetic Pickup Range:</strong> Mined blocks and XP orbs attract automatically to your player and fly directly into your inventory.</li>
                      <li><strong>Pickup Toasts:</strong> Text notifications appear in the bottom-left showing collected items (e.g. <em>Picked up +1 Oak Log</em>).</li>
                      <li><strong>100-Entity Drop Cap:</strong> Active item entity drops are capped at 100 max entities for smooth performance.</li>
                      <li><strong>Surface Placement:</strong> Dropped items land cleanly on top of block surfaces without clipping inside terrain geometry.</li>
                    </ul>

                    <h3>🧱 Hotbar &amp; Block Building Mechanics</h3>
                    <ul>
                      <li><span className="m-key">1–8</span> or <span className="m-key">Scroll Wheel</span> — Select active Hotbar slot.</li>
                      <li><span className="m-key">Right-Click</span> — Place selected block onto targeted block face.</li>
                      <li><span className="m-key">Shift + Right-Click</span> — Place blocks directly onto liquid water surfaces to build bridges across oceans!</li>
                      <li><strong>Torches:</strong> Must be attached to solid floor or wall surfaces.</li>
                    </ul>

                    <h3>❤️ Survival HUD — Health, Hunger &amp; Food</h3>
                    <ul>
                      <li>❤️ <strong>Health (20 HP / 10 Hearts):</strong> Reduced by fall damage (falling &gt;3.5 blocks), drowning, void, zombie hits, creeper explosions, or starvation.</li>
                      <li>🍗 <strong>Hunger (20 Points / 10 Drumsticks):</strong> Drains over time (faster when sprinting). At 16+ hunger, health regenerates automatically. At 0 hunger, starvation damage occurs.</li>
                      <li><strong>Eating Food:</strong> Select food (Apples, Berries, Bread, Cooked Meat) in hotbar and press <span className="m-key">Q</span> (or right-click) to restore health &amp; hunger.</li>
                    </ul>

                    <h3>📘 Inventory &amp; 3x3 Crafting Handbook</h3>
                    <ul>
                      <li>Press <span className="m-key">E</span> — Open your Inventory &amp; Crafting Handbook.</li>
                      <li><strong>Essential Recipes:</strong>
                        <ul>
                          <li>1 Log &rarr; 4 Wood Planks</li>
                          <li>4 Planks &rarr; Crafting Table (place down to unlock full 3x3 crafting grid!)</li>
                          <li>2 Planks &rarr; 4 Sticks</li>
                          <li>3 Planks + 2 Sticks &rarr; Wooden Pickaxe!</li>
                        </ul>
                      </li>
                      <li><strong>Editable Hotbar:</strong> Click any item in your inventory to pick it up, then click a Hotbar slot (1–8) or press number keys <span className="m-key">1–8</span> to assign it.</li>
                    </ul>

                    <h3>🔥 Smelting &amp; Cooking (Furnace)</h3>
                    <ul>
                      <li>Craft a <strong>Furnace (8 Cobblestone)</strong>, place it down, and <span className="m-key">Right-Click</span> to open.</li>
                      <li><strong>Fuel Slot (Bottom):</strong> Burn Coal, Charcoal, Wood Logs, or Planks as fuel.</li>
                      <li><strong>Input Slot (Top):</strong> Place Iron Ore, Gold Ore, Sand (smelts into Glass), Clay (smelts into Terracotta), or Raw Meat over a 10-second cook cycle.</li>
                    </ul>

                    <h3>📦 Chest Storage, Cloud Sync &amp; Beds (Night Passing)</h3>
                    <ul>
                      <li><strong>Chest Storage:</strong> Craft a Chest (8 Planks) to store up to 27 item stacks. World edits and chest inventories automatically save locally and sync with Firebase Firestore cloud storage.</li>
                      <li><strong>Beds &amp; Night Passing:</strong> Craft a Bed (3 Wool + 3 Planks), place inside shelter, and <span className="m-key">Right-Click</span> at night to skip instantly to dawn, restore +6 HP, and update your respawn point.</li>
                    </ul>

                    <h3>⚡ Redstone &amp; Automation Systems</h3>
                    <ul>
                      <li><strong>Redstone Power Grid (0–15):</strong> Redstone Dust carries power up to 15 blocks. Redstone Blocks &amp; Torches provide constant power.</li>
                      <li><strong>Triggers &amp; Devices:</strong> Right-click <strong>Levers</strong> to toggle power, press <strong>Buttons</strong> for 1.0s pulses, or step on <strong>Pressure Plates</strong>.</li>
                      <li><strong>Pistons &amp; Sticky Pistons:</strong> When powered, push chains of up to 12 blocks ahead. Sticky Pistons pull attached blocks back on power off!</li>
                      <li><strong>Repeaters &amp; Comparators:</strong> Right-click Repeaters to cycle signal delays (1–4 ticks); right-click Comparators to toggle subtract mode or measure container capacity (chests/furnaces).</li>
                      <li><strong>Dispensers &amp; Droppers:</strong> Fire arrows, place water, or eject items automatically / deposit into adjacent chests when triggered by Redstone power.</li>
                    </ul>

                    <h3>🧟 Mobs, Undead Sunlight Burning &amp; Combat</h3>
                    <ul>
                      <li>🧟 <strong>Zombies:</strong> Melee attackers. Burn in direct sunlight during daytime!</li>
                      <li>💀 <strong>Skeletons:</strong> Ranged archers. Burn in direct sunlight during daytime!</li>
                      <li>💥 <strong>Creepers:</strong> Stealth explosive mobs! Back away immediately when they start flashing and hissing!</li>
                      <li><strong>Weapons &amp; TNT:</strong> Craft Swords for melee knockback, Bow &amp; Arrows for ranged attacks, or place TNT (ignite with right-click, 3s fuse, 4-block explosion radius).</li>
                    </ul>

                    <h3>🪣 Bucket &amp; Fluid Interactions</h3>
                    <ul>
                      <li><strong>Empty Bucket (144):</strong> Right-click a water source block (8) to scoop it up into a Water Bucket (145).</li>
                      <li><strong>Water Bucket (145):</strong> Right-click air or flowing water to place a water source block (8), returning an Empty Bucket.</li>
                    </ul>

                    <h3>🌾 Farming &amp; Agriculture</h3>
                    <ul>
                      <li>Right-click Grass/Dirt with a <strong>Hoe</strong> to create Farmland.</li>
                      <li>Right-click Farmland with <strong>Wheat Seeds</strong> to plant crops.</li>
                      <li>Harvest ripe wheat &rarr; Craft 3 Wheat into 1 Bread!</li>
                    </ul>

                    <h3>🛰️ 3D Voxel Pathfinder &amp; GPS Wayfinder</h3>
                    <ul>
                      <li>Press <span className="m-key">G</span> or <span className="m-key">V</span> — Open the 3D Voxel Pathfinder &amp; GPS Wayfinder modal.</li>
                      <li><strong>Save Waypoints:</strong> Bookmark Home Base, Mineshaft, Furnace Room, or Portals.</li>
                      <li><strong>3D A* Navigation:</strong> Computes connected 3D paths through terrain and projects glowing GPS guide dots directly in the 3D world!</li>
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
        <div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="modal-card" style={{ margin: 'auto', width: '90%', maxWidth: '440px', boxSizing: 'border-box', textAlign: 'center' }}>
            <div className="modal-icon">☁️</div>
            <h2>Cloud Save Found</h2>
            <p style={{ marginBottom: '12px', fontSize: '12px', lineHeight: '1.6', color: '#d8caae' }}>
              We found an existing cloud save, but you also have local progress on this device.
            </p>
            <p style={{ marginBottom: '16px', fontSize: '11px', color: 'var(--gold)' }}>Which save would you like to keep?</p>
            <div className="modal-buttons" style={{ flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
              <button className="modal-btn danger"
                style={{ background: 'var(--gold-bright)', color: 'var(--ink)', width: '100%', border: 'none', fontWeight: 'bold', padding: '10px' }}
                onClick={() => handleResolveConflict(true)}>
                Use Cloud Save (Overwrites local progress)
              </button>
              <button className="modal-btn cancel" style={{ width: '100%', padding: '10px' }}
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

      {/* ONBOARDING AGENT ASSISTANT MODAL */}
      {showOnboarding && (
        <OnboardingAgentModal
          onComplete={() => {
            setOnboardingOpen(false);
            setShowOnboarding(false);
          }}
        />
      )}

      {/* IN-GAME ERROR CONSOLE MODAL */}
      {showErrorConsole && (
        <ErrorConsoleModal onClose={() => setShowErrorConsole(false)} />
      )}
    </>
  );
}
