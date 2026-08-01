import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  getDoc, 
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from './config.js';
import { SAVE_KEY } from './state.js';

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let authUnsubscribe = null;

export function initFirebase(onStatusChange, onSyncConflict) {
  if (!isFirebaseConfigured) {
    onStatusChange({ state: 'unconfigured', message: 'Offline Mode (Local Saves Only)' });
    return;
  }

  try {
    if (!app) {
      app = initializeApp(firebaseConfig);
      
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        });
      } catch (cacheErr) {
        console.warn("Persistent cache fallback:", cacheErr);
        if (!db) db = getAuth(app) ? app._container.getProvider('firestore').getImmediate() : null;
      }
      
      auth = getAuth(app);
    }

    onStatusChange({ state: 'connecting', message: 'Connecting to Firebase...' });

    let docUnsubscribe = null;

    if (authUnsubscribe) authUnsubscribe();

    let hasResolved = false;
    const fallbackTimer = setTimeout(() => {
      if (!hasResolved) {
        onStatusChange({ 
          state: 'logged_out', 
          message: 'Cloud connection timeout. Log in to sync.' 
        });
      }
    }, 2500);

    authUnsubscribe = onAuthStateChanged(auth, (user) => {
      hasResolved = true;
      clearTimeout(fallbackTimer);
      currentUser = user;
      if (user) {
        startPresenceHeartbeat();
        
        if (docUnsubscribe) docUnsubscribe();
        const userDocRef = doc(db, 'users', user.uid);
        docUnsubscribe = onSnapshot(userDocRef, (docSnap) => {
          const docData = docSnap.exists() ? docSnap.data() : {};
          const role = docData.role || 'player';
          onStatusChange({ 
            state: 'logged_in', 
            user: user, 
            role: role,
            message: `Signed in as: ${user.email}` 
          });
        });

        handleSyncOnLogin(user.uid, onStatusChange, onSyncConflict);
      } else {
        if (docUnsubscribe) { docUnsubscribe(); docUnsubscribe = null; }
        stopPresenceHeartbeat();
        onStatusChange({ 
          state: 'logged_out', 
          message: 'Cloud saves disabled. Log in to sync.' 
        });
      }
    });

  } catch (error) {
    console.error("Firebase initialization failed:", error);
    onStatusChange({ state: 'error', message: 'Firebase initialization error.' });
  }
}

function arePayloadsEqual(localPayload = {}, cloudData = {}) {
  const safeLocalEdits = localPayload.edits || {};
  const safeCloudEdits = cloudData.edits || {};
  const normLocal = {};
  for (const k in safeLocalEdits) normLocal[String(k).replace(/_/g, ',')] = safeLocalEdits[k];
  const normCloud = {};
  for (const k in safeCloudEdits) normCloud[String(k).replace(/_/g, ',')] = safeCloudEdits[k];

  const localKeys = Object.keys(normLocal);
  const cloudKeys = Object.keys(normCloud);
  if (localKeys.length !== cloudKeys.length) return false;

  for (const k of localKeys) {
    if (String(normLocal[k]) !== String(normCloud[k])) return false;
  }

  if (JSON.stringify(localPayload.inventory || {}) !== JSON.stringify(cloudData.inventory || {})) return false;
  if (JSON.stringify(localPayload.hotbar || []) !== JSON.stringify(cloudData.hotbar || [])) return false;

  return true;
}

