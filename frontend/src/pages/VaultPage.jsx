import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { notesAPI } from '../api';
import { stripHTML } from '../components/editor/editorUtils';

// ── Date Helpers ─────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getDateGroup(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'This Week';
  if (diffDays <= 30) return 'This Month';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// ── Sub-components ───────────────────────────────────

function StatusBadge({ status }) {
  if (status === 'ready') return null;
  const colors = {
    processing: '#c5a5ff',
    draft: '#ffb86c',
    error: '#ff6e84',
  };
  return (
    <span className="note-status-badge" style={{ color: colors[status] || '#62fae3' }}>
      {status || 'draft'}
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
      className="note-card fade-in"
      onClick={onClick}
      id={`note-${note.id}`}
    >
      {domain && (
        <div className="note-card-source">
          <span className="source-icon"><SourceLinkIcon /></span>
          <span className="source-domain">{domain}</span>
        </div>
      )}
      <div className="note-card-title">{note.title || t('untitled')}</div>
      <p className="note-card-preview">
        {note.content ? stripHTML(note.content).substring(0, 150) + '...' : t('no_content_yet')}
      </p>
      <div className="note-card-meta">
        <span className="note-card-date">{formatDate(note.updated_at)}</span>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
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
          <StatusBadge status={note.status} />
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
              {label.name}
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
  { value: 'newest', label: 'Newest First', icon: '↓' },
  { value: 'oldest', label: 'Oldest First', icon: '↑' },
  { value: 'title', label: 'Title A–Z', icon: '🔤' },
];

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'processing', label: 'Processing' },
  { value: 'draft', label: 'Draft' },
  { value: 'error', label: 'Error' },
];

// ── Main Component ───────────────────────────────────

export default function VaultPage() {
  const [notes, setNotes] = useState([]);
  const [allNotes, setAllNotes] = useState([]);
  const [loading, setLoading] = useState(true);
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

  // Keep a ref to allNotes for use in effects without stale closures
  const allNotesRef = useRef(allNotes);
  allNotesRef.current = allNotes;

  useEffect(() => {
    // Clear search state when navigating to a different label
    setSearch('');
    setIsSearchActive(false);
    setSearching(false);
    loadNotes();
  }, [searchParams]);

  // Auto-refresh while any note is still processing
  useEffect(() => {
    const hasProcessing = notes.some(n => n.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        const params = {};
        const labelId = searchParams.get('label_id');
        if (labelId) params.label_id = labelId;
        const data = await notesAPI.list(params);
        setNotes(data.notes || []);
        if (!isSearchActive) setAllNotes(data.notes || []);
      } catch (err) {
        console.error('Polling failed:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [notes, searchParams, isSearchActive]);

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
    const timer = setTimeout(() => {
      performSearch(search.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  async function loadNotes() {
    setLoading(true);
    try {
      const params = {};
      const labelId = searchParams.get('label_id');
      if (labelId) params.label_id = labelId;

      const data = await notesAPI.list(params);
      setNotes(data.notes || []);
      setAllNotes(data.notes || []);
    } catch (err) {
      console.error('Failed to load notes:', err);
      setNotes(getDemoNotes());
      setAllNotes(getDemoNotes());
    } finally {
      setLoading(false);
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
      setNotes(prev => prev.filter(n => n.id !== deleteTarget.id));
      setAllNotes(prev => prev.filter(n => n.id !== deleteTarget.id));
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
      if (sortBy === 'oldest') return new Date(a.updated_at) - new Date(b.updated_at);
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

  // Group by date
  const grouped = processedNotes.reduce((acc, note) => {
    const group = getDateGroup(note.updated_at);
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
    <div className="vault-page">
      {/* Search */}
      <form onSubmit={handleSearch} className="search-bar">
        <span className="search-icon">
          {searching ? (
            <span className="search-spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}
        </span>
        <input
          type="text"
          placeholder={t('search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="search-clear" onClick={clearSearch} title="Clear">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </form>

      {/* Search result info */}
      {isSearchActive && !searching && (
        <div className="search-result-info">
          <span>{processedNotes.length} {processedNotes.length === 1 ? 'result' : 'results'} for "{search}"</span>
          <button className="search-result-clear" onClick={clearSearch}>
            Clear search
          </button>
        </div>
      )}

      {/* Toolbar — only show when 3+ notes */}
      {processedNotes.length >= 3 && <div className="vault-toolbar">
        <div className="vault-controls">
          <select
            className="vault-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
            ))}
          </select>

          <select
            className="vault-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTERS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <div className="vault-view-toggle">
            <button
              className={`vault-view-btn ${viewMode === 'grouped' ? 'active' : ''}`}
              onClick={() => setViewMode('grouped')}
              title="Grouped view"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
            <button
              className={`vault-view-btn ${viewMode === 'flat' ? 'active' : ''}`}
              onClick={() => setViewMode('flat')}
              title="Flat view"
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
                    onClick={() => navigate(`/vault/${note.id}`)}
                    onRequestDelete={requestDelete}
                    t={t}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="notes-grid">
          {processedNotes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              onClick={() => navigate(`/vault/${note.id}`)}
              onRequestDelete={requestDelete}
              t={t}
            />
          ))}
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
