import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { activityAPI } from '../api';
import { trackScreenView } from '../analytics';

const ACTION_ICONS = {
  note_processed: { icon: '✓', color: 'var(--secondary)', label: 'Note Processed' },
  relation_found: { icon: '🔗', color: 'var(--primary)', label: 'Relations Found' },
  synthesis_created: { icon: '📚', color: 'var(--tertiary)', label: 'Synthesis Created' },
  entities_extracted: { icon: '🧬', color: '#FF6B6B', label: 'Entities Extracted' },
  default: { icon: '•', color: 'var(--outline)', label: 'Activity' },
};

function groupByDate(activities) {
  const groups = {};
  for (const a of activities) {
    const d = new Date(a.created_at);
    const key = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  }
  return groups;
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { trackScreenView('Activity'); }, []);

  useEffect(() => {
    loadActivities();
  }, []);

  async function loadActivities() {
    try {
      const data = await activityAPI.list();
      setActivities(data.activities || []);
    } catch (err) {
      console.error('Activity load failed:', err);
    } finally {
      setLoading(false);
    }
  }

  const grouped = groupByDate(activities);

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">
          {lang === 'tr' ? 'Aktivite' : 'Activity'}
        </h1>
      </div>

      {!loading && activities.length > 0 && (
        <div style={{
          display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-5)',
          fontSize: '0.75rem', color: 'var(--on-surface-variant)',
        }}>
          <span>{activities.length} {lang === 'tr' ? 'aktivite' : 'activities'}</span>
        </div>
      )}

      {loading ? (
        <div className="loading-state"><div className="loading-spinner" /></div>
      ) : activities.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.9375rem' }}>
            {lang === 'tr' ? 'Henuz aktivite yok.' : 'No activity yet.'}
          </p>
        </div>
      ) : (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {Object.entries(grouped).map(([date, dayActivities]) => (
            <div key={date}>
              <div style={{
                fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em',
                color: 'var(--outline)', marginBottom: 'var(--space-3)',
                fontFamily: 'var(--font-display)', fontWeight: 600,
              }}>
                {date}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {dayActivities.map(a => {
                  const info = ACTION_ICONS[a.action] || ACTION_ICONS.default;
                  return (
                    <button
                      key={a.id}
                      onClick={() => a.note_id && navigate(`/vault/${a.note_id}`)}
                      disabled={!a.note_id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                        padding: 'var(--space-3) var(--space-4)',
                        background: 'var(--surface)',
                        border: '1px solid var(--outline-variant)',
                        borderRadius: 'var(--radius-lg)',
                        cursor: a.note_id ? 'pointer' : 'default',
                        textAlign: 'left', width: '100%',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => { if (a.note_id) e.currentTarget.style.borderColor = info.color; }}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--outline-variant)'}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: `${info.color}20`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.875rem', flexShrink: 0,
                      }}>
                        {info.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '0.875rem', fontWeight: 500, color: 'var(--on-surface)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {a.title}
                        </div>
                        {a.description && (
                          <div style={{
                            fontSize: '0.75rem', color: 'var(--on-surface-variant)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {a.description}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--outline)', flexShrink: 0 }}>
                        {new Date(a.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
