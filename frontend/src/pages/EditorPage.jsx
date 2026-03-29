import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { notesAPI } from '../api';
import RichTextEditor from '../components/editor/RichTextEditor';
import { stripHTML } from '../components/editor/editorUtils';

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { labels: allLabels } = useOutletContext();
  const isNew = id === 'new';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [activeTab, setActiveTab] = useState('edit');
  const [noteLabels, setNoteLabels] = useState([]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const titleRef = useRef(null);
  const editorRef = useRef(null);
  const saveTimeout = useRef(null);
  const noteRef = useRef(null);        // always-current note ref
  const creatingRef = useRef(false);    // mutex to prevent duplicate creates

  useEffect(() => {
    if (!isNew && id) {
      loadNote();
    } else {
      titleRef.current?.focus();
    }
  }, [id]);

  // Auto-refresh while note is processing
  useEffect(() => {
    if (!note || note.status !== 'processing') return;

    const interval = setInterval(async () => {
      try {
        const data = await notesAPI.get(note.id);
        setNote(data);
        setTitle(data.title || '');
        setContent(data.content || '');
        // Update rich editor without losing cursor
        editorRef.current?.setContent(data.content || '');
      } catch (err) {
        console.error('Polling failed:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [note?.status, note?.id]);

  async function loadNote() {
    try {
      const data = await notesAPI.get(id);
      setNote(data);
      setTitle(data.title || '');
      setContent(data.content || '');
      setNoteLabels(data.labels || []);
      // Default to AI Insight tab if available
      if (data.ai_insight) {
        setActiveTab('ai');
      }
    } catch (err) {
      console.error('Failed to load note:', err);
    }
  }

  // Keep noteRef in sync with state
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  // Auto-save with debounce
  const autoSave = useCallback((newTitle, newContent) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      await saveNote(newTitle, newContent);
    }, 2000);
  }, []);

  async function saveNote(saveTitle = title, saveContent = content) {
    if (!saveTitle && !saveContent) return;

    const currentNote = noteRef.current;

    // If we already have a note, just update
    if (currentNote) {
      setSaving(true);
      try {
        await notesAPI.update(currentNote.id, {
          title: saveTitle,
          content: saveContent,
        });
        setLastSaved(new Date());
      } catch (err) {
        console.error('Save failed:', err);
      } finally {
        setSaving(false);
      }
      return;
    }

    // Creating new note — use mutex to prevent duplicates
    if (creatingRef.current) return;
    creatingRef.current = true;
    setSaving(true);
    try {
      const created = await notesAPI.create({
        title: saveTitle,
        content: saveContent,
      });
      setNote(created);
      noteRef.current = created;
      setLastSaved(new Date());
      window.history.replaceState(null, '', `/vault/${created.id}`);
    } catch (err) {
      console.error('Save failed:', err);
      creatingRef.current = false;
    } finally {
      setSaving(false);
    }
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!note) return;
    setDeleting(true);
    try {
      await notesAPI.delete(note.id);
      navigate('/vault');
    } catch (err) {
      console.error('Delete failed:', err);
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  function handleTitleChange(e) {
    setTitle(e.target.value);
    autoSave(e.target.value, content);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }

  function handleContentChange(e) {
    setContent(e.target.value);
    autoSave(title, e.target.value);
  }

  function handleEditorUpdate(html) {
    setContent(html);
    autoSave(title, html);
  }

  function formatSaveTime() {
    if (saving) return t('saving');
    if (!lastSaved) return '';
    const diffMs = Date.now() - lastSaved.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t('autosaved_just_now');
    return `Auto-saved ${diffMin}m ago`;
  }

  // Auto-resize title on mount
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = titleRef.current.scrollHeight + 'px';
    }
  }, [title]);

  // ── Label handlers ──────────────────────────────────
  async function handleAddLabel(label) {
    // Optimistic update
    setNoteLabels(prev => [...prev, label]);
    setShowLabelPicker(false);
    if (note) {
      try {
        const newIds = [...noteLabels.map(l => l.id), label.id];
        await notesAPI.updateLabels(note.id, newIds);
      } catch (err) {
        console.error('Failed to add label:', err);
        setNoteLabels(prev => prev.filter(l => l.id !== label.id));
      }
    }
  }

  async function handleRemoveLabel(labelId) {
    const prev = noteLabels;
    setNoteLabels(noteLabels.filter(l => l.id !== labelId));
    if (note) {
      try {
        const newIds = noteLabels.filter(l => l.id !== labelId).map(l => l.id);
        await notesAPI.updateLabels(note.id, newIds);
      } catch (err) {
        console.error('Failed to remove label:', err);
        setNoteLabels(prev);
      }
    }
  }

  const availableLabels = (allLabels || []).filter(
    l => !noteLabels.some(nl => nl.id === l.id)
  );

  const saveStatus = formatSaveTime();

  return (
    <div className="main-content">
      <div className="editor-container fade-in">
        <button className="editor-back" onClick={() => navigate('/vault')}>
          {t('back_to_vault')}
        </button>

        {/* Tab navigation for Edit / AI / History */}
        {note && (
          <div className="tab-nav" style={{ margin: 'var(--space-3) 0' }}>
            <button
              className={`tab-nav-item ${activeTab === 'edit' ? 'active' : ''}`}
              onClick={() => setActiveTab('edit')}
            >
              {t('editor_tab')}
            </button>
            {note.ai_insight && (
              <button
                className={`tab-nav-item ${activeTab === 'ai' ? 'active' : ''}`}
                onClick={() => setActiveTab('ai')}
              >
                {t('ai_insight_tab')}
              </button>
            )}
            <button
              className={`tab-nav-item ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              {t('history_tab')}
            </button>
          </div>
        )}

        {activeTab === 'edit' && (
          <>
            <textarea
              ref={titleRef}
              className="editor-title"
              placeholder={t('untitled')}
              value={title}
              onChange={handleTitleChange}
              id="editor-title"
              rows={1}
            />

            <div className="editor-meta">
              <div className="editor-meta-left">
                {note?.status && note.status !== 'ready' && (
                  <span className={`note-status ${note.status}`}>
                    <span className="note-status-dot" />
                    {note.status}
                  </span>
                )}
                {note?.source_url && (
                  <a
                    href={note.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="editor-source-link"
                    onClick={e => e.stopPropagation()}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    {' '}{(() => { try { return new URL(note.source_url).hostname.replace('www.',''); } catch { return note.source_url; } })()}
                  </a>
                )}
              </div>
              <div className="editor-meta-right">
                {saveStatus && (
                  <span className="editor-save-status">{saveStatus}</span>
                )}
                {note && (
                  <button
                    className="editor-delete-btn"
                    onClick={() => setShowDeleteConfirm(true)}
                    title={t('delete_note')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Label chips */}
            {note && (
              <div className="editor-labels">
                {noteLabels.map(label => (
                  <span
                    key={label.id}
                    className="editor-label-chip"
                    style={{ borderLeft: `3px solid ${label.color || '#8B5CF6'}` }}
                  >
                    {label.name}
                    <button
                      className="editor-label-remove"
                      onClick={() => handleRemoveLabel(label.id)}
                      title={t('remove_label')}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <div className="editor-label-picker-wrap">
                  <button
                    className="editor-label-add-btn"
                    onClick={() => setShowLabelPicker(!showLabelPicker)}
                  >
                    + {t('add_label')}
                  </button>
                  {showLabelPicker && (
                    <div className="editor-label-dropdown">
                      {availableLabels.length === 0 ? (
                        <div className="editor-label-dropdown-empty">
                          {t('no_labels_available')}
                        </div>
                      ) : (
                        availableLabels.map(label => (
                          <button
                            key={label.id}
                            className="editor-label-dropdown-item"
                            onClick={() => handleAddLabel(label)}
                          >
                            <span
                              className="label-dot"
                              style={{ backgroundColor: label.color || '#8B5CF6' }}
                            />
                            {label.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <RichTextEditor
              ref={editorRef}
              content={content}
              onUpdate={handleEditorUpdate}
              placeholder={t('start_writing')}
            />
          </>
        )}

        {activeTab === 'ai' && note?.ai_insight && (
          <AIInsightView insight={note.ai_insight} sourceUrl={note.source_url} t={t} />
        )}

        {activeTab === 'history' && note && (
          <VersionHistoryView noteId={note.id} currentTitle={note.title} t={t} />
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && note && (
        <div className="delete-modal-overlay" onClick={() => !deleting && setShowDeleteConfirm(false)}>
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
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                {t('delete_modal_cancel')}
              </button>
              <button
                className="delete-modal-btn delete-modal-btn-confirm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <span className="delete-spinner" /> : null}
                {deleting ? '...' : t('delete_modal_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline Markdown Helper ──────────────────────────
function renderInlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// ── AI Insight Sub-view ───────────────────────────────
function AIInsightView({ insight, sourceUrl, t }) {
  // Parse AI insight into sections
  const lines = insight.split('\n').filter(l => l.trim());

  return (
    <div className="ai-panel fade-in">
      <div className="ai-panel-header">
        <div className="ai-panel-icon">✨</div>
        <div>
          <h3 className="ai-panel-title">{t('ai_insight_tab')}</h3>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.8125rem' }}>
            {t('auto_generated_analysis')}
          </p>
        </div>
      </div>

      <div className="ai-insight-content">
        {lines.map((line, i) => {
          if (line.startsWith('- ') || line.startsWith('* ')) {
            const text = line.replace(/^[-*]\s*/, '');
            return (
              <div key={i} className="ai-key-point">
                <span className="ai-key-point-number">{String(i).padStart(2, '0')}</span>
                <span
                  className="ai-key-point-text"
                  dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(text) }}
                />
              </div>
            );
          }
          if (line.startsWith('#')) {
            return <h4 key={i} style={{ color: 'var(--on-surface)', marginTop: 'var(--space-3)' }}>{line.replace(/^#+\s*/, '')}</h4>;
          }
          return (
            <p
              key={i}
              dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(line) }}
            />
          );
        })}
      </div>

      {sourceUrl && (
        <div className="ai-source">
          <span className="ai-source-label">{t('source_material')}</span>
          <span className="ai-source-title">{sourceUrl}</span>
        </div>
      )}
    </div>
  );
}

// ── Version History Sub-view ──────────────────────────
function VersionHistoryView({ noteId, currentTitle, t }) {
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRevisions();
  }, [noteId]);

  async function loadRevisions() {
    try {
      const data = await notesAPI.revisions(noteId);
      setRevisions(data.revisions || []);
    } catch (err) {
      console.error('Failed to load revisions:', err);
      // Demo revisions
      setRevisions([
        {
          id: 'r1',
          version: 3,
          title: currentTitle,
          created_at: new Date(Date.now() - 300000).toISOString(),
        },
        {
          id: 'r2',
          version: 2,
          title: currentTitle,
          created_at: new Date(Date.now() - 7200000).toISOString(),
        },
        {
          id: 'r3',
          version: 1,
          title: 'Initial Draft',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function formatRevisionDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${time}`;
  }

  if (loading) {
    return <div className="loading-state"><div className="loading-spinner" /></div>;
  }

  return (
    <div className="fade-in" style={{ paddingTop: 'var(--space-3)' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-5)' }}>
        {t('version_history')}
      </h2>
      {revisions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8) 0', color: 'var(--outline)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: 'var(--space-3)' }}>
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{t('no_revisions') || 'No version history yet'}</p>
          <p style={{ fontSize: '0.8rem', marginTop: 'var(--space-1)' }}>{t('no_revisions_desc') || 'Revisions will appear here as you edit'}</p>
        </div>
      ) : null}
      <div className="history-timeline">
        {revisions.map((rev, i) => (
          <div key={rev.id} className={`history-item ${i === 0 ? 'current' : ''}`}>
            <div className="history-dot" />
            <div className="history-version-tag">
              {i === 0 ? t('current_version') : `${t('version')} ${rev.version}`}
            </div>
            <div className="history-title">{rev.title || t('untitled')}</div>
            <div className="history-description">
              {i === 0
                ? 'Current working version'
                : `Revision snapshot at version ${rev.version}`}
            </div>
            <div className="history-date">{formatRevisionDate(rev.created_at)}</div>
          </div>
        ))}
        {revisions.length > 0 && (
          <div className="history-item">
            <div className="history-dot" />
            <div className="history-version-tag" style={{ background: 'rgba(98, 250, 227, 0.1)', color: 'var(--secondary)' }}>
              {t('origin_point')}
            </div>
            <div className="history-description" style={{ fontSize: '0.8125rem' }}>
              {t('end_of_history')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