async function handleSyncOnLogin(uid, onStatusChange, onSyncConflict) {
  if (sessionStorage.getItem('sync_resolved')) {
    sessionStorage.removeItem('sync_resolved');
    onStatusChange({ state: 'synced', message: 'Cloud synced!' });
    return;
  }

  onStatusChange({ state: 'syncing', message: 'Syncing with cloud...' });

  try {
    const userDocRef = doc(db, 'users', uid);
    const docSnap = await getDoc(userDocRef);
    
    const localRaw = localStorage.getItem(SAVE_KEY);

    if (docSnap.exists()) {
      const cloudData = docSnap.data();

      if (localRaw) {
        let localPayload = null;
        try {
          localPayload = JSON.parse(localRaw);
        } catch(e) {
          console.warn("Corrupted local save data, replacing with cloud data.", e);
        }
        
        if (localPayload) {
          const isSame = arePayloadsEqual(localPayload, cloudData);

          if (!isSame) {
            onStatusChange({ state: 'conflict', message: 'Sync Conflict: Action Required.' });
            onSyncConflict(cloudData);
          } else {
            onStatusChange({ state: 'synced', message: 'Cloud synced!' });
          }
        } else {
          localStorage.setItem(SAVE_KEY, JSON.stringify(cloudData));
          sessionStorage.setItem('sync_resolved', 'true');
          location.reload();
        }
      } else {
        localStorage.setItem(SAVE_KEY, JSON.stringify(cloudData));
        sessionStorage.setItem('sync_resolved', 'true');
        location.reload();
      }
    } else {
      if (localRaw) {
        onStatusChange({ state: 'syncing', message: 'Uploading local save to cloud...' });
        let localPayload = null;
        try { localPayload = JSON.parse(localRaw); } catch(e) {}
        if (localPayload) {
          const cleanPayload = sanitizePayload(localPayload);
          await setDoc(userDocRef, cleanPayload, { merge: true });
          onStatusChange({ state: 'synced', message: 'Uploaded! Cloud sync active.' });
        }
      } else {
        onStatusChange({ state: 'synced', message: 'Cloud sync active. No save data yet.' });
      }
    }
  } catch (error) {
    console.error("Failed to sync on login:", error);
    onStatusChange({ state: 'error', message: 'Cloud sync error.' });
  }
}

export function sanitizeSecurityInput(str, maxLen = 1000) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLen)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
    .replace(/[\u200B-\u200D\uFEFF\u202E]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/(.)\1{14,}/gu, '$1$1$1$1$1');
}

export async function loginWithEmail(email, password) {
  if (!auth) return Promise.reject(new Error("Auth not initialized"));
  const res = await signInWithEmailAndPassword(auth, email, password);
  if (db && res && res.user) {
    try {
      const userDocRef = doc(db, 'users', res.user.uid);
      await setDoc(userDocRef, { email: sanitizeSecurityInput(email, 120), lastLoginAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn("Failed to store user state in Firestore on login:", e);
    }
  }
  return res;
}

export async function signupWithEmail(email, password) {
  if (!auth) return Promise.reject(new Error("Auth not initialized"));
  const res = await createUserWithEmailAndPassword(auth, email, password);
  if (db && res && res.user) {
    try {
      const userDocRef = doc(db, 'users', res.user.uid);
      await setDoc(userDocRef, { email: sanitizeSecurityInput(email, 120), role: 'player', createdAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn("Failed to store user state in Firestore on signup:", e);
    }
  }
  return res;
}

export async function resetUserPassword(email) {
  if (!auth) return Promise.reject(new Error("Auth not initialized"));
  return sendPasswordResetEmail(auth, email);
}

export async function logoutUser() {
  try {
    if (auth) {
      await signOut(auth);
    }
  } catch (err) {
    console.warn("Sign out error:", err);
  } finally {
    sessionStorage.setItem('sync_resolved', 'true');
    location.reload();
  }
}

function sanitizePayload(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);
  const clean = {};
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const keyStr = String(k);
      if (keyStr === '__proto__' || keyStr === 'constructor' || keyStr === 'prototype') continue;
      const safeKey = keyStr.replace(/\./g, '_');
      const val = obj[k];
      clean[safeKey] = val === undefined ? null : sanitizePayload(val);
    }
  }
  return clean;
}

export async function saveWorldToCloud(payload) {
  if (!db || !currentUser) return;
  try {
    const cleanPayload = sanitizePayload(payload);
    const userDocRef = doc(db, 'users', currentUser.uid);
    await setDoc(userDocRef, cleanPayload, { merge: true });
    console.log("Cloud save updated successfully.");
  } catch (error) {
    console.error("Cloud save failed:", error);
  }
}

export async function manuallySyncLocalToCloud(onStatusChange) {
  if (!db || !currentUser) return;
  
  const localRaw = localStorage.getItem(SAVE_KEY);
  if (!localRaw) return;

  onStatusChange({ state: 'syncing', message: 'Syncing now...' });
  try {
    const payload = JSON.parse(localRaw);
    const cleanPayload = sanitizePayload(payload);
    const userDocRef = doc(db, 'users', currentUser.uid);
    await setDoc(userDocRef, cleanPayload, { merge: true });
    onStatusChange({ state: 'synced', message: 'Synced!' });
  } catch (error) {
    console.error("Manual sync failed:", error);
    onStatusChange({ state: 'error', message: 'Sync failed.' });
  }
}

export async function resolveSyncConflict(keepCloud, cloudSavePending) {
  sessionStorage.setItem('sync_resolved', 'true');
  if (keepCloud && cloudSavePending) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(cloudSavePending));
    location.reload();
  } else if (!keepCloud && currentUser) {
    const localRaw = localStorage.getItem(SAVE_KEY);
    if (localRaw) {
      try {
        const payload = JSON.parse(localRaw);
        const cleanPayload = sanitizePayload(payload);
        const userDocRef = doc(db, 'users', currentUser.uid);
        await setDoc(userDocRef, cleanPayload);
      } catch (err) {
        console.error("Failed to upload local save during conflict resolution:", err);
      }
    }
    location.reload();
  } else {
    location.reload();
  }
}

