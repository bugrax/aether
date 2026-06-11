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

const surface = { background: 'var(--surface)', border: '1px solid var(--outline-dim, rgba(255,255,255,0.08))', borderRadius: 12 };
const statusColor = { ready: 'var(--secondary, #62fae3)', processing: 'var(--primary, #b79fff)', error: 'var(--error, #ff6b6b)', draft: 'var(--outline, #888)' };

function StatusPill({ status }) {
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, color: statusColor[status] || 'var(--outline)', border: `1px solid ${statusColor[status] || 'var(--outline)'}`, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

function NoteRow({ n, showOwner, onOpen }) {
  return (
    <button onClick={() => onOpen(n.id)} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--outline-dim, rgba(255,255,255,0.06))', padding: '10px 4px', cursor: 'pointer' }}>
      {n.thumbnail_url
        ? <img src={n.thumbnail_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--void-elevated, rgba(255,255,255,0.05))', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--on-surface, #fff)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title || '(untitled)'}</div>
        <div style={{ color: 'var(--on-surface-variant, #999)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

  if (!isAdmin) return <div style={{ padding: 32, color: 'var(--on-surface-variant)' }}>Bu sayfaya erişim yetkiniz yok.</div>;
  if (loading) return <div className="loading-state" style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spinner" /></div>;
  if (err) return <div style={{ padding: 32, color: 'var(--error)' }}>Hata: {err}</div>;

  const statCards = [
    ['Users', stats?.total_users], ['Notes', stats?.total_notes],
    ['Today', stats?.notes_today], ['This week', stats?.notes_week],
    ['Processing', stats?.processing], ['Errors', stats?.errored],
    ['Entities', stats?.total_entities], ['Vaults', stats?.total_vaults],
  ];

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, marginBottom: 4 }}>Admin</h1>
      <p style={{ color: 'var(--on-surface-variant)', marginBottom: 20, fontSize: 14 }}>Tüm kullanıcılar ve kaydettikleri içerik (salt-okunur).</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12, marginBottom: 24 }}>
        {statCards.map(([label, val]) => (
          <div key={label} style={{ ...surface, padding: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--on-surface, #fff)' }}>{val ?? '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['users', `Kullanıcılar (${users.length})`], ['feed', 'Son Kaydedilenler']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 14,
              background: tab === k ? 'var(--primary)' : 'transparent',
              color: tab === k ? 'var(--void, #0e0e0e)' : 'var(--on-surface-variant)',
              border: `1px solid ${tab === k ? 'var(--primary)' : 'var(--outline-dim, rgba(255,255,255,0.12))'}`, fontWeight: 600 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div style={{ ...surface, padding: 8 }}>
          {users.map(u => (
            <button key={u.id} onClick={() => openUser(u)}
              style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--outline-dim, rgba(255,255,255,0.06))', padding: '12px 8px', cursor: 'pointer' }}>
              {u.avatar_url
                ? <img src={u.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: 999, flexShrink: 0 }} />
                : <div style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--primary)', color: 'var(--void)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{(u.email || '?')[0].toUpperCase()}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--on-surface, #fff)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
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
        <div style={{ ...surface, padding: 8 }}>
          {feed.map(n => <NoteRow key={n.id} n={n} showOwner onOpen={openNote} />)}
          {feed.length === 0 && <div style={{ padding: 24, color: 'var(--on-surface-variant)' }}>Yükleniyor…</div>}
        </div>
      )}

      {/* User notes drawer */}
      {selUser && (
        <div onClick={() => setSelUser(null)} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={drawer}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selUser.email}</div>
                <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{selUser.note_count} not</div>
              </div>
              <button onClick={() => setSelUser(null)} style={closeBtn}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
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
          <div onClick={e => e.stopPropagation()} style={{ ...drawer, maxWidth: 720 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                {selNote === 'loading'
                  ? <div style={{ fontWeight: 700 }}>Yükleniyor…</div>
                  : <>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{selNote.title || '(untitled)'}</div>
                      <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                        {selNote.owner_email} · {fmtDateTime(selNote.created_at)} {selNote.status && <>· </>}{selNote.status && <StatusPill status={selNote.status} />}
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

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 };
const drawer = { ...surface, width: '100%', maxWidth: 560, maxHeight: '85vh', padding: 16, display: 'flex', flexDirection: 'column' };
const closeBtn = { background: 'transparent', border: 'none', color: 'var(--on-surface-variant)', fontSize: 18, cursor: 'pointer', flexShrink: 0 };
