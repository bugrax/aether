import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { synthesisAPI } from '../api';

function renderMarkdown(text) {
  if (!text) return '';
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^[-•] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

export default function SynthesisViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [page, setPage] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPage();
  }, [id]);

  async function loadPage() {
    setLoading(true);
    try {
      const data = await synthesisAPI.get(id);
      setPage(data.page);
      setNotes(data.notes || []);
    } catch (err) {
      console.error('Failed to load synthesis page:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="main-content">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="main-content">
        <button className="editor-back" onClick={() => navigate('/vault')}>
          ← {lang === 'tr' ? 'Geri' : 'Back'}
        </button>
        <p style={{ color: 'var(--outline)', textAlign: 'center' }}>
          {lang === 'tr' ? 'Sentez sayfası bulunamadı' : 'Synthesis page not found'}
        </p>
      </div>
    );
  }

  return (
    <div className="main-content">
      <button className="editor-back" onClick={() => navigate('/vault')}>
        ← {lang === 'tr' ? 'Geri' : 'Back'}
      </button>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 600, color: 'var(--primary)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {lang === 'tr' ? 'Bilgi Sentezi' : 'Knowledge Synthesis'} · {page.note_count} {lang === 'tr' ? 'kaynak' : 'sources'}
        </span>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 4 }}>{page.title}</h1>
      </div>

      <div
        style={{
          fontSize: '0.875rem', lineHeight: 1.7, color: 'var(--on-surface)',
        }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }}
      />

      {notes.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--outline-variant)' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--on-surface-variant)' }}>
            {lang === 'tr' ? 'Kaynaklar' : 'Contributing Notes'} ({notes.length})
          </h3>
          {notes.map(note => (
            <div key={note.id}
              onClick={() => navigate(`/vault/${note.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--surface-container-low)',
                borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)',
                cursor: 'pointer', border: '1px solid var(--outline-variant)',
              }}>
              {note.thumbnail_url && (
                <img src={note.thumbnail_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
              )}
              <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface)' }}>{note.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
