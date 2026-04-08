import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { notesAPI } from '../api';
import { stripHTML } from '../components/editor/editorUtils';
import { trackViewModeChange, trackPullToRefresh, trackNoteOpen, trackScreenView } from '../analytics';

function translateLabel(name, t) {
  const key = 'label_' + name.toLowerCase();
  const translated = t(key);
  return translated !== key ? translated : name;
}

// ── Date Helpers ─────────────────────────────────────

function formatDate(dateStr, t) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  if (diffMin < 1) return t('just_now');
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;

  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getDateGroup(dateStr, t) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return t('today');
  if (diffDays === 1) return t('yesterday');
  if (diffDays <= 7) return t('this_week');
  if (diffDays <= 30) return t('this_month');
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// ── Sub-components ───────────────────────────────────

function StatusBadge({ status, t }) {
  if (status === 'ready') return null;
  const colors = {
    processing: '#c5a5ff',
    draft: '#ffb86c',
    error: '#ff6e84',
  };
  const labels = {
    processing: t('filter_processing'),
    draft: t('filter_draft'),
    error: t('filter_error'),
  };
  return (
    <span className="note-status-badge" style={{ color: colors[status] || '#62fae3' }}>
      {labels[status] || status || t('filter_draft')}
    </span>
  );
}

function getSourceDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch { return null; }
}

function SourceLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function NoteCard({ note, onClick, onRequestDelete, t }) {
  const hasLabels = note.labels && note.labels.length > 0;
  const domain = !hasLabels ? getSourceDomain(note.source_url) : null;
  return (
    <article
      className={`note-card fade-in ${note.thumbnail_url ? 'has-thumbnail' : ''}`}
      onClick={onClick}
      id={`note-${note.id}`}
    >
      {note.thumbnail_url && (
        <div className="note-card-thumbnail">
          <img src={note.thumbnail_url} alt="" loading="lazy" />
        </div>
      )}
      {domain && (
        <div className="note-card-source">
          <span className="source-icon"><SourceLinkIcon /></span>
          <span className="source-domain">{domain}</span>
        </div>
      )}
      <div className="note-card-title">{note.title || t('untitled')}</div>
      <p className="note-card-preview">
        {note.ai_insight ? stripHTML(note.ai_insight).replace(/[#*_\-|>]+/g, '').replace(/\s+/g, ' ').substring(0, 150) + '...'
          : note.content ? stripHTML(note.content).substring(0, 150) + '...'
          : t('no_content_yet')}
      </p>
      <div className="note-card-meta">
        <span className="note-card-date">{formatDate(note.created_at, t)}</span>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          {note.source_url && (
            <button
              className="note-delete-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (navigator.share) {
                  navigator.share({ title: note.title, url: note.source_url });
                } else {
                  navigator.clipboard.writeText(note.source_url);
                }
              }}
              title={t('share')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          )}
          <button
            className="note-delete-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRequestDelete(note);
            }}
            title={t('delete_note')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <StatusBadge status={note.status} t={t} />
        </div>
      </div>
      {note.labels && note.labels.length > 0 && (
        <div className="note-card-labels">
          {note.labels.map(label => (
            <span
              key={label.id}
              className="note-label-chip"
              style={{ borderLeft: `3px solid ${label.color || '#8B5CF6'}` }}
            >
              {translateLabel(label.name, t)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

// ── Delete Confirmation Modal ────────────────────────

function DeleteConfirmModal({ note, isOpen, isDeleting, onConfirm, onCancel, t }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onCancel]);

  if (!isOpen || !note) return null;

  return (
    <div className="delete-modal-overlay" onClick={onCancel}>
      <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="delete-modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </div>
        <h3 className="delete-modal-title">{t('delete_modal_title')}</h3>

        <div className="delete-modal-note-preview">
          <span className="delete-modal-note-title">{note.title || t('untitled')}</span>
        </div>

        <p className="delete-modal-body">{t('delete_modal_body')}</p>

        <div className="delete-modal-actions">
          <button
            className="delete-modal-btn delete-modal-btn-cancel"
            onClick={onCancel}
            disabled={isDeleting}
          >
            {t('delete_modal_cancel')}
          </button>
          <button
            className="delete-modal-btn delete-modal-btn-confirm"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <span className="delete-spinner" />
            ) : null}
            {isDeleting ? '...' : t('delete_modal_confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sort & Filter Config ─────────────────────────────

const SORT_OPTIONS = [
  { value: 'newest', key: 'sort_newest', icon: '↓' },
  { value: 'oldest', key: 'sort_oldest', icon: '↑' },
  { value: 'title', key: 'sort_title', icon: '🔤' },
];

const STATUS_FILTERS = [
  { value: '', key: 'filter_all' },
  { value: 'ready', key: 'filter_ready' },
  { value: 'processing', key: 'filter_processing' },
  { value: 'draft', key: 'filter_draft' },
  { value: 'error', key: 'filter_error' },
];

// ── Main Component ───────────────────────────────────

export default function VaultPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState('grouped');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const observerRef = useRef(null);
  const sentinelRef = useRef(null);
  const offsetRef = useRef(0);
  const allNotesRef = useRef([]);

  const PAGE_SIZE = 20;
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullRef = useRef({ startY: 0, pulling: false });
  const vaultRef = useRef(null);

  useEffect(() => {
    trackScreenView('Vault');
    setSearch('');
    setIsSearchActive(false);
    setSearching(false);
    loadNotes(true);
  }, [searchParams]);

  // Refresh when app comes back to foreground
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadNotes(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [searchParams]);

  // Auto-refresh while any note is processing
  useEffect(() => {
    const hasProcessing = notes.some(n => n.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(() => loadNotes(true), 5000);
    return () => clearInterval(interval);
  }, [notes, searchParams]);

  // Debounced semantic search
  useEffect(() => {
    if (!search.trim()) {
      if (isSearchActive) {
        setIsSearchActive(false);
        setNotes(allNotesRef.current);
      }
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => performSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Refs for scroll handler to avoid stale closures
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);
  const isSearchActiveRef = useRef(isSearchActive);
  const loadMoreRef = useRef(loadMoreNotes);
  hasMoreRef.current = hasMore;
  loadingMoreRef.current = loadingMore;
  isSearchActiveRef.current = isSearchActive;
  loadMoreRef.current = loadMoreNotes;

  // Infinite scroll — attach after loading completes
  useEffect(() => {
    if (loading) return;
    const el = vaultRef.current;
    if (!el) return;

    const onScroll = () => {
      if (!hasMoreRef.current || loadingMoreRef.current || isSearchActiveRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 400) {
        loadMoreRef.current();
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loading]);

  // Pull-to-refresh
  useEffect(() => {
    const el = vaultRef.current;
    if (!el) return;
    const parent = el.closest('.main-content') || el;

    const onStart = (e) => {
      if (parent.scrollTop <= 0 && !refreshing) {
        pullRef.current = { startY: e.touches[0].clientY, pulling: true };
      }
    };
    const onMove = (e) => {
      if (!pullRef.current.pulling || refreshing) return;
      const dy = e.touches[0].clientY - pullRef.current.startY;
      if (dy > 0 && parent.scrollTop <= 0) {
        e.preventDefault();
        const distance = Math.min(dy * 0.5, 80);
        setPullDistance(distance);
      }
    };
    const onEnd = () => {
      if (!pullRef.current.pulling || refreshing) return;
      pullRef.current.pulling = false;
      if (pullDistance >= 60) {
        setRefreshing(true);
        setPullDistance(60);
        trackPullToRefresh();
        loadNotes(true).finally(() => {
          setRefreshing(false);
          setPullDistance(0);
        });
      } else {
        setPullDistance(0);
      }
    };

    parent.addEventListener('touchstart', onStart, { passive: true });
    parent.addEventListener('touchmove', onMove, { passive: false });
    parent.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      parent.removeEventListener('touchstart', onStart);
      parent.removeEventListener('touchmove', onMove);
      parent.removeEventListener('touchend', onEnd);
    };
  });

  async function loadNotes(reset = false) {
    if (reset) {
      setLoading(true);
      offsetRef.current = 0;
    }
    try {
      const params = { limit: PAGE_SIZE, offset: 0 };
      const labelId = searchParams.get('label_id');
      if (labelId) params.label_id = labelId;
      const data = await notesAPI.list(params);
      const newNotes = data.notes || [];
      setNotes(newNotes);
      allNotesRef.current = newNotes;
      setHasMore(data.has_more || false);
      offsetRef.current = newNotes.length;
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreNotes() {
    setLoadingMore(true);
    try {
      const params = { limit: PAGE_SIZE, offset: offsetRef.current };
      const labelId = searchParams.get('label_id');
      if (labelId) params.label_id = labelId;
      const data = await notesAPI.list(params);
      const moreNotes = data.notes || [];
      setNotes(prev => {
        const ids = new Set(prev.map(n => n.id));
        const unique = moreNotes.filter(n => !ids.has(n.id));
        const combined = [...prev, ...unique];
        allNotesRef.current = combined;
        return combined;
      });
      setHasMore(data.has_more || false);
      offsetRef.current += moreNotes.length;
    } catch (err) {
      console.error('Failed to load more notes:', err);
    } finally {
      setLoadingMore(false);
    }
  }

  function requestDelete(note) {
    setDeleteTarget(note);
  }

  const cancelDelete = useCallback(() => {
    if (!isDeleting) {
      setDeleteTarget(null);
    }
  }, [isDeleting]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await notesAPI.delete(deleteTarget.id);
      setNotes(prev => {
        const updated = prev.filter(n => n.id !== deleteTarget.id);
        allNotesRef.current = updated;
        return updated;
      });
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete failed:', err);
      alert(t('delete_failed'));
    } finally {
      setIsDeleting(false);
    }
  }

  async function performSearch(query) {
    setSearching(true);
    try {
      const data = await notesAPI.search(query);
      setNotes(data.results || []);
      setIsSearchActive(true);
    } catch (err) {
      console.error('Search failed, falling back to text:', err);
      try {
        const data = await notesAPI.list({ q: query });
        setNotes(data.notes || []);
        setIsSearchActive(true);
      } catch { setNotes([]); }
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearch('');
    setIsSearchActive(false);
    setNotes(allNotes);
  }

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) {
      performSearch(search.trim());
    } else {
      clearSearch();
    }
  }

  // ── Sort & Filter ──────────────────────────────────
  const processedNotes = notes
    .filter(n => !statusFilter || n.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      return new Date(b.created_at) - new Date(a.created_at);
    });

  // Group by date
  const grouped = processedNotes.reduce((acc, note) => {
    const group = getDateGroup(note.created_at, t);
    if (!acc[group]) acc[group] = [];
    acc[group].push(note);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="vault-page">
        <div className="vault-empty-state">
          <div className="loading-spinner" />
          <p style={{ color: 'var(--outline)', marginTop: 'var(--space-3)' }}>
            {t('loading') || 'Loading your vault...'}
          </p>
        </div>
      </div>
    );
  }

  if (!loading && processedNotes.length === 0 && !search) {
    return (
      <div className="vault-page">
        <div className="vault-empty-state">
          <span style={{ fontSize: '3rem' }}>📦</span>
          <h3 style={{ color: 'var(--on-surface)', margin: 'var(--space-3) 0 var(--space-1)' }}>
            {t('vault_empty_title') || 'Your vault is empty'}
          </h3>
          <p style={{ color: 'var(--outline)', fontSize: '0.875rem', maxWidth: '300px', textAlign: 'center' }}>
            {t('vault_empty_desc') || 'Start by sharing a link or creating a new note.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="vault-page" ref={vaultRef}>
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div className="pull-refresh-indicator" style={{
          height: pullDistance,
          transition: pullRef.current.pulling ? 'none' : 'height 0.3s ease',
        }}>
          <div className={`pull-refresh-circle ${pullDistance >= 60 || refreshing ? 'ready' : ''} ${refreshing ? 'spinning' : ''}`}
               style={{ transform: `rotate(${pullDistance * 4}deg)` }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </div>
        </div>
      )}

      {/* Toolbar — show when 3+ notes OR when a filter is active */}
      {(notes.length >= 3 || statusFilter) && <div className="vault-toolbar">
        <div className="vault-controls">
          <select
            className="vault-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.icon} {t(opt.key)}</option>
            ))}
          </select>

          <select
            className="vault-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTERS.map(opt => (
              <option key={opt.value} value={opt.value}>{t(opt.key)}</option>
            ))}
          </select>

          <div className="vault-view-toggle">
            <button
              className={`vault-view-btn ${viewMode === 'grouped' ? 'active' : ''}`}
              onClick={() => { setViewMode('grouped'); trackViewModeChange('grouped'); }}
              title={t('grouped_view')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
            <button
              className={`vault-view-btn ${viewMode === 'flat' ? 'active' : ''}`}
              onClick={() => { setViewMode('flat'); trackViewModeChange('flat'); }}
              title={t('flat_view')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>}

      {processedNotes.length === 0 ? (
        <div className="vault-empty">
          {isSearchActive ? (
            <>
              <div className="vault-empty-glyph">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.5}}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="8" x2="14" y2="14" /><line x1="14" y1="8" x2="8" y2="14" />
                </svg>
              </div>
              <h2>{t('no_results') || 'No results found'}</h2>
              <p>{t('try_different_search') || 'Try a different search term'}</p>
              <button className="vault-empty-btn" onClick={clearSearch}>
                {t('clear_search') || 'Clear search'}
              </button>
            </>
          ) : statusFilter ? (
            <>
              <div className="vault-empty-glyph">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.5}}>
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
              </div>
              <h2>{t('no_results')}</h2>
              <button className="vault-empty-btn" onClick={() => setStatusFilter('')}>
                {t('filter_all')}
              </button>
            </>
          ) : (
            <>
              <div className="vault-empty-glyph">◇</div>
              <h2>{t('empty_void')}</h2>
              <p>{t('create_first_note')}</p>
              <button
                className="vault-empty-btn"
                onClick={() => navigate('/vault/new')}
              >
                {t('create_first_note_btn')}
              </button>
            </>
          )}
        </div>
      ) : viewMode === 'grouped' ? (
        <div className="vault-grouped">
          {Object.entries(grouped).map(([date, groupNotes]) => (
            <section key={date} className="vault-date-group">
              <div className="vault-date-header">
                <div className="vault-date-line" />
                <span className="vault-date-label">{date}</span>
                <span className="vault-date-count">{groupNotes.length}</span>
                <div className="vault-date-line" />
              </div>
              <div className="notes-grid">
                {groupNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onClick={() => { trackNoteOpen(note.id, 'vault'); navigate(`/vault/${note.id}`); }}
                    onRequestDelete={requestDelete}
                    t={t}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="notes-list-compact">
          {processedNotes.map(note => (
            <article
              key={note.id}
              className="note-list-item fade-in"
              onClick={() => { trackNoteOpen(note.id, 'vault'); navigate(`/vault/${note.id}`); }}
            >
              {note.thumbnail_url ? (
                <div className="note-list-thumb">
                  <img src={note.thumbnail_url} alt="" loading="lazy" />
                </div>
              ) : (
                <div className="note-list-thumb note-list-thumb-empty">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
              )}
              <div className="note-list-info">
                <span className="note-list-title">{note.title || t('untitled')}</span>
                <span className="note-list-meta">{formatDate(note.created_at, t)}</span>
                {note.labels && note.labels.length > 0 && (
                  <div className="note-list-labels">
                    {note.labels.map(label => (
                      <span key={label.id} className="note-list-label" style={{ borderColor: label.color || '#8B5CF6', color: label.color || '#8B5CF6' }}>
                        {translateLabel(label.name, t)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <StatusBadge status={note.status} t={t} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.3}}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </article>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}>
          <div className="loading-spinner" />
        </div>
      )}

      <button
        className="fab"
        onClick={() => navigate('/vault/new')}
        title="New Note"
        id="fab-new-note"
      >
        ＋
      </button>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        note={deleteTarget}
        isOpen={!!deleteTarget}
        isDeleting={isDeleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        t={t}
      />
    </div>
  );
}

function getDemoNotes() {
  return [
    {
      id: 'demo-1',
      title: 'Quantum State Persistent Storage Protocols',
      content: 'Deep dive into non-volatile memory architectures for local-first encrypted vaults...',
      status: 'ready',
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      labels: [{ id: '1', name: 'Research', color: '#8B5CF6' }],
    },
    {
      id: 'demo-2',
      title: 'The Aesthetic of Silence',
      content: 'Reflections on minimal UI design and the psychology of dark surfaces...',
      status: 'draft',
      updated_at: new Date(Date.now() - 86400000).toISOString(),
      labels: [{ id: '2', name: 'Design', color: '#62fae3' }],
    },
    {
      id: 'demo-3',
      title: 'Smart Contract Audit: Project V',
      content: 'Found 3 potential reentrancy vulnerabilities in the core liquidity pool contract...',
      status: 'ready',
      updated_at: new Date(Date.now() - 172800000).toISOString(),
      labels: [{ id: '3', name: 'Security', color: '#ff6e84' }],
    },
  ];
}
