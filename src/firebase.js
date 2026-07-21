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
      
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
      
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

async function handleSyncOnLogin(uid, onStatusChange, onSyncConflict) {
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
          const localEditsStr = JSON.stringify(localPayload.edits || {});
          const cloudEditsStr = JSON.stringify(cloudData.edits || {});

          if (localEditsStr !== cloudEditsStr) {
            onStatusChange({ state: 'conflict', message: 'Sync Conflict: Action Required.' });
            onSyncConflict(cloudData);
          } else {
            onStatusChange({ state: 'synced', message: 'Cloud synced!' });
          }
        } else {
          localStorage.setItem(SAVE_KEY, JSON.stringify(cloudData));
          location.reload();
        }
      } else {
        localStorage.setItem(SAVE_KEY, JSON.stringify(cloudData));
        location.reload();
      }
    } else {
      if (localRaw) {
        onStatusChange({ state: 'syncing', message: 'Uploading local save to cloud...' });
        let localPayload = null;
        try { localPayload = JSON.parse(localRaw); } catch(e) {}
        if (localPayload) {
          await setDoc(userDocRef, localPayload, { merge: true });
          onStatusChange({ state: 'synced', message: 'Uploaded! Cloud sync active.' });
        }
      } else {
        onStatusChange({ state: 'synced', message: 'Cloud sync active. No save data yet.' });
      }
    }
  } catch (error) {
    console.error("Failed to sync on login:", error);
    onStatusChange({ state: 'error', message: 'Sync failed. Playing offline.' });
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
  if (!auth) return Promise.reject(new Error("Auth not initialized"));
  await signOut(auth);
  localStorage.removeItem(SAVE_KEY);
  location.reload();
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

export function resolveSyncConflict(keepCloud, cloudSavePending) {
  if (keepCloud && cloudSavePending) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(cloudSavePending));
    location.reload();
  } else if (!keepCloud && currentUser) {
    const localRaw = localStorage.getItem(SAVE_KEY);
    if (localRaw) {
      try {
        const payload = JSON.parse(localRaw);
        const userDocRef = doc(db, 'users', currentUser.uid);
        setDoc(userDocRef, payload, { merge: true })
          .then(() => {
            location.reload();
          })
          .catch(err => {
            console.error("Failed to upload local save during conflict resolution:", err);
          });
      } catch(e){}
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
