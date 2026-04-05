import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { notesAPI } from '../api';
import { trackLinkCapture, trackScreenView } from '../analytics';

export default function SharePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => { trackScreenView('CaptureLink'); }, []);

  async function handleShare(e) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await notesAPI.shareURL(url.trim());
      trackLinkCapture(url.trim(), 'web');
      navigate('/vault');
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="main-content" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-panel fade-in" style={{ position: 'static', maxWidth: '520px' }}>
        <h2 className="modal-title">{t('share')}</h2>
        <p className="modal-subtitle">
          {t('capture_link_desc') || "Drop a URL and let AI extract & summarize the content"}
        </p>

        <form onSubmit={handleShare}>
          <input
            className="modal-input"
            type="url"
            placeholder={t('share_url_placeholder') || "https://youtube.com/watch?v=... or any article URL"}
            value={url}
            onChange={e => setUrl(e.target.value)}
            id="share-url-input"
            autoFocus
          />

          <button
            className="btn-primary"
            type="submit"
            disabled={loading || !url.trim()}
            style={{ width: '100%', marginTop: 'var(--space-4)' }}
            id="share-submit"
          >
            {loading ? (
              <>
                <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                {t('sending') || 'Sending...'}
              </>
            ) : (
              t('capture_link') || '⚡ Capture Link'
            )}
          </button>
        </form>

        {error && (
          <div className="toast error" style={{ position: 'static', transform: 'none' }}>
            ❌ {error}
          </div>
        )}

        <div style={{ textAlign: 'center', paddingTop: 'var(--space-3)' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--outline)' }}>
            {t('share_url_supported_types') || 'Supports YouTube, articles, blogs, and documentation'}
          </p>
        </div>
      </div>
    </div>
  );
}
