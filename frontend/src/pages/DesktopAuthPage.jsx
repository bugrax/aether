import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getIdToken } from '../firebase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

export default function DesktopAuthPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const { user, loading } = useAuth();
  const [status, setStatus] = useState('waiting'); // waiting, sending, done, error

  useEffect(() => {
    if (!sessionId || !user || loading) return;
    sendToken();
  }, [user, loading, sessionId]);

  async function sendToken() {
    setStatus('sending');
    try {
      const token = await getIdToken();
      if (!token) {
        setStatus('error');
        return;
      }

      const resp = await fetch(`${API_BASE}/auth/desktop/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, token }),
      });

      if (resp.ok) {
        setStatus('done');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  if (!sessionId) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.icon}>&#10005;</div>
          <h2 style={styles.title}>Invalid Link</h2>
          <p style={styles.desc}>This authorization link is invalid or expired.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div className="loading-spinner" />
          <p style={styles.desc}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>Aether</div>
          <h2 style={styles.title}>Sign in to authorize desktop app</h2>
          <p style={styles.desc}>Please sign in first, then this page will authorize your desktop app automatically.</p>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ ...styles.icon, color: '#62fae3' }}>&#10003;</div>
          <h2 style={styles.title}>Desktop App Authorized</h2>
          <p style={styles.desc}>You can close this tab and return to the Aether desktop app.</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ ...styles.icon, color: '#ff6e84' }}>&#10005;</div>
          <h2 style={styles.title}>Authorization Failed</h2>
          <p style={styles.desc}>The session may have expired. Please try again from the desktop app.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div className="loading-spinner" />
        <h2 style={styles.title}>Authorizing desktop app...</h2>
        <p style={styles.desc}>Signed in as {user.email}</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0e0e0e',
    padding: 24,
  },
  card: {
    textAlign: 'center',
    maxWidth: 400,
    padding: '48px 32px',
    background: '#1a1919',
    borderRadius: 16,
    border: '1px solid #494847',
  },
  logo: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: '2rem',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #b79fff, #62fae3)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: 24,
  },
  icon: {
    fontSize: '3rem',
    marginBottom: 16,
    color: '#b79fff',
  },
  title: {
    color: '#fff',
    fontSize: '1.25rem',
    fontWeight: 600,
    marginBottom: 8,
  },
  desc: {
    color: '#adaaaa',
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
};
