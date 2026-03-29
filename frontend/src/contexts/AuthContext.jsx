import { createContext, useContext, useState, useEffect } from 'react';
import { setAuthToken, getAuthToken } from '../api';

const AuthContext = createContext(null);

// Check if we're in dev mode (no Firebase config)
const isDevMode = !import.meta.env.VITE_FIREBASE_API_KEY ||
                  import.meta.env.VITE_FIREBASE_API_KEY === 'demo-key';

// Broadcast auth token to Chrome extension via postMessage
function broadcastToken(token) {
  if (token) {
    window.postMessage({
      type: 'AETHER_AUTH_TOKEN',
      token,
      expiresAt: Date.now() + 3600000, // 1 hour
    }, '*');
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Listen for token requests from the Chrome extension content script
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

  useEffect(() => {
    if (isDevMode) {
      // Dev mode: skip Firebase, use a mock user
      console.log('🔧 Dev mode: Firebase auth bypassed');
      setUser({
        uid: 'dev-user-local',
        email: 'dev@aether.local',
        displayName: 'Developer',
      });
      setAuthToken('dev-token');
      broadcastToken('dev-token');
      setLoading(false);
      return;
    }

    // Production: use Firebase
    let unsubscribe;

    import('../firebase')
      .then(async ({ auth, onAuthStateChanged, getRedirectResult }) => {
        // Handle redirect result (for Capacitor/mobile auth flow)
        try {
          const redirectResult = await getRedirectResult(auth);
          if (redirectResult?.user) {
            const token = await redirectResult.user.getIdToken();
            setUser(redirectResult.user);
            setAuthToken(token);
            broadcastToken(token);
          }
        } catch (err) {
          console.error('Redirect result error:', err);
        }

        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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
      })
      .catch((err) => {
        console.error('Failed to load Firebase:', err);
        setLoading(false);
      });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const login = async () => {
    if (isDevMode) {
      setUser({
        uid: 'dev-user-local',
        email: 'dev@aether.local',
        displayName: 'Developer',
      });
      setAuthToken('dev-token');
      broadcastToken('dev-token');
      return;
    }

    const { signInWithGoogle } = await import('../firebase');
    const firebaseUser = await signInWithGoogle();
    // In redirect flow (Capacitor), firebaseUser is null — onAuthStateChanged handles it
    if (firebaseUser) {
      const token = await firebaseUser.getIdToken();
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
