import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { entitiesAPI } from '../api';

const TYPE_ICONS = {
  person: '👤', concept: '💡', tool: '🔧', book: '📚', film: '🎬',
  music: '🎵', website: '🌐', location: '📍', organization: '🏢', event: '📅',
};

const TYPE_COLORS = {
  person: '#FF6B6B', concept: '#4ECDC4', tool: '#45B7D1', book: '#96CEB4', film: '#FFEAA7',
  music: '#DDA0DD', website: '#74B9FF', location: '#FD79A8', organization: '#A29BFE', event: '#FDCB6E',
};

export default function EntityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [entity, setEntity] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEntity();
  }, [id]);

  async function loadEntity() {
    try {
      const data = await entitiesAPI.get(id);
      setEntity(data.entity);
      setNotes(data.notes || []);
    } catch (err) {
      console.error('Entity load failed:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="main-content"><div className="loading-state"><div className="loading-spinner" /></div></div>;
  }

  if (!entity) {
    return (
      <div className="main-content">
        <p style={{ color: 'var(--on-surface-variant)' }}>Entity not found.</p>
      </div>
    );
  }

  const color = TYPE_COLORS[entity.type] || '#9093ff';

  return (
    <div className="main-content">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button
          onClick={() => navigate('/entities')}
          style={{ background: 'none', border: 'none', color: 'var(--on-surface-variant)', cursor: 'pointer', fontSize: '0.9rem' }}
        >
          {lang === 'tr' ? '← Varliklar' : '← Entities'}
        </button>
      </div>

      <div className="fade-in" style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Entity header */}
        <div style={{
          padding: 'var(--space-5)',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          border: `1px solid ${color}40`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <span style={{ fontSize: '2rem' }}>{TYPE_ICONS[entity.type] || ''}</span>
            <div>
              <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--on-surface)' }}>{entity.name}</h1>
              <span style={{
                fontSize: '0.75rem', color, textTransform: 'capitalize',
                padding: '2px 10px', borderRadius: 'var(--radius-full)',
                background: color + '20',
              }}>
                {entity.type}
              </span>
            </div>
          </div>
          {entity.description && (
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
              {entity.description}
            </p>
          )}
          <div style={{ marginTop: 'var(--space-3)', fontSize: '0.75rem', color: 'var(--outline)' }}>
            {lang === 'tr' ? `${notes.length} notta bahsedildi` : `Mentioned in ${notes.length} notes`}
          </div>
        </div>

        {/* Related notes */}
        <div>
          <h2 style={{ fontSize: '1rem', marginBottom: 'var(--space-3)', color: 'var(--on-surface)' }}>
            {lang === 'tr' ? 'Iliskili Notlar' : 'Related Notes'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {notes.map(note => (
              <button
                key={note.id}
                onClick={() => navigate(`/vault/${note.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--surface)',
                  border: '1px solid var(--outline-variant)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--outline-variant)'}
              >
                {note.thumbnail_url && (
                  <img
                    src={note.thumbnail_url}
                    alt=""
                    style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.875rem', fontWeight: 500, color: 'var(--on-surface)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {note.title || 'Untitled'}
                  </div>
                  {note.context && (
                    <div style={{
                      fontSize: '0.75rem', color: 'var(--on-surface-variant)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {note.context}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
