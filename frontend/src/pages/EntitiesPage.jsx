import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { entitiesAPI } from '../api';
import { trackScreenView } from '../analytics';

const TYPE_ICONS = {
  person: '👤',
  concept: '💡',
  tool: '🔧',
  book: '📚',
  film: '🎬',
  music: '🎵',
  website: '🌐',
  location: '📍',
  organization: '🏢',
  event: '📅',
};

const TYPE_COLORS = {
  person: '#FF6B6B',
  concept: '#4ECDC4',
  tool: '#45B7D1',
  book: '#96CEB4',
  film: '#FFEAA7',
  music: '#DDA0DD',
  website: '#74B9FF',
  location: '#FD79A8',
  organization: '#A29BFE',
  event: '#FDCB6E',
};

export default function EntitiesPage() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { trackScreenView('Entities'); }, []);

  useEffect(() => {
    loadEntities();
  }, [filterType, search]);

  async function loadEntities() {
    try {
      const params = {};
      if (filterType) params.type = filterType;
      if (search) params.q = search;
      const data = await entitiesAPI.list(params);
      setEntities(data.entities || []);
    } catch (err) {
      console.error('Entity load failed:', err);
    } finally {
      setLoading(false);
    }
  }

  // Group entities by type
  const grouped = {};
  for (const e of entities) {
    if (!grouped[e.type]) grouped[e.type] = [];
    grouped[e.type].push(e);
  }

  const types = Object.keys(grouped).sort();

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">
          {lang === 'tr' ? 'Varliklar' : 'Entities'}
        </h1>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={lang === 'tr' ? 'Ara...' : 'Search entities...'}
          style={{
            flex: 1, minWidth: 180,
            background: 'var(--surface-container)', color: 'var(--on-surface)',
            border: '1px solid var(--outline-variant)', borderRadius: 'var(--radius-full)',
            padding: '10px 16px', fontSize: '0.8125rem', outline: 'none',
            WebkitAppearance: 'none',
          }}
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{
            background: 'var(--surface-container)', border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-full)', color: 'var(--on-surface)',
            padding: '10px 16px', fontSize: '0.8125rem', outline: 'none',
            WebkitAppearance: 'none',
          }}
        >
          <option value="">{lang === 'tr' ? 'Tum Tipler' : 'All Types'}</option>
          {Object.entries(TYPE_ICONS).map(([type, icon]) => (
            <option key={type} value={type}>{icon} {type}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-state"><div className="loading-spinner" /></div>
      ) : entities.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.9375rem' }}>
            {lang === 'tr' ? 'Henuz varlik bulunamadi.' : 'No entities extracted yet.'}
          </p>
          <p style={{ color: 'var(--outline)', fontSize: '0.8125rem' }}>
            {lang === 'tr' ? 'Notlariniz islendikce varliklar otomatik cikarilir.' : 'Entities are auto-extracted as your notes are processed.'}
          </p>
        </div>
      ) : (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Type chips */}
          <div style={{
            display: 'flex', gap: '8px', flexWrap: 'wrap',
          }}>
            {types.map(type => {
              const isActive = filterType === type;
              const color = TYPE_COLORS[type] || '#9093ff';
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(isActive ? '' : type)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '6px 12px', borderRadius: 'var(--radius-full)',
                    background: isActive ? color + '25' : 'var(--surface-container)',
                    border: `1px solid ${isActive ? color : 'var(--outline-variant)'}`,
                    color: isActive ? color : 'var(--on-surface-variant)',
                    fontSize: '0.75rem', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '0.8rem' }}>{TYPE_ICONS[type] || ''}</span>
                  <span style={{ textTransform: 'capitalize' }}>{type}</span>
                  <span style={{ fontWeight: 600, opacity: 0.7 }}>{grouped[type]?.length || 0}</span>
                </button>
              );
            })}
          </div>

          {/* Entity grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 'var(--space-3)',
          }}>
            {entities.map(entity => (
              <button
                key={entity.id}
                onClick={() => navigate(`/entities/${entity.id}`)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
                  padding: 'var(--space-4)',
                  background: 'var(--surface)',
                  border: '1px solid var(--outline-variant)',
                  borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = TYPE_COLORS[entity.type] || 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--outline-variant)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ fontSize: '1.25rem' }}>{TYPE_ICONS[entity.type] || ''}</span>
                  <span style={{
                    fontSize: '0.9375rem', fontWeight: 600, color: 'var(--on-surface)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {entity.name}
                  </span>
                  <span style={{
                    fontSize: '0.6875rem', color: TYPE_COLORS[entity.type] || 'var(--outline)',
                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                    background: (TYPE_COLORS[entity.type] || '#9093ff') + '20',
                    textTransform: 'capitalize',
                  }}>
                    {entity.type}
                  </span>
                </div>
                {entity.description && (
                  <p style={{
                    fontSize: '0.75rem', color: 'var(--on-surface-variant)',
                    margin: 0, lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {entity.description}
                  </p>
                )}
                <div style={{ fontSize: '0.6875rem', color: 'var(--outline)' }}>
                  {entity.note_count} {entity.note_count === 1 ? 'note' : 'notes'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
