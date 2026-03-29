import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { notesAPI } from '../api';

const STATUS_STEPS = [
  { key: 'queued', label: 'Queued', icon: '📋', description: 'Added to processing queue' },
  { key: 'processing', label: 'Extracting', icon: '🔍', description: 'Extracting content from URL...' },
  { key: 'summarizing', label: 'Summarizing', icon: '🧠', description: 'AI is generating summary...' },
  { key: 'ready', label: 'Ready', icon: '✅', description: 'Content processed successfully!' },
];

function getStepIndex(status) {
  if (status === 'error') return -1;
  if (status === 'ready') return 3;
  if (status === 'processing') return 1;
  return 0;
}

export default function SharePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [noteData, setNoteData] = useState(null);
  const [currentStatus, setCurrentStatus] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const eventSourceRef = useRef(null);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  async function handleShare(e) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setNoteData(null);
    setCurrentStatus('queued');

    try {
      const data = await notesAPI.shareURL(url.trim());
      setNoteData(data.note);
      setCurrentStatus('processing');

      // Start SSE stream for real-time status
      const noteId = data.note.id;
      eventSourceRef.current = notesAPI.streamStatus(
        noteId,
        (statusData) => {
          setCurrentStatus(statusData.status);
          if (statusData.title && statusData.title !== 'Processing...') {
            setNoteData(prev => ({ ...prev, title: statusData.title }));
          }
        },
        () => {
          // SSE error — fallback to polling
          setCurrentStatus(prev => prev === 'processing' ? 'processing' : prev);
        }
      );
    } catch (err) {
      setError(err.message);
      setCurrentStatus(null);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    if (eventSourceRef.current) eventSourceRef.current.close();
    setUrl('');
    setNoteData(null);
    setCurrentStatus(null);
    setError(null);
  }

  const currentStepIndex = currentStatus ? getStepIndex(currentStatus) : -1;

  return (
    <div className="main-content" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-panel fade-in" style={{ position: 'static', maxWidth: '520px' }}>
        {!noteData ? (
          <>
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
          </>
        ) : (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div style={{ textAlign: 'center' }}>
              <h2 className="modal-title" style={{ fontSize: '1.5rem' }}>
                {currentStatus === 'ready' ? t('done') || '🎉 Done!' : t('processing') || '🌀 Processing...'}
              </h2>
              {noteData.title && noteData.title !== 'Processing...' && (
                <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem', marginTop: 'var(--space-2)' }}>
                  {noteData.title}
                </p>
              )}
            </div>

            {/* Progress Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {STATUS_STEPS.map((step, i) => {
                const isActive = i === currentStepIndex;
                const isDone = i < currentStepIndex;
                const isPending = i > currentStepIndex;

                return (
                  <div key={step.key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-lg)',
                    background: isActive ? 'rgba(183, 159, 255, 0.08)' : 'transparent',
                    opacity: isPending ? 0.35 : 1,
                    transition: 'all 0.3s ease',
                  }}>
                    <span style={{ fontSize: '1.25rem', width: '2rem', textAlign: 'center' }}>
                      {isDone ? '✅' : isActive ? step.icon : '○'}
                    </span>
                    <div>
                      <div style={{
                        fontFamily: 'var(--font-label)',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: isActive ? 'var(--primary)' : isDone ? 'var(--on-surface)' : 'var(--outline)',
                      }}>
                        {t(`status_step_${step.key}_label`) || step.label}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--outline)',
                      }}>
                        {t(`status_step_${step.key}_description`) || step.description}
                      </div>
                    </div>
                    {isActive && (
                      <div className="loading-spinner" style={{
                        width: 16, height: 16, borderWidth: 2, marginLeft: 'auto',
                      }} />
                    )}
                  </div>
                );
              })}

              {currentStatus === 'error' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'rgba(255, 110, 132, 0.08)',
                }}>
                  <span style={{ fontSize: '1.25rem' }}>❌</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--error)' }}>
                      {t('processing_failed') || 'Processing Failed'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--outline)' }}>
                      {t('processing_failed_desc') || 'The content couldn\'t be extracted. Try another URL.'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              {currentStatus === 'ready' && (
                <button
                  className="btn-primary"
                  onClick={() => navigate(`/vault/${noteData.id}`)}
                  style={{ flex: 1 }}
                >
                  {t('open_note') || 'Open Note →'}
                </button>
              )}
              <button
                className="btn-secondary"
                onClick={currentStatus === 'ready' || currentStatus === 'error' ? handleReset : () => navigate('/vault')}
                style={{ flex: currentStatus === 'ready' ? 'unset' : 1 }}
              >
                {currentStatus === 'ready' || currentStatus === 'error' ? 'Process Another' : '← Back to Vault'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
