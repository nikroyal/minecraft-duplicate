import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  getDoc, 
  setDoc 
} from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from './config.js';
import { SAVE_KEY } from './state.js';

let app = null;
let auth = null;
let db = null;
let currentUser = null;

export function initFirebase(onStatusChange, onSyncConflict) {
  if (!isFirebaseConfigured) {
    onStatusChange({ state: 'unconfigured', message: 'Offline Mode (Local Saves Only)' });
    return;
  }

  try {
    app = initializeApp(firebaseConfig);
    
    // Initialize Firestore with robust multi-tab offline persistence
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
    
    auth = getAuth(app);

    onStatusChange({ state: 'connecting', message: 'Connecting to Firebase...' });

    onAuthStateChanged(auth, (user) => {
      currentUser = user;
      if (user) {
        const displayName = user.isAnonymous ? "Anonymous User" : user.email;
        onStatusChange({ 
          state: 'logged_in', 
          user: user, 
          message: `Signed in as: ${displayName}` 
        });

        // Trigger sync
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
        const localPayload = JSON.parse(localRaw);
        
        // Simple comparison of structural changes to detect conflicts
        const localEditsStr = JSON.stringify(localPayload.edits || {});
        const cloudEditsStr = JSON.stringify(cloudData.edits || {});

        if (localEditsStr !== cloudEditsStr) {
          // Sync Conflict: Show choices
          onStatusChange({ state: 'conflict', message: 'Sync Conflict: Action Required.' });
          onSyncConflict(cloudData);
        } else {
          onStatusChange({ state: 'synced', message: 'Cloud synced!' });
        }
      } else {
        // No local save, apply cloud save directly
        localStorage.setItem(SAVE_KEY, JSON.stringify(cloudData));
        location.reload();
      }
    } else {
      // Cloud document doesn't exist yet, upload local save if we have one
      if (localRaw) {
        onStatusChange({ state: 'syncing', message: 'Uploading local save to cloud...' });
        const localPayload = JSON.parse(localRaw);
        await setDoc(userDocRef, localPayload);
        onStatusChange({ state: 'synced', message: 'Uploaded! Cloud sync active.' });
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
  if (!auth) throw new Error("Auth not initialized");
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signupWithEmail(email, password) {
  if (!auth) throw new Error("Auth not initialized");
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function loginAnonymously() {
  if (!auth) throw new Error("Auth not initialized");
  return signInAnonymously(auth);
}

export async function logoutUser() {
  if (!auth) throw new Error("Auth not initialized");
  await signOut(auth);
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

export async function saveWorldToCloud(payload) {
  if (!db || !currentUser) return;
  try {
    const userDocRef = doc(db, 'users', currentUser.uid);
    await setDoc(userDocRef, payload);
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
    const userDocRef = doc(db, 'users', currentUser.uid);
    await setDoc(userDocRef, payload);
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
      const payload = JSON.parse(localRaw);
      const userDocRef = doc(db, 'users', currentUser.uid);
      setDoc(userDocRef, payload)
        .then(() => {
          location.reload();
        })
        .catch(err => {
          console.error("Failed to upload local save during conflict resolution:", err);
        });
    }
  }
}
