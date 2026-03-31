import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

export default function SharedNotePage() {
  const { token } = useParams();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/shared/${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(setNote)
      .catch(() => setError('This shared note does not exist or has been removed.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0e0e0e' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0e0e0e', color: '#fff', gap: '1rem' }}>
        <span style={{ fontSize: '3rem' }}>🔒</span>
        <p style={{ color: '#adaaaa' }}>{error}</p>
        <a href="https://aether.relayhaus.org" style={{ color: '#b79fff', textDecoration: 'none' }}>← Aether</a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e0e', color: '#fff', fontFamily: "'Manrope', sans-serif" }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #494847', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="https://aether.relayhaus.org" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '1.1rem', color: '#b79fff', textDecoration: 'none' }}>
          Aether
        </a>
        <span style={{ fontSize: '0.75rem', color: '#777575', fontFamily: "'Space Grotesk', sans-serif" }}>Shared Insight</span>
      </header>

      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        {/* Thumbnail */}
        {note.thumbnail_url && !note.thumbnail_url.startsWith('data:') && (
          <div style={{ borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <img src={note.thumbnail_url} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
        )}

        {/* Title */}
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem', lineHeight: 1.3 }}>
          {note.title}
        </h1>

        {/* Labels */}
        {note.labels && note.labels.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {note.labels.map(label => (
              <span key={label.id} style={{
                fontSize: '0.7rem',
                fontFamily: "'Space Grotesk', sans-serif",
                padding: '2px 10px',
                borderRadius: '4px',
                borderLeft: `3px solid ${label.color || '#8B5CF6'}`,
                background: '#1a1919',
                color: '#adaaaa',
              }}>
                {label.name}
              </span>
            ))}
          </div>
        )}

        {/* Source URL */}
        {note.source_url && (
          <a href={note.source_url} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '0.8rem', color: '#62fae3', textDecoration: 'none', marginBottom: '2rem',
          }}>
            🔗 {(() => { try { return new URL(note.source_url).hostname.replace('www.', ''); } catch { return 'Source'; } })()}
          </a>
        )}

        {/* AI Insight */}
        {note.ai_insight && (
          <div style={{ background: '#131313', borderRadius: '12px', border: '1px solid #494847', padding: '1.5rem', marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
              <span>✨</span>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '0.9rem' }}>AI Insight</span>
            </div>
            <div style={{ fontSize: '0.875rem', lineHeight: 1.8, color: '#e0e0e0', whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{
                __html: note.ai_insight
                  .replace(/^### (.+)$/gm, '<h4 style="font-family: Space Grotesk; font-size: 1rem; font-weight: 600; margin: 1.2rem 0 0.4rem; color: #fff;">$1</h4>')
                  .replace(/^## (.+)$/gm, '<h3 style="font-family: Space Grotesk; font-size: 1.1rem; font-weight: 700; margin: 1.5rem 0 0.5rem; color: #fff;">$1</h3>')
                  .replace(/^# (.+)$/gm, '<h2 style="font-family: Space Grotesk; font-size: 1.3rem; font-weight: 700; margin: 0 0 0.5rem; color: #fff;">$1</h2>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong style="color: #fff;">$1</strong>')
                  .replace(/^---$/gm, '<hr style="border: none; border-top: 1px solid #494847; margin: 1rem 0;" />')
                  .replace(/^- (.+)$/gm, '<div style="padding-left: 1rem; margin: 0.3rem 0;">• $1</div>')
              }}
            />
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid #494847', textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: '#777575' }}>
            Shared via <a href="https://aether.relayhaus.org" style={{ color: '#b79fff', textDecoration: 'none' }}>Aether</a> — Where links become knowledge
          </p>
        </div>
      </main>
    </div>
  );
}
