import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await login();
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.code ? `${err.code}: ${err.message}` : err.message);
    } finally {
      setLoading(false);
    }
  }

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

      <button
        className="btn-primary"
        onClick={handleLogin}
        disabled={loading}
        style={{ fontSize: '1rem', padding: 'var(--space-3) var(--space-8)' }}
        id="login-google"
      >
        {loading ? t('signing_in') : t('sign_in_google')}
      </button>

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