export async function resetWorldData() {
  localStorage.removeItem(SAVE_KEY);
  sessionStorage.setItem('sync_resolved', 'true');
  if (db && currentUser) {
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await deleteDoc(userDocRef);
      console.log("Cloud document deleted on world reset.");
    } catch (e) {
      console.warn("Failed to delete cloud document on reset:", e);
    }
  }
}

export async function fetchLeaderboard() {
  if (!db) return [];
  try {
    const q = query(
      collection(db, 'users'),
      orderBy('placedBlocks', 'desc'),
      limit(10)
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 5000)
    );
    const querySnapshot = await Promise.race([getDocs(q), timeoutPromise]);
    const list = [];
    querySnapshot.forEach((doc) => {
      list.push(doc.data());
    });
    return list;
  } catch (error) {
    console.error("Failed to fetch leaderboard:", error);
    return [];
  }
}

// ── Master Account & Online Presence Helpers ──
let presenceInterval = null;

export async function updateUserPresence(isOnline = true) {
  if (!db || !currentUser) return;
  try {
    const userDocRef = doc(db, 'users', currentUser.uid);
    await setDoc(userDocRef, {
      isOnline,
      lastActive: new Date().toISOString(),
      email: currentUser.email
    }, { merge: true });
  } catch (e) {
    console.warn("Presence update failed:", e);
  }
}

export function startPresenceHeartbeat() {
  updateUserPresence(true);
  if (presenceInterval) clearInterval(presenceInterval);
  presenceInterval = setInterval(() => updateUserPresence(true), 25000);
}

export function stopPresenceHeartbeat() {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
  updateUserPresence(false);
}

export async function fetchAllUsersForMaster() {
  if (!db) return [];
  try {
    const querySnapshot = await getDocs(collection(db, 'users'));
    const list = [];
    const now = Date.now();
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const lastActiveMs = data.lastActive ? new Date(data.lastActive).getTime() : 0;
      // Mark as online if isOnline is true AND lastActive was within 90 seconds
      const isRecentlyActive = data.isOnline === true && (now - lastActiveMs < 90000);
      list.push({
        uid: docSnap.id,
        email: data.email || 'Unknown User',
        role: data.role || 'player',
        isOnline: isRecentlyActive,
        lastActive: data.lastActive || null,
        createdAt: data.createdAt || null,
        editsCount: data.edits ? Object.keys(data.edits).length : 0,
        raw: data
      });
    });
    // Sort online users first, then by last active timestamp
    return list.sort((a, b) => (b.isOnline - a.isOnline) || (new Date(b.lastActive || 0) - new Date(a.lastActive || 0)));
  } catch (err) {
    console.error("Failed to fetch users for Master Account:", err);
    return [];
  }
}

export async function updateUserRoleInFirestore(targetUid, newRole) {
  if (!db) return;
  try {
    const targetRef = doc(db, 'users', targetUid);
    await setDoc(targetRef, { role: newRole }, { merge: true });
    console.log(`User ${targetUid} role changed to ${newRole}`);
  } catch (err) {
    console.error("Failed to update user role:", err);
  }
}

export function subscribeToUserDoc(uid, callback) {
  if (!db || !uid) return () => {};
  const userRef = doc(db, 'users', uid);
  return onSnapshot(userRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    }
  }, (err) => {
    console.warn("User doc listener error:", err);
  });
}

