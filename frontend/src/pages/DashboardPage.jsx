import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { notesAPI, labelsAPI, synthesisAPI } from '../api';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trackScreenView('Dashboard');
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [notesData, labelsData, synthData] = await Promise.all([
        notesAPI.list({ limit: 100, offset: 0 }),
        labelsAPI.list(),
        synthesisAPI.list().catch(() => ({ pages: [] })),
      ]);
      setSynthPages((synthData.pages || []).slice(0, 5));

      const notes = notesData.notes || [];
      const total = notesData.total || notes.length;
      const now = new Date();
      const weekAgo = new Date(now - 7 * 86400000);
      const thisWeek = notes.filter(n => new Date(n.created_at) > weekAgo).length;
      const processing = notes.filter(n => n.status === 'processing').length;

      setStats({ total, thisWeek, processing });
      setRecentNotes(notes.slice(0, 3));

      // Count notes per label
      const labelCounts = {};
      for (const note of notes) {
        for (const label of (note.labels || [])) {
          labelCounts[label.id] = (labelCounts[label.id] || 0) + 1;
        }
      }

      const labels = (labelsData.labels || [])
        .map(l => ({ ...l, count: labelCounts[l.id] || 0 }))
        .filter(l => l.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      const maxCount = Math.max(...labels.map(l => l.count), 1);
      setTopLabels(labels.map(l => ({ ...l, pct: Math.round((l.count / maxCount) * 100) })));
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

    </div>
  );
}
