import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';

// Firebase configuration — replace with your project's config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const isNative = Capacitor.isNativePlatform();

export { auth, onAuthStateChanged };

export async function signInWithGoogle() {
  if (isNative) {
    // In Capacitor WebView, popups don't work — use redirect flow
    await signInWithRedirect(auth, googleProvider);
    // After redirect, getRedirectResult() is called in AuthContext useEffect
    return null;
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export { getRedirectResult };

export async function signOut() {
  await firebaseSignOut(auth);
}

export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