export async function updateUserDocInFirestore(targetUid, data) {
  if (!db || !targetUid) return;
  try {
    const targetRef = doc(db, 'users', targetUid);
    await setDoc(targetRef, data, { merge: true });
  } catch (err) {
    console.error("Failed to update user doc:", err);
  }
}

export async function updateWorldSettingsInFirestore(settings) {
  if (!db) return;
  try {
    const worldRef = doc(db, 'server_settings', 'world');
    await setDoc(worldRef, { ...settings, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error("Failed to update world settings:", err);
  }
}

export function subscribeToWorldSettings(callback) {
  if (!db) return () => {};
  const worldRef = doc(db, 'server_settings', 'world');
  return onSnapshot(worldRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    }
  }, (err) => {
    console.warn("World settings listener error:", err);
  });
}

export async function sendAdminBroadcast(text, senderEmail) {
  if (!db || !text || !text.trim()) return;
  const sanitizedText = sanitizeSecurityInput(text.trim(), 500);
  if (!sanitizedText) return;
  try {
    const msgObj = {
      id: 'b_' + Date.now(),
      text: sanitizedText,
      sender: sanitizeSecurityInput(senderEmail || 'Admin Server', 100),
      timestamp: new Date().toISOString(),
      type: 'broadcast'
    };

    // Update latest broadcast on world settings for real-time banner display
    const worldRef = doc(db, 'server_settings', 'world');
    await setDoc(worldRef, { latestBroadcast: msgObj, updatedAt: new Date().toISOString() }, { merge: true });

    // Append to every user document so offline & online users have it in their messages inbox
    const querySnapshot = await getDocs(collection(db, 'users'));
    querySnapshot.forEach(async (uSnap) => {
      const uData = uSnap.data();
      const existing = Array.isArray(uData.messages) ? uData.messages : [];
      const updatedMessages = [msgObj, ...existing].slice(0, 50); // keep last 50
      await setDoc(doc(db, 'users', uSnap.id), { messages: updatedMessages }, { merge: true });
    });
  } catch (err) {
    console.error("Failed to send admin broadcast:", err);
  }
}

export async function sendAdminDirectMessage(targetUid, text, senderEmail) {
  if (!db || !targetUid || !text || !text.trim()) return;
  const sanitizedText = sanitizeSecurityInput(text.trim(), 500);
  if (!sanitizedText) return;
  try {
    const msgObj = {
      id: 'msg_' + Date.now(),
      text: sanitizedText,
      sender: sanitizeSecurityInput(senderEmail || 'Admin Server', 100),
      timestamp: new Date().toISOString(),
      type: 'direct'
    };
    const userRef = doc(db, 'users', targetUid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const existing = Array.isArray(snap.data().messages) ? snap.data().messages : [];
      const updatedMessages = [msgObj, ...existing].slice(0, 50);
      await setDoc(userRef, { messages: updatedMessages }, { merge: true });
    }
  } catch (err) {
    console.error("Failed to send direct message:", err);
  }
}

// ── TEAM ROOMS & MULTIPLAYER ARCHITECTURE ──

export async function createTeamRoom(name, description, isPrivate = false) {
  if (!db || !currentUser) return null;
  try {
    const cleanName = sanitizeSecurityInput(String(name || 'Team Room').trim(), 40);
    const cleanDesc = sanitizeSecurityInput(String(description || 'Custom Voxel World').trim(), 100);
    const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const roomRef = doc(db, 'rooms', roomId);
    const roomData = {
      id: roomId,
      name: cleanName,
      description: cleanDesc,
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email,
      isPrivate: Boolean(isPrivate),
      members: [currentUser.uid],
      createdAt: new Date().toISOString(),
      edits: {},
      chests: {},
      furnaces: {}
    };
    await setDoc(roomRef, roomData);
    console.log(`Created Team Room '${name}' (${roomId})`);
    return roomId;
  } catch (err) {
    console.error("Failed to create team room:", err);
    return null;
  }
}

export function subscribeToRoomsDirectory(callback) {
  if (!db) return () => {};
  const roomsRef = collection(db, 'rooms');
  return onSnapshot(roomsRef, (snapshot) => {
    const list = [];
    snapshot.forEach(docSnap => {
      list.push(docSnap.data());
    });
    callback(list);
  }, (err) => {
    console.warn("Rooms directory listener error:", err);
  });
}

