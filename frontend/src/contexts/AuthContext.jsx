import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { setAuthToken, getAuthToken, usersAPI } from '../api';
import { Capacitor } from '@capacitor/core';

const AuthContext = createContext(null);

const isDevMode = !import.meta.env.VITE_FIREBASE_API_KEY ||
                  import.meta.env.VITE_FIREBASE_API_KEY === 'demo-key';

function broadcastToken(token) {
  if (token) {
    window.postMessage({
      type: 'AETHER_AUTH_TOKEN',
      token,
      expiresAt: Date.now() + 3600000,
    }, '*');
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef(null);
  const userRef = useRef(null);
  userRef.current = user;

  // Refresh token helper
  const refreshToken = useCallback(async () => {
    const u = userRef.current;
    if (!u || isDevMode) return;
    try {
      let token;
      if (u.getIdToken) {
        token = await u.getIdToken(true); // force refresh for native user-like objects
      }
      if (token) {
        setAuthToken(token);
        broadcastToken(token);
      }
    } catch (err) {
      console.error('Token refresh failed:', err);
    }
  }, []);

  // Periodic token refresh (every 45 min) + on foreground
  useEffect(() => {
    if (isDevMode || !user) return;

    // Refresh every 45 minutes
    refreshTimerRef.current = setInterval(refreshToken, 45 * 60 * 1000);

    // Refresh when app comes to foreground
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshToken();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(refreshTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, refreshToken]);

  // Register FCM token for push notifications
  useEffect(() => {
    if (!user || isDevMode || !Capacitor.isNativePlatform()) return;
    (async () => {
      try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        const { token } = await FirebaseMessaging.getToken();
        if (token) {
          await usersAPI.registerFCMToken(token);
        }
        // Listen for token refresh
        FirebaseMessaging.addListener('tokenReceived', async ({ token: newToken }) => {
          if (newToken) await usersAPI.registerFCMToken(newToken);
        });
      } catch (err) {
        console.warn('FCM registration failed:', err);
      }
    })();
  }, [user]);

  // Extension token request listener
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.source !== window) return;
      if (event.data?.type === 'AETHER_REQUEST_TOKEN') {
        const token = getAuthToken();
        if (token) broadcastToken(token);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Init auth
  useEffect(() => {
    if (isDevMode) {
      setUser({ uid: 'dev-user-local', email: 'dev@aether.local', displayName: 'Developer' });
      setAuthToken('dev-token');
      broadcastToken('dev-token');
      setLoading(false);
      return;
    }

    let unsubscribe;
    let loadingTimeout = setTimeout(() => {
      console.warn('Auth loading timeout — forcing load complete');
      setLoading(false);
    }, 5000);

    import('../firebase').then(({ auth, onAuthStateChanged, isNative }) => {
      if (isNative) {
        import('@capacitor-firebase/authentication').then(({ FirebaseAuthentication }) => {
          FirebaseAuthentication.getCurrentUser().then(({ user: nativeUser }) => {
            clearTimeout(loadingTimeout);
            if (nativeUser) {
              FirebaseAuthentication.getIdToken({ forceRefresh: true }).then(({ token }) => {
                const userObj = {
                  uid: nativeUser.uid,
                  email: nativeUser.email,
                  displayName: nativeUser.displayName,
                  photoURL: nativeUser.photoUrl,
                  getIdToken: async () => {
                    const t = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
                    return t.token;
                  },
                };
                setUser(userObj);
                setAuthToken(token);
                broadcastToken(token);
                setLoading(false);
              });
            } else {
              setLoading(false);
            }
          }).catch(() => {
            clearTimeout(loadingTimeout);
            setLoading(false);
          });
        });
        return;
      }

      // Web + Desktop: use Firebase JS SDK onAuthStateChanged
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        clearTimeout(loadingTimeout);
        try {
          if (firebaseUser) {
            const token = await firebaseUser.getIdToken();
            setUser(firebaseUser);
            setAuthToken(token);
            broadcastToken(token);
          } else {
            setUser(null);
            setAuthToken(null);
          }
        } catch (err) {
          console.error('Auth state error:', err);
          setUser(null);
          setAuthToken(null);
        } finally {
          setLoading(false);
        }
      });
    }).catch((err) => {
      clearTimeout(loadingTimeout);
      console.error('Failed to load Firebase:', err);
      setLoading(false);
    });

    return () => {
      clearTimeout(loadingTimeout);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const login = async (provider = 'google') => {
    if (isDevMode) {
      setUser({ uid: 'dev-user-local', email: 'dev@aether.local', displayName: 'Developer' });
      setAuthToken('dev-token');
      broadcastToken('dev-token');
      return;
    }

    const firebase = await import('../firebase');
    const signIn = provider === 'apple' ? firebase.signInWithApple : firebase.signInWithGoogle;
    const firebaseUser = await signIn();
    if (firebaseUser) {
      const token = firebaseUser._nativeToken || await firebaseUser.getIdToken();
      setUser(firebaseUser);
      setAuthToken(token);
      broadcastToken(token);
    }
    return firebaseUser;
  };

  const logout = async () => {
    if (!isDevMode) {
      const { signOut } = await import('../firebase');
      await signOut();
    }
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isDevMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
