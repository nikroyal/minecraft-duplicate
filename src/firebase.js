import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
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
  getDocs
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
        console.warn("Persistent cache failed, initializing default Firestore:", cacheErr);
        db = initializeFirestore(app, {});
      }
      
      auth = getAuth(app);
    }

    onStatusChange({ state: 'connecting', message: 'Connecting to Firebase...' });

    if (authUnsubscribe) authUnsubscribe();

    authUnsubscribe = onAuthStateChanged(auth, (user) => {
      currentUser = user;
      if (user) {
        onStatusChange({ 
          state: 'logged_in', 
          user: user, 
          message: `Signed in as: ${user.email}` 
        });

        handleSyncOnLogin(user.uid, onStatusChange, onSyncConflict);
      } else {
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

function areEditsEqual(localEdits = {}, cloudEdits = {}) {
  const normLocal = {};
  for (const k in localEdits) normLocal[String(k).replace(/_/g, ',')] = localEdits[k];
  const normCloud = {};
  for (const k in cloudEdits) normCloud[String(k).replace(/_/g, ',')] = cloudEdits[k];

  const localKeys = Object.keys(normLocal);
  const cloudKeys = Object.keys(normCloud);
  if (localKeys.length !== cloudKeys.length) return false;

  for (const k of localKeys) {
    if (normLocal[k] !== normCloud[k]) return false;
  }
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
          const isSame = areEditsEqual(localPayload.edits, cloudData.edits);

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

export async function loginWithEmail(email, password) {
  if (!auth) return Promise.reject(new Error("Auth not initialized"));
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signupWithEmail(email, password) {
  if (!auth) return Promise.reject(new Error("Auth not initialized"));
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function logoutUser() {
  try {
    if (auth) {
      await signOut(auth);
    }
  } catch (err) {
    console.warn("Sign out error:", err);
  } finally {
    localStorage.removeItem(SAVE_KEY);
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
      const safeKey = String(k).replace(/\./g, '_');
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
    const querySnapshot = await getDocs(q);
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