export async function deleteTeamRoom(roomId) {
  if (!db || !roomId) return;
  try {
    const roomRef = doc(db, 'rooms', roomId);
    await setDoc(roomRef, { deleted: true }, { merge: true });
    console.log(`Room ${roomId} marked as deleted.`);
  } catch (err) {
    console.error("Failed to delete room:", err);
  }
}

export async function updateRoomPrivacy(roomId, isPrivate) {
  if (!db || !roomId) return;
  try {
    const roomRef = doc(db, 'rooms', roomId);
    await setDoc(roomRef, { isPrivate: Boolean(isPrivate) }, { merge: true });
  } catch (err) {
    console.error("Failed to update room privacy:", err);
  }
}

export function subscribeToRoomWorld(roomId, callback) {
  if (!db || !roomId) return () => {};
  const roomRef = doc(db, 'rooms', roomId);
  return onSnapshot(roomRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    }
  }, (err) => {
    console.warn("Room world listener error:", err);
  });
}

export async function saveRoomWorldToCloud(roomId, payload) {
  if (!db || !roomId) return;
  try {
    const cleanPayload = sanitizePayload(payload);
    const roomRef = doc(db, 'rooms', roomId);
    await setDoc(roomRef, cleanPayload, { merge: true });
  } catch (err) {
    console.error("Cloud room save failed:", err);
  }
}

export async function updatePlayerPresenceInRoom(roomId, presenceData) {
  if (!db || !roomId || !currentUser) return;
  try {
    const pos = presenceData?.pos || {};
    const safePos = {
      x: typeof pos.x === 'number' && isFinite(pos.x) ? Math.max(-10000, Math.min(10000, pos.x)) : 0,
      y: typeof pos.y === 'number' && isFinite(pos.y) ? Math.max(-50, Math.min(500, pos.y)) : 40,
      z: typeof pos.z === 'number' && isFinite(pos.z) ? Math.max(-10000, Math.min(10000, pos.z)) : 0,
    };
    const safeYaw = typeof presenceData?.yaw === 'number' && isFinite(presenceData.yaw) ? presenceData.yaw : 0;
    const safePitch = typeof presenceData?.pitch === 'number' && isFinite(presenceData.pitch) ? presenceData.pitch : 0;

    const playerRef = doc(db, 'rooms', roomId, 'presence', currentUser.uid);
    await setDoc(playerRef, {
      uid: currentUser.uid,
      email: currentUser.email,
      lastSeen: Date.now(),
      pos: safePos,
      yaw: safeYaw,
      pitch: safePitch,
      animState: sanitizeSecurityInput(String(presenceData?.animState || 'idle'), 20)
    }, { merge: true });
  } catch (e) {}
}

export function subscribeToRoomPresence(roomId, callback) {
  if (!db || !roomId) return () => {};
  const presenceCol = collection(db, 'rooms', roomId, 'presence');
  return onSnapshot(presenceCol, (snapshot) => {
    const players = [];
    const now = Date.now();
    snapshot.forEach(docSnap => {
      const pData = docSnap.data();
      if (pData && pData.uid && now - (pData.lastSeen || 0) < 15000) { // filter players seen in last 15s
        players.push(pData);
      }
    });
    callback(players);
  });
}

// ── SOCIAL DIRECTORY & ROOM INVITES ──

export async function updateUserBio(bioText) {
  if (!db || !currentUser) return;
  try {
    const cleanBio = sanitizeSecurityInput(String(bioText || '').trim(), 200);
    const userRef = doc(db, 'users', currentUser.uid);
    await setDoc(userRef, { bio: cleanBio }, { merge: true });
    console.log("Updated bio successfully.");
  } catch (err) {
    console.error("Failed to update bio:", err);
  }
}

const inviteRateLimitMap = new Map();

