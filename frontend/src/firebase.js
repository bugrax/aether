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
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');
const isNative = Capacitor.isNativePlatform();

export { auth, onAuthStateChanged, isNative };

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

export async function signInWithGoogle() {
  if (isNative) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithGoogle();
    const tokenResult = await FirebaseAuthentication.getIdToken({ forceRefresh: false });
    return buildNativeUser(result, tokenResult);
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
