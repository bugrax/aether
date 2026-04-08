import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-FV4ZWFYN9C',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');
const isNative = Capacitor.isNativePlatform();
const isDesktop = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);

export { app, auth, onAuthStateChanged, isNative };

function buildNativeUser(result, tokenResult) {
  return {
    uid: result.user?.uid,
    email: result.user?.email,
    displayName: result.user?.displayName,
    photoURL: result.user?.photoUrl,
    _nativeToken: tokenResult.token,
    getIdToken: async () => {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const t = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
      return t.token;
    },
  };
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
const WEB_BASE = API_BASE.replace('/api/v1', '');

function generateSessionId() {
  return 'desk_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

async function desktopAuthViaBrowser() {
  let open;
  try {
    const mod = await import('@tauri-apps/plugin-shell');
    open = mod.open;
  } catch (e) {
    throw new Error('Shell plugin failed: ' + e.message);
  }
  const sessionId = generateSessionId();

  // 1. Create session on backend
  try {
    const resp = await fetch(`${API_BASE}/auth/desktop/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!resp.ok) throw new Error('Session create failed: ' + resp.status);
  } catch (e) {
    throw new Error('Backend session error: ' + e.message);
  }

  // 2. Open browser — user logs in on web, token gets stored
  try {
    await open(`${WEB_BASE}/desktop-auth?session=${sessionId}`);
  } catch (e) {
    throw new Error('Browser open failed: ' + e.message);
  }

  // 3. Poll for token
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes
    const poll = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(poll);
        reject(new Error('Desktop auth timed out'));
        return;
      }
      try {
        const resp = await fetch(`${API_BASE}/auth/desktop/poll?session_id=${sessionId}`);
        const data = await resp.json();
        if (data.status === 'ready' && data.token) {
          clearInterval(poll);
          // Sign in with custom token — actually we just need to set the token
          // and create a user-like object
          const { signInWithCustomToken } = await import('firebase/auth');
          // We can't use custom token without server-side minting.
          // Instead, store the ID token directly and create a user object.
          resolve({
            uid: 'desktop-user',
            email: '',
            displayName: '',
            _desktopToken: data.token,
            getIdToken: async () => data.token,
          });
        }
      } catch {
        // Ignore poll errors, keep trying
      }
    }, 2000);
  });
}

export async function signInWithGoogle() {
  if (isNative) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithGoogle();
    const tokenResult = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
    return buildNativeUser(result, tokenResult);
  }
  if (isDesktop) {
    return desktopAuthViaBrowser();
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithApple() {
  if (isNative) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithApple();
    const tokenResult = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
    return buildNativeUser(result, tokenResult);
  }
  if (isDesktop) {
    return desktopAuthViaBrowser();
  }
  const result = await signInWithPopup(auth, appleProvider);
  return result.user;
}

export async function signOut() {
  if (isNative) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    await FirebaseAuthentication.signOut();
    return;
  }
  await firebaseSignOut(auth);
}

export async function getIdToken() {
  if (isNative) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const result = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
      return result.token;
    } catch {
      return null;
    }
  }
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
