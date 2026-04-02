import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(provider = 'google') {
    setError(null);
    setLoading(true);
    try {
      await login(provider);
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.code ? `${err.code}: ${err.message}` : err.message);
    } finally {
      setLoading(false);
    }
  }

  const btnStyle = {
    fontSize: '1rem',
    padding: 'var(--space-3) var(--space-8)',
    width: '100%',
    maxWidth: '320px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-3)',
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-5)',
      background: 'var(--background)',
      padding: 'var(--space-8)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '4rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, var(--primary), var(--tertiary))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 'var(--space-2)',
        }}>
          <a href="https://aether.relayhaus.org" style={{ textDecoration: 'none', WebkitTextFillColor: 'inherit' }}>Aether</a>
        </h1>
        <p style={{
          color: 'var(--secondary)',
          fontSize: '1rem',
          fontFamily: 'var(--font-body)',
          fontStyle: 'italic',
          letterSpacing: '0.02em',
          marginBottom: 'var(--space-4)',
        }}>
          {t('tagline')}
        </p>
        <p style={{
          color: 'var(--on-surface-variant)',
          fontSize: '0.9rem',
          fontFamily: 'var(--font-body)',
          maxWidth: '400px',
          lineHeight: 1.7,
          margin: '0 auto',
          whiteSpace: 'pre-line',
        }}>
          {t('login_desc')}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center', width: '100%' }}>
        <button
          className="btn-primary"
          onClick={() => handleLogin('apple')}
          disabled={loading}
          style={{
            ...btnStyle,
            background: '#fff',
            color: '#000',
            border: 'none',
            fontWeight: 600,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          {loading ? t('signing_in') : t('sign_in_apple')}
        </button>

        <button
          className="btn-primary"
          onClick={() => handleLogin('google')}
          disabled={loading}
          style={{
            ...btnStyle,
            background: 'var(--surface-container-high)',
            color: 'var(--on-surface)',
            border: '1px solid var(--outline-variant)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading ? t('signing_in') : t('sign_in_google')}
        </button>
      </div>

      {error && (
        <div style={{
          background: 'rgba(255, 110, 132, 0.1)',
          border: '1px solid var(--error)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-3) var(--space-5)',
          maxWidth: '420px',
          textAlign: 'center',
        }}>
          <p style={{ color: 'var(--error)', fontSize: '0.8125rem', margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      <p style={{ color: 'var(--outline)', fontSize: '0.75rem' }}>
        {t('login_footer')}
      </p>
    </div>
  );
}
