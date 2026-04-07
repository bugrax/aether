import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { synthesisAPI } from '../api';
import { trackScreenView } from '../analytics';

export default function SynthesisListPage() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { trackScreenView('SynthesisList'); }, []);

  useEffect(() => { loadPages(); }, []);

  async function loadPages() {
    try {
      const data = await synthesisAPI.list();
      setPages(data.pages || []);
    } catch (err) {
      console.error('Synthesis list failed:', err);
    } finally {
      setLoading(false);
    }
  }

  const totalNotes = pages.reduce((sum, p) => sum + (p.note_count || 0), 0);

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">
          {lang === 'tr' ? 'Bilgi Sentezleri' : 'Knowledge Synthesis'}
        </h1>
      </div>

      {!loading && pages.length > 0 && (
        <div style={{
          display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-5)',
          fontSize: '0.75rem', color: 'var(--on-surface-variant)',
        }}>
          <span>{pages.length} {lang === 'tr' ? 'sentez' : 'syntheses'}</span>
          <span style={{ color: 'var(--outline)' }}>·</span>
          <span>{totalNotes} {lang === 'tr' ? 'kaynak not' : 'source notes'}</span>
        </div>
      )}

      {loading ? (
        <div className="loading-state"><div className="loading-spinner" /></div>
      ) : pages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.9375rem' }}>
            {lang === 'tr' ? 'Henuz sentez sayfasi yok.' : 'No synthesis pages yet.'}
          </p>
          <p style={{ color: 'var(--outline)', fontSize: '0.8125rem' }}>
            {lang === 'tr' ? 'Notlariniz islendikce sentezler otomatik olusturulur.' : 'Syntheses are auto-generated as your notes are processed.'}
          </p>
        </div>
      ) : (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {pages.map(page => (
            <button
              key={page.id}
              onClick={() => navigate(`/vault/synthesis/${page.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
                padding: 'var(--space-4) var(--space-5)',
                background: 'var(--surface)',
                border: '1px solid var(--outline-variant)',
                borderLeft: '3px solid var(--primary)',
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--outline-variant)'; e.currentTarget.style.borderLeftColor = 'var(--primary)'; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.9375rem', fontWeight: 600, color: 'var(--on-surface)',
                  marginBottom: 4,
                }}>
                  {page.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: '0.75rem' }}>
                  <span style={{
                    color: 'var(--primary)',
                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                    background: 'rgba(183, 159, 255, 0.1)',
                    textTransform: 'capitalize',
                  }}>
                    {page.topic}
                  </span>
                  <span style={{ color: 'var(--on-surface-variant)' }}>
                    {page.note_count} {lang === 'tr' ? 'not' : 'notes'}
                  </span>
                  <span style={{ color: 'var(--outline)' }}>
                    {new Date(page.updated_at).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--outline)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
