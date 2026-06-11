import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { setAuthToken, getAuthToken, setOnUnauthorized, usersAPI } from '../api';
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
  const [isAdmin, setIsAdmin] = useState(false);
  const refreshTimerRef = useRef(null);
  const userRef = useRef(null);
  userRef.current = user;

  // Refresh token helper — force-refreshes and returns the fresh token (or null)
  const refreshToken = useCallback(async () => {
    const u = userRef.current;
    if (!u || isDevMode) return null;
    try {
      let token;
      if (u.getIdToken) {
        token = await u.getIdToken(true); // force refresh for native user-like objects
      }
      if (token) {
        setAuthToken(token);
        broadcastToken(token);
        return token;
      }
    } catch (err) {
      console.error('Token refresh failed:', err);
    }
    return null;
  }, []);

  // Let api.js recover from 401s by force-refreshing the token and retrying.
  useEffect(() => {
    setOnUnauthorized(refreshToken);
    return () => setOnUnauthorized(null);
  }, [refreshToken]);

  // Periodic token refresh (every 45 min) + on foreground
  useEffect(() => {
    if (isDevMode || !user) return;

    // Refresh every 45 minutes
    refreshTimerRef.current = setInterval(refreshToken, 45 * 60 * 1000);

    // Refresh when app comes to foreground (web/desktop tab visibility)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshToken();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Native (iOS/Android): visibilitychange + JS timers are unreliable in a
    // backgrounded WKWebView, so use the Capacitor App plugin's appStateChange
    // for a dependable foreground refresh.
    let appListener;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) refreshToken();
        }).then((listener) => { appListener = listener; });
      }).catch((err) => console.warn('App plugin unavailable:', err));
    }

    return () => {
      clearInterval(refreshTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (appListener) appListener.remove();
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

  // Determine admin status from server settings (cosmetic gating — server enforces)
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    if (isDevMode) { setIsAdmin(true); return; }
    let cancelled = false;
    usersAPI.getSettings()
      .then((s) => { if (!cancelled) setIsAdmin(!!s.is_admin); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
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

    // Desktop: restore from localStorage if available
    if (window.__TAURI_INTERNALS__) {
      try {
        const stored = localStorage.getItem('aether_desktop_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed._desktopToken) {
            setUser({
              ...parsed,
              getIdToken: async () => parsed._desktopToken,
            });
            setAuthToken(parsed._desktopToken);
            broadcastToken(parsed._desktopToken);
          }
        }
      } catch {}
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
      const token = firebaseUser._nativeToken || firebaseUser._desktopToken || await firebaseUser.getIdToken();
      setUser(firebaseUser);
      setAuthToken(token);
      broadcastToken(token);
      // Persist desktop user
      if (window.__TAURI_INTERNALS__ && firebaseUser._desktopToken) {
        try {
          localStorage.setItem('aether_desktop_user', JSON.stringify({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            _desktopToken: firebaseUser._desktopToken,
          }));
        } catch {}
      }
    }
    return firebaseUser;
  };

  const logout = async () => {
    if (!isDevMode && !window.__TAURI_INTERNALS__) {
      const { signOut } = await import('../firebase');
      await signOut();
    }
    if (window.__TAURI_INTERNALS__) {
      try { localStorage.removeItem('aether_desktop_user'); } catch {}
    }
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isDevMode, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