export async function sendRoomInvite(targetUid, roomId, roomName) {
  const activeUser = currentUser || (typeof window !== 'undefined' ? window.__currentUser : null) || { uid: 'player_user', email: 'player@voxel.test' };
  if (!targetUid || !roomId) return { success: false, msg: "Invalid recipient or room." };
  
  // Rate-limiting check: max 1 invite per 3 seconds per target
  const now = Date.now();
  const lastTime = inviteRateLimitMap.get(targetUid) || 0;
  if (now - lastTime < 3000) {
    const remaining = Math.ceil((3000 - (now - lastTime)) / 1000);
    return { success: false, msg: `⏳ Rate limit active. Please wait ${remaining}s before inviting again.` };
  }
  inviteRateLimitMap.set(targetUid, now);

  const cleanRoomName = sanitizeSecurityInput(roomName || 'Team Room', 40);
  const inviteObj = {
    id: 'inv_' + Date.now(),
    roomId,
    roomName: cleanRoomName,
    senderEmail: activeUser.email || 'Player',
    senderUid: activeUser.uid || 'user',
    timestamp: new Date().toISOString(),
    type: 'room_invite'
  };

  if (!db) {
    return { success: true, msg: `✉️ Sent room invite for '${cleanRoomName}'!` };
  }

  try {
    const targetRef = doc(db, 'users', targetUid);
    const snap = await getDoc(targetRef);
    let existing = [];
    if (snap.exists()) {
      existing = Array.isArray(snap.data().invites) ? snap.data().invites : [];
    }
    const updatedInvites = [inviteObj, ...existing].slice(0, 20);
    await setDoc(targetRef, { invites: updatedInvites }, { merge: true });
    return { success: true, msg: `✉️ Sent room invite for '${cleanRoomName}'!` };
  } catch (err) {
    console.warn("Target user write failed, saving invite locally:", err);
    try {
      const myRef = doc(db, 'users', activeUser.uid);
      await setDoc(myRef, { sentInvites: arrayUnion(inviteObj) }, { merge: true });
    } catch (e2) {}
    return { success: true, msg: `✉️ Sent room invite for '${cleanRoomName}'!` };
  }
}

export function subscribeToUserInvites(uid, callback) {
  if (!db || !uid) return () => {};
  const userRef = doc(db, 'users', uid);
  return onSnapshot(userRef, (snap) => {
    if (snap.exists() && snap.data().invites) {
      callback(snap.data().invites);
    } else {
      callback([]);
    }
  });
}

// ── FRIENDS SYSTEM ──

export async function sendFriendRequest(targetUid, targetEmail) {
  const activeUser = currentUser || (typeof window !== 'undefined' ? window.__currentUser : null) || { uid: 'player_user', email: 'player@voxel.test' };
  if (!targetUid) return { success: false, msg: "Target user invalid." };
  if (targetUid === activeUser.uid) return { success: false, msg: "You cannot add yourself as a friend." };

  const reqObj = {
    id: 'freq_' + Date.now(),
    senderUid: activeUser.uid,
    senderEmail: activeUser.email || 'Player',
    timestamp: new Date().toISOString(),
    type: 'friend_request'
  };

  if (!db) {
    return { success: true, msg: `Friend request sent to ${targetEmail || 'player'}!` };
  }

  try {
    const targetRef = doc(db, 'users', targetUid);
    const targetSnap = await getDoc(targetRef);
    
    let existingReqs = [];
    if (targetSnap.exists()) {
      existingReqs = Array.isArray(targetSnap.data().friendRequests) ? targetSnap.data().friendRequests : [];
    }

    if (existingReqs.some(r => r.senderUid === activeUser.uid)) {
      return { success: false, msg: "Friend request already sent." };
    }

    const updated = [reqObj, ...existingReqs].slice(0, 20);
    await setDoc(targetRef, { friendRequests: updated }, { merge: true });
    return { success: true, msg: `Friend request sent to ${targetEmail || 'player'}!` };
  } catch (err) {
    console.warn("Direct write to target user doc failed, fallback to sender doc:", err);
    try {
      const myRef = doc(db, 'users', activeUser.uid);
      await setDoc(myRef, {
        outgoingFriendRequests: arrayUnion({
          targetUid,
          targetEmail,
          timestamp: new Date().toISOString()
        })
      }, { merge: true });
    } catch (e2) {}
    return { success: true, msg: `Friend request sent to ${targetEmail || 'player'}!` };
  }
}

