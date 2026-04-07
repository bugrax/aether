import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { notesAPI, synthesisAPI, activityAPI, entitiesAPI } from '../api';
import { trackNoteOpen, trackLabelFilter, trackScreenView } from '../analytics';

function translateLabel(name, t) {
  const key = 'label_' + name.toLowerCase();
  const translated = t(key);
  return translated !== key ? translated : name;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, thisWeek: 0, processing: 0 });
  const [topLabels, setTopLabels] = useState([]);
  const [recentNotes, setRecentNotes] = useState([]);
  const [synthPages, setSynthPages] = useState([]);
  const [activities, setActivities] = useState([]);
  const [topEntities, setTopEntities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trackScreenView('Dashboard');
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [statsData, notesData, synthData, actData, entData] = await Promise.all([
        notesAPI.stats(),
        notesAPI.list({ limit: 3, offset: 0 }),
        synthesisAPI.list().catch(() => ({ pages: [] })),
        activityAPI.list().catch(() => ({ activities: [] })),
        entitiesAPI.list().catch(() => ({ entities: [] })),
      ]);
      setSynthPages((synthData.pages || []).slice(0, 5));
      setActivities((actData.activities || []).slice(0, 10));
      setTopEntities((entData.entities || []).slice(0, 8));

      setStats({
        total: statsData.total || 0,
        thisWeek: statsData.this_week || 0,
        processing: statsData.processing || 0,
      });
      setRecentNotes((notesData.notes || []).slice(0, 3));

      // Label counts from stats endpoint (DB-accurate)
      const labelCounts = (statsData.label_counts || [])
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      const maxCount = Math.max(...labelCounts.map(l => l.count), 1);
      setTopLabels(labelCounts.map(l => ({
        id: l.label_id,
        name: l.name,
        color: l.color,
        count: l.count,
        pct: Math.round((l.count / maxCount) * 100),
      })));
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }

  const greeting = () => {
    const hour = new Date().getHours();
    const name = user?.displayName?.split(' ')[0] || '';
    if (lang === 'tr') {
      if (hour < 12) return `Gunaydin ${name}`;
      if (hour < 18) return `Iyi gunler ${name}`;
      return `Iyi aksamlar ${name}`;
    }
    if (hour < 12) return `Good morning, ${name}`;
    if (hour < 18) return `Good afternoon, ${name}`;
    return `Good evening, ${name}`;
  };

  const dateStr = new Date().toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  if (loading) {
    return (
      <div className="main-content">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="main-content dash-page">
      {/* Greeting */}
      <div className="dash-greeting">
        <h1 className="dash-hello">{greeting()}</h1>
        <p className="dash-date">{dateStr}</p>
      </div>

      {/* Stats */}
      <div className="dash-stats">
        <div className="dash-stat-card" onClick={() => navigate('/vault/list')}>
          <span className="dash-stat-number">{stats.total}</span>
          <span className="dash-stat-label">{lang === 'tr' ? 'Toplam Not' : 'Total Notes'}</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-number">{stats.thisWeek}</span>
          <span className="dash-stat-label">{lang === 'tr' ? 'Bu Hafta' : 'This Week'}</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-number" style={{ color: stats.processing > 0 ? 'var(--primary)' : undefined }}>
            {stats.processing}
          </span>
          <span className="dash-stat-label">{lang === 'tr' ? 'Isleniyor' : 'Processing'}</span>
        </div>
      </div>

      {/* Top Labels */}
      {topLabels.length > 0 && (
        <div className="dash-section">
          <h2 className="dash-section-title">{lang === 'tr' ? 'Konu Dagilimi' : 'Topics'}</h2>
          <div className="dash-labels">
            {topLabels.map(l => (
              <div key={l.id} className="dash-label-row" onClick={() => { trackLabelFilter(l.name); navigate(`/vault/list?label_id=${l.id}`); }}>
                <span className="dash-label-name">{translateLabel(l.name, t)}</span>
                <div className="dash-label-bar-bg">
                  <div className="dash-label-bar" style={{ width: l.pct + '%', backgroundColor: l.color || '#9093ff' }} />
                </div>
                <span className="dash-label-count">{l.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge Graph */}
      <div className="dash-section" onClick={() => navigate('/vault/graph')} style={{ cursor: 'pointer' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--space-4)', background: 'var(--surface-container-low)',
          border: '1px solid var(--outline-variant)', borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/>
              <line x1="8.5" y1="7.5" x2="15.5" y2="16.5"/><line x1="15.5" y1="7.5" x2="8.5" y2="16.5"/>
            </svg>
            <div>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--on-surface)' }}>
                {lang === 'tr' ? 'Bilgi Haritası' : 'Knowledge Graph'}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--outline)', display: 'block' }}>
                {lang === 'tr' ? 'Notlarınız arasındaki bağlantıları keşfedin' : 'Explore connections between your notes'}
              </span>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--outline)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>

      {/* Entities */}
      {topEntities.length > 0 && (
        <div className="dash-section">
          <div className="dash-section-header">
            <h2 className="dash-section-title">{lang === 'tr' ? 'Varliklar' : 'Entities'}</h2>
            <button className="dash-see-all" onClick={() => navigate('/entities')}>
              {lang === 'tr' ? 'Tumunu Gor' : 'See All'} →
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {topEntities.map(e => (
              <button
                key={e.id}
                onClick={() => navigate(`/entities/${e.id}`)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px',
                  background: 'var(--surface-container)',
                  border: '1px solid var(--outline-variant)',
                  borderRadius: 'var(--radius-full)',
                  color: 'var(--on-surface)', fontSize: '0.75rem',
                  cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={ev => ev.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={ev => ev.currentTarget.style.borderColor = 'var(--outline-variant)'}
              >
                <span>{({'person':'👤','concept':'💡','tool':'🔧','book':'📚','film':'🎬','music':'🎵','website':'🌐','location':'📍','organization':'🏢','event':'📅'})[e.type] || ''}</span>
                <span>{e.name}</span>
                <span style={{ color: 'var(--outline)', fontWeight: 600 }}>{e.note_count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Synthesis Pages */}
      {synthPages.length > 0 && (
        <div className="dash-section">
          <h2 className="dash-section-title">{lang === 'tr' ? 'Bilgi Sentezleri' : 'Knowledge Synthesis'}</h2>
          <div className="dash-recent">
            {synthPages.map(page => (
              <article key={page.id} className="dash-recent-card" style={{ borderLeft: '3px solid var(--primary)' }}
                onClick={() => navigate(`/vault/synthesis/${page.id}`)}>
                <div className="dash-recent-info">
                  <span className="dash-recent-title">{page.title}</span>
                  <span className="dash-recent-label" style={{ color: 'var(--primary)' }}>
                    {page.note_count} {lang === 'tr' ? 'not' : 'notes'} · {translateLabel(page.topic, t)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Recent Notes */}
      {recentNotes.length > 0 && (
        <div className="dash-section">
          <div className="dash-section-header">
            <h2 className="dash-section-title">{lang === 'tr' ? 'Son Eklenenler' : 'Recent'}</h2>
            <button className="dash-see-all" onClick={() => navigate('/vault/list')}>
              {lang === 'tr' ? 'Tumunu Gor' : 'See All'} →
            </button>
          </div>
          <div className="dash-recent">
            {recentNotes.map(note => (
              <article key={note.id} className="dash-recent-card" onClick={() => { trackNoteOpen(note.id, 'dashboard'); navigate(`/vault/${note.id}`); }}>
                {note.thumbnail_url && (
                  <div className="dash-recent-thumb">
                    <img src={note.thumbnail_url} alt="" loading="lazy" />
                  </div>
                )}
                <div className="dash-recent-info">
                  <span className="dash-recent-title">{note.title || 'Untitled'}</span>
                  {note.labels?.[0] && (
                    <span className="dash-recent-label" style={{ color: note.labels[0].color }}>
                      {translateLabel(note.labels[0].name, t)}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      {activities.length > 0 && (
        <div className="dash-section">
          <h2 className="dash-section-title">{lang === 'tr' ? 'Son Aktiviteler' : 'Recent Activity'}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {activities.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)',
                fontSize: '0.75rem', color: 'var(--on-surface-variant)',
              }}
              onClick={() => a.note_id && navigate(`/vault/${a.note_id}`)}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: a.action === 'note_processed' ? 'var(--secondary)' :
                    a.action === 'relation_found' ? 'var(--primary)' :
                    a.action === 'synthesis_created' ? 'var(--tertiary)' : 'var(--outline)',
                }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.title}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--outline)', flexShrink: 0 }}>
                  {new Date(a.created_at).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
