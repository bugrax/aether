import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { adminAPI } from '../api';

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return String(s); }
}
function fmtDateTime(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return String(s); }
}
function host(url) { try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; } }

const cardBg = 'var(--surface-container)';
const cardBorder = '1px solid var(--surface-container-high)';
const rowBorder = '1px solid var(--surface-container-high)';
const statusColor = { ready: 'var(--secondary)', processing: 'var(--primary)', error: 'var(--error)', draft: 'var(--outline)' };

function StatusPill({ status }) {
  const col = statusColor[status] || 'var(--outline)';
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, color: col, border: `1px solid ${col}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {status}
    </span>
  );
}

function NoteRow({ n, showOwner, onOpen }) {
  return (
    <button onClick={() => onOpen(n.id)} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: rowBorder, padding: '10px 6px', cursor: 'pointer' }}>
      {n.thumbnail_url
        ? <img src={n.thumbnail_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--surface-container-high)', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--on-surface)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title || '(untitled)'}</div>
        <div style={{ color: 'var(--on-surface-variant)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {host(n.source_url)}{showOwner && n.owner_email ? ` · ${n.owner_email}` : ''} · {fmtDateTime(n.created_at)}
        </div>
      </div>
      <StatusPill status={n.status} />
    </button>
  );
}

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('users'); // 'users' | 'feed'
  const [users, setUsers] = useState([]);
  const [feed, setFeed] = useState([]);
  const [selUser, setSelUser] = useState(null);
  const [userNotes, setUserNotes] = useState(null);
  const [selNote, setSelNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, u] = await Promise.all([adminAPI.stats(), adminAPI.users()]);
        setStats(s); setUsers(u.users || []);
      } catch (e) { setErr(e.message || 'Failed to load admin data'); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (tab === 'feed' && feed.length === 0) {
      adminAPI.feed({ limit: 60 }).then(d => setFeed(d.notes || [])).catch(() => {});
    }
  }, [tab]); // eslint-disable-line

  async function openUser(u) {
    setSelUser(u); setUserNotes(null);
    try { const d = await adminAPI.userNotes(u.id, { limit: 200 }); setUserNotes(d.notes || []); }
    catch { setUserNotes([]); }
  }
  async function openNote(id) {
    setSelNote('loading');
    try { setSelNote(await adminAPI.note(id)); }
    catch (e) { setSelNote({ error: e.message || 'Failed' }); }
  }

  if (!isAdmin) return <div className="main-content"><p style={{ color: 'var(--on-surface-variant)' }}>Bu sayfaya erişim yetkiniz yok.</p></div>;
  if (loading) return <div className="main-content"><div className="loading-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spinner" /></div></div>;
  if (err) return <div className="main-content"><p style={{ color: 'var(--error)' }}>Hata: {err}</p></div>;

  const statCards = [
    ['Users', stats?.total_users], ['Notes', stats?.total_notes],
    ['Today', stats?.notes_today], ['This week', stats?.notes_week],
    ['Processing', stats?.processing], ['Errors', stats?.errored],
    ['Entities', stats?.total_entities], ['Vaults', stats?.total_vaults],
  ];

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">Admin</h1>
      </div>
      <p style={{ color: 'var(--on-surface-variant)', fontSize: 14, marginTop: 'calc(-1 * var(--space-3))' }}>
        Tüm kullanıcılar ve kaydettikleri içerik (salt-okunur).
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
        {statCards.map(([label, val]) => (
          <div key={label} style={{ background: cardBg, border: cardBorder, borderRadius: 'var(--radius-md)', padding: 16 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>{val ?? '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[['users', `Kullanıcılar (${users.length})`], ['feed', 'Son Kaydedilenler']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-label)',
              background: tab === k ? 'var(--primary)' : 'transparent',
              color: tab === k ? 'var(--surface)' : 'var(--on-surface-variant)',
              border: `1px solid ${tab === k ? 'var(--primary)' : 'var(--surface-container-high)'}`, fontWeight: 600 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div style={{ background: cardBg, border: cardBorder, borderRadius: 'var(--radius-md)', padding: 8 }}>
          {users.map(u => (
            <button key={u.id} onClick={() => openUser(u)}
              style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: rowBorder, padding: '12px 8px', cursor: 'pointer' }}>
              {u.avatar_url
                ? <img src={u.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: 999, flexShrink: 0 }} />
                : <div style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--primary)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{(u.email || '?')[0].toUpperCase()}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--on-surface)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                <div style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>kayıt: {fmtDate(u.created_at)} · son not: {fmtDate(u.last_note_at)}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 16 }}>{u.note_count}</div>
                <div style={{ color: 'var(--on-surface-variant)', fontSize: 11 }}>not</div>
              </div>
            </button>
          ))}
          {users.length === 0 && <div style={{ padding: 24, color: 'var(--on-surface-variant)' }}>Kullanıcı yok.</div>}
        </div>
      )}

      {/* Feed tab */}
      {tab === 'feed' && (
        <div style={{ background: cardBg, border: cardBorder, borderRadius: 'var(--radius-md)', padding: 8 }}>
          {feed.map(n => <NoteRow key={n.id} n={n} showOwner onOpen={openNote} />)}
          {feed.length === 0 && <div style={{ padding: 24, color: 'var(--on-surface-variant)' }}>Yükleniyor…</div>}
        </div>
      )}

      {/* User notes drawer */}
      {selUser && (
        <div onClick={() => setSelUser(null)} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)' }}>{selUser.email}</div>
                <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{selUser.note_count} not</div>
              </div>
              <button onClick={() => setSelUser(null)} style={closeBtn}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, margin: '0 -8px' }}>
              {userNotes === null && <div style={{ padding: 16, color: 'var(--on-surface-variant)' }}>Yükleniyor…</div>}
              {userNotes && userNotes.map(n => <NoteRow key={n.id} n={n} onOpen={openNote} />)}
              {userNotes && userNotes.length === 0 && <div style={{ padding: 16, color: 'var(--on-surface-variant)' }}>Bu kullanıcının notu yok.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Note content modal */}
      {selNote && (
        <div onClick={() => setSelNote(null)} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={{ ...panel, maxWidth: 720 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                {selNote === 'loading'
                  ? <div style={{ fontWeight: 700, color: 'var(--on-surface)' }}>Yükleniyor…</div>
                  : <>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)' }}>{selNote.title || '(untitled)'}</div>
                      <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                        <span>{selNote.owner_email}</span><span>·</span><span>{fmtDateTime(selNote.created_at)}</span>
                        {selNote.status && <StatusPill status={selNote.status} />}
                      </div>
                      {selNote.source_url && <a href={selNote.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary)', wordBreak: 'break-all' }}>{selNote.source_url}</a>}
                    </>}
              </div>
              <button onClick={() => setSelNote(null)} style={closeBtn}>✕</button>
            </div>
            {selNote !== 'loading' && (
              <div style={{ overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--on-surface-variant)', fontSize: 14, lineHeight: 1.6 }}>
                {selNote.error ? <span style={{ color: 'var(--error)' }}>Hata: {selNote.error}</span>
                  : (selNote.ai_insight || selNote.content || '(içerik yok)')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 };
const panel = { background: 'var(--surface-container)', border: '1px solid var(--surface-container-high)', borderRadius: 'var(--radius-md)', width: '100%', maxWidth: 560, maxHeight: '85vh', padding: 16, display: 'flex', flexDirection: 'column' };
const closeBtn = { background: 'transparent', border: 'none', color: 'var(--on-surface-variant)', fontSize: 18, cursor: 'pointer', flexShrink: 0, lineHeight: 1 };