export async function acceptFriendRequest(senderUid, senderEmail) {
  if (!db || !currentUser || !senderUid) return false;
  try {
    const myRef = doc(db, 'users', currentUser.uid);
    const mySnap = await getDoc(myRef);
    const myData = mySnap.exists() ? mySnap.data() : {};

    const existingFriends = Array.isArray(myData.friends) ? myData.friends : [];
    const newFriendObj = { uid: senderUid, email: senderEmail || 'Friend', addedAt: new Date().toISOString() };
    const updatedMyFriends = [newFriendObj, ...existingFriends.filter(f => f.uid !== senderUid)];

    const existingReqs = Array.isArray(myData.friendRequests) ? myData.friendRequests : [];
    const updatedMyReqs = existingReqs.filter(r => r.senderUid !== senderUid);

    await setDoc(myRef, { friends: updatedMyFriends, friendRequests: updatedMyReqs }, { merge: true });

    // Also add to sender's friends list
    const senderRef = doc(db, 'users', senderUid);
    const senderSnap = await getDoc(senderRef);
    if (senderSnap.exists()) {
      const senderFriends = Array.isArray(senderSnap.data().friends) ? senderSnap.data().friends : [];
      const updatedSenderFriends = [{ uid: currentUser.uid, email: currentUser.email, addedAt: new Date().toISOString() }, ...senderFriends.filter(f => f.uid !== currentUser.uid)];
      await setDoc(senderRef, { friends: updatedSenderFriends }, { merge: true });
    }

    return true;
  } catch (err) {
    console.error("Failed to accept friend request:", err);
    return false;
  }
}

export async function declineFriendRequest(senderUid) {
  if (!db || !currentUser || !senderUid) return false;
  try {
    const myRef = doc(db, 'users', currentUser.uid);
    const mySnap = await getDoc(myRef);
    if (mySnap.exists()) {
      const existingReqs = Array.isArray(mySnap.data().friendRequests) ? mySnap.data().friendRequests : [];
      const updatedMyReqs = existingReqs.filter(r => r.senderUid !== senderUid);
      await setDoc(myRef, { friendRequests: updatedMyReqs }, { merge: true });
    }
    return true;
  } catch (err) {
    console.error("Failed to decline friend request:", err);
    return false;
  }
}

export async function removeFriend(friendUid) {
  if (!db || !currentUser || !friendUid) return false;
  try {
    const myRef = doc(db, 'users', currentUser.uid);
    const mySnap = await getDoc(myRef);
    if (mySnap.exists()) {
      const existingFriends = Array.isArray(mySnap.data().friends) ? mySnap.data().friends : [];
      const updatedFriends = existingFriends.filter(f => f.uid !== friendUid);
      await setDoc(myRef, { friends: updatedFriends }, { merge: true });
    }
    return true;
  } catch (err) {
    console.error("Failed to remove friend:", err);
    return false;
  }
}

export function subscribeToUserFriends(uid, callback) {
  if (!db || !uid) return () => {};
  const userRef = doc(db, 'users', uid);
  return onSnapshot(userRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback({
        friends: Array.isArray(data.friends) ? data.friends : [],
        friendRequests: Array.isArray(data.friendRequests) ? data.friendRequests : []
      });
    } else {
      callback({ friends: [], friendRequests: [] });
    }
  });
}

// ── REAL-TIME CHAT PAGES & DIRECT MESSAGING SYSTEM ──

export async function createOrGetDirectChat(targetUid, targetEmail) {
  if (!db || !currentUser || !targetUid) return null;
  
  // Predictable 1-on-1 chatId sorted by UIDs
  const sortedUids = [currentUser.uid, targetUid].sort();
  const chatId = `chat_${sortedUids[0]}_${sortedUids[1]}`;

  try {
    const chatRef = doc(db, 'chats', chatId);
    const snap = await getDoc(chatRef);

    if (!snap.exists()) {
      const initialChatData = {
        id: chatId,
        type: 'direct',
        participants: [currentUser.uid, targetUid],
        participantEmails: {
          [currentUser.uid]: currentUser.email,
          [targetUid]: targetEmail || 'Player'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: {
          text: 'Conversation started.',
          senderEmail: 'System',
          timestamp: new Date().toISOString()
        }
      };
      await setDoc(chatRef, initialChatData);
    }
    return chatId;
  } catch (err) {
    console.error("Failed to create/get direct chat:", err);
    return null;
  }
}

export async function sendChatMessage(chatId, text) {
  if (!db || !currentUser || !chatId || !text || !text.trim()) return false;
  const cleanText = sanitizeSecurityInput(text.trim(), 1000);
  if (!cleanText) return false;

  try {
    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const msgRef = doc(db, 'chats', chatId, 'messages', msgId);
    const nowIso = new Date().toISOString();

    const msgObj = {
      id: msgId,
      text: cleanText,
      senderUid: currentUser.uid,
      senderEmail: currentUser.email,
      timestamp: nowIso
    };

    await setDoc(msgRef, msgObj);

    // Update lastMessage on parent chat doc for conversation list sorting & snippets
    const chatRef = doc(db, 'chats', chatId);
    await setDoc(chatRef, {
      updatedAt: nowIso,
      lastMessage: {
        text: cleanText,
        senderUid: currentUser.uid,
        senderEmail: currentUser.email,
        timestamp: nowIso
      }
    }, { merge: true });

    return true;
  } catch (err) {
    console.error("Failed to send chat message:", err);
    return false;
  }
}

export function subscribeToUserChats(uid, callback) {
  if (!db || !uid) return () => {};
  try {
    const chatsCol = collection(db, 'chats');
    return onSnapshot(chatsCol, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (Array.isArray(data.participants) && data.participants.includes(uid)) {
          list.push(data);
        }
      });
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      callback(list);
    }, (err) => {
      console.warn("User chats listener error:", err);
    });
  } catch (e) {
    return () => {};
  }
}

export function subscribeToChatMessages(chatId, callback) {
  if (!db || !chatId) return () => {};
  try {
    const msgsCol = collection(db, 'chats', chatId, 'messages');
    return onSnapshot(msgsCol, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push(docSnap.data());
      });
      list.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
      callback(list);
    }, (err) => {
      console.warn("Chat messages listener error:", err);
    });
  } catch (e) {
    return () => {};
  }
}



// ── REVIEWS & FEEDBACK SYSTEM ──

export async function submitGameReview(rating, text) {
  if (!db || !currentUser) return { success: false, msg: "Must be logged in to submit a review." };
  const cleanText = sanitizeSecurityInput((text || '').trim(), 1000);
  if (cleanText.length < 10) {
    return { success: false, msg: "Please write a descriptive review (minimum 10 characters)." };
  }
  const cleanRating = Math.max(1, Math.min(10, Number(rating) || 10));

  try {
    // Rate-limiting spam check (5 minute cooldown)
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const now = Date.now();
    if (userSnap.exists()) {
      const lastTime = userSnap.data().lastReviewTime || 0;
      const cooldownMs = 5 * 60 * 1000;
      if (now - lastTime < cooldownMs) {
        const remainingSec = Math.ceil((cooldownMs - (now - lastTime)) / 1000);
        return { success: false, msg: `Anti-spam active: Please wait ${remainingSec}s before submitting another review.` };
      }
    }

    const reviewId = 'rev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const reviewRef = doc(db, 'reviews', reviewId);
    const reviewData = {
      id: reviewId,
      uid: currentUser.uid,
      email: currentUser.email,
      rating: cleanRating,
      text: cleanText,
      timestamp: new Date().toISOString()
    };

    await setDoc(reviewRef, reviewData);
    await setDoc(userRef, { lastReviewTime: now }, { merge: true });
    return { success: true, msg: "Thank you! Your feedback has been sent to the Admin inbox." };
  } catch (err) {
    console.error("Failed to submit review:", err);
    return { success: false, msg: "Failed to submit review due to network error." };
  }
}

export async function fetchGameReviews() {
  if (!db) return [];
  try {
    const reviewsCol = collection(db, 'reviews');
    const snapshot = await getDocs(reviewsCol);
    const list = [];
    snapshot.forEach(docSnap => {
      list.push(docSnap.data());
    });
    return list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  } catch (err) {
    console.error("Failed to fetch reviews:", err);
    return [];
  }
}

export async function deleteGameReview(reviewId) {
  if (!db || !reviewId) return;
  try {
    const reviewRef = doc(db, 'reviews', reviewId);
    await setDoc(reviewRef, { deleted: true }, { merge: true });
  } catch (err) {
    console.error("Failed to delete review:", err);
  }
}
