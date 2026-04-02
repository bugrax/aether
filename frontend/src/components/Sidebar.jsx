import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { notesAPI } from '../api';
import AetherChat from './AetherChat';

// ── SVG Icon Components ─────────────────────────────
function VaultIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function LabelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function Sidebar({ labels = [], onLabelsChanged }) {
  const { user, logout, isDevMode } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeLabelId = searchParams.get('label_id');
  const [labelCounts, setLabelCounts] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatExpandedRef = useRef(false);
  const chatInputRef = useRef(null);
  const chatPanelRef = useRef(null);
  const drag = useRef({ active: false, startY: 0, translateY: 0, velocity: 0, lastY: 0, lastTime: 0 });
  const scrollYRef = useRef(0);

  // Lock body scroll
  useEffect(() => {
    if (chatOpen) {
      scrollYRef.current = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollYRef.current}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, scrollYRef.current);
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, [chatOpen]);

  const handleChatOpen = () => {
    setChatOpen(true);
    setChatExpanded(false);
    chatExpandedRef.current = false;
  };

  const handleChatClose = () => {
    // Slide down with transform, then unmount
    const panel = chatPanelRef.current;
    if (panel) {
      panel.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 1, 1)';
      panel.style.transform = 'translateY(100%)';
      setTimeout(() => {
        setChatOpen(false);
        setChatExpanded(false);
      }, 300);
    } else {
      setChatOpen(false);
      setChatExpanded(false);
    }
  };

  const handleInputFocus = () => {
    setChatExpanded(true);
    const panel = chatPanelRef.current;
    if (panel) {
      panel.style.transition = '';
      panel.style.transform = '';
    }
  };

  const handleZoneRef = useRef(null);

  // Attach native touch listeners for drag-to-dismiss
  useEffect(() => {
    const panel = chatPanelRef.current;
    if (!panel) return;

    const onStart = (e) => {
      // Only from top 50px of panel
      const rect = panel.getBoundingClientRect();
      const touchY = e.touches[0].clientY;
      if (touchY - rect.top > 50) return;
      drag.current = { active: true, startY: touchY, delta: 0, velocity: 0, lastY: touchY, lastTime: Date.now() };
      panel.style.transition = 'none';
    };

    const onMove = (e) => {
      if (!drag.current.active) return;
      e.preventDefault();
      const touchY = e.touches[0].clientY;
      const now = Date.now();
      const dt = now - drag.current.lastTime;
      if (dt > 0) drag.current.velocity = (touchY - drag.current.lastY) / dt;
      drag.current.lastY = touchY;
      drag.current.lastTime = now;
      const delta = touchY - drag.current.startY;
      drag.current.delta = delta;
      // Only translate down
      if (delta > 0) {
        panel.style.transform = `translateY(${delta}px)`;
      }
    };

    const onEnd = () => {
      if (!drag.current.active) return;
      drag.current.active = false;
      const delta = drag.current.delta;
      const v = drag.current.velocity;

      if (delta > 10 && (v > 0.4 || delta > 120)) {
        handleChatClose();
      } else {
        panel.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        panel.style.transform = '';
      }
    };

    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd, { passive: true });

    return () => {
      panel.removeEventListener('touchstart', onStart);
      panel.removeEventListener('touchmove', onMove);
      panel.removeEventListener('touchend', onEnd);
    };
  });

  // Handle zone click/tap → toggle expand
  const onHandleTap = () => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    if (chatExpandedRef.current) {
      panel.style.height = '55vh';
      panel.style.transition = 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
      chatExpandedRef.current = false;
      setChatExpanded(false);
    } else {
      panel.style.height = '92vh';
      panel.style.transition = 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
      chatExpandedRef.current = true;
      setChatExpanded(true);
    }
  };

  // Fetch note counts per label (only when user is authenticated)
  useEffect(() => {
    if (!user) return;
    async function fetchCounts() {
      try {
        const data = await notesAPI.list();
        const notes = data.notes || [];
        setTotalCount(notes.length);

        const counts = {};
        for (const note of notes) {
          for (const label of (note.labels || [])) {
            counts[label.id] = (counts[label.id] || 0) + 1;
          }
        }
        setLabelCounts(counts);
      } catch {
        // ignore
      }
    }
    fetchCounts();
  }, [user, labels]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const avatarUrl = user?.photoURL || user?.photoUrl;

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────── */}
      <aside className="sidebar sidebar-desktop">
        <div className="sidebar-logo">
          Aether
          {isDevMode && (
            <span style={{
              fontSize: '0.5rem',
              color: 'var(--secondary)',
              display: 'block',
              fontWeight: 400,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              Dev Mode
            </span>
          )}
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/vault"
            className={({ isActive }) => `sidebar-link ${isActive && !activeLabelId ? 'active' : ''}`}
            end
          >
            <span className="icon"><VaultIcon /></span>
            {t('vault')}
          </NavLink>

          <NavLink
            to="/vault/new"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon"><PenIcon /></span>
            {t('new_note')}
          </NavLink>

          <NavLink
            to="/share"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon"><LinkIcon /></span>
            {t('share')}
          </NavLink>
        </nav>

        <div className="sidebar-labels">
          <div className="sidebar-labels-title">{t('labels')}</div>

          <button
            className={`sidebar-link sidebar-label-btn ${!activeLabelId ? 'active' : ''}`}
            onClick={() => navigate('/vault')}
          >
            <span className="label-dot" style={{ backgroundColor: '#888' }} />
            {t('all_notes')}
            <span className="label-count">{totalCount}</span>
          </button>

          {labels.map(label => (
            <button
              key={label.id}
              className={`sidebar-link sidebar-label-btn ${activeLabelId === label.id ? 'active' : ''}`}
              onClick={() => navigate(`/vault?label_id=${label.id}`)}
            >
              <span
                className="label-dot"
                style={{ backgroundColor: label.color || '#8B5CF6' }}
              />
              {label.name}
              <span className="label-count">{labelCounts[label.id] || 0}</span>
            </button>
          ))}
          <NavLink
            to="/settings"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            style={{ fontSize: '0.75rem', color: 'var(--outline)', marginTop: 'var(--space-2)' }}
          >
            <span className="icon"><GearIcon /></span>
            {t('settings')}
          </NavLink>
        </div>

        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">
                {user.displayName || user.email}
              </span>
              <span className="sidebar-user-email">{user.email}</span>
            </div>
            <button className="btn-ghost" onClick={handleLogout} title={t('sign_out')}>
              <LogoutIcon />
            </button>
          </div>
        )}
      </aside>

      {/* ── Mobile Top Header ───────────────────────── */}
      <header className="mobile-top-header">
        <div className="mobile-header-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="mobile-avatar-img" referrerPolicy="no-referrer" />
          ) : (
            <div className="mobile-avatar-placeholder">
              {(user?.displayName || user?.email || '?')[0].toUpperCase()}
            </div>
          )}
        </div>
        <div className="mobile-header-date-pill">
          {t('today')}
        </div>
        <button className="mobile-header-bell">
          <BellIcon />
        </button>
      </header>

      {/* ── Mobile Bottom Tab Bar ───────────────────── */}
      <nav className="mobile-tab-bar">
        <div className="mobile-tab-bar-inner">
          <NavLink
            to="/vault"
            className={({ isActive }) => `mobile-tab ${isActive && !activeLabelId ? 'active' : ''}`}
            end
          >
            <span className="mobile-tab-icon"><VaultIcon /></span>
            <span className="mobile-tab-label">{t('vault')}</span>
          </NavLink>

          <NavLink
            to="/share"
            className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}
          >
            <span className="mobile-tab-icon"><LinkIcon /></span>
            <span className="mobile-tab-label">{t('links')}</span>
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}
          >
            <span className="mobile-tab-icon"><GearIcon /></span>
            <span className="mobile-tab-label">{t('settings')}</span>
          </NavLink>

          <button
            className={`mobile-tab ${mobileMenuOpen ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="mobile-tab-icon"><LabelIcon /></span>
            <span className="mobile-tab-label">{t('labels')}</span>
          </button>
        </div>

        {/* Floating A button */}
        <button className="mobile-fab" onClick={handleChatOpen}>
          <span className="mobile-fab-letter">A</span>
        </button>
      </nav>

      {/* ── Aether AI Chat Panel ─────────────────── */}
      {chatOpen && (
        <div className="aether-chat-overlay" onClick={handleChatClose}>
          <div
            ref={chatPanelRef}
            className={`aether-chat-panel ${chatExpanded ? 'chat-expanded' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="aether-chat-handle-zone"
              ref={handleZoneRef}
              onClick={onHandleTap}
            >
              <div className="aether-chat-handle-bar" />
            </div>

            <AetherChat
              user={user}
              onClose={handleChatClose}
              panelRef={chatPanelRef}
              expanded={chatExpanded}
              setExpanded={setChatExpanded}
            />
          </div>
        </div>
      )}

      {/* ── Mobile Slide-up Menu (Labels + User) ──── */}
      {mobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={closeMobileMenu}>
          <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-handle" />

            <div className="mobile-menu-section">
              <div className="mobile-menu-title">{t('labels')}</div>
              <button
                className={`mobile-menu-item ${!activeLabelId ? 'active' : ''}`}
                onClick={() => { navigate('/vault'); closeMobileMenu(); }}
              >
                <span className="label-dot" style={{ backgroundColor: '#888' }} />
                {t('all_notes')}
                <span className="label-count">{totalCount}</span>
              </button>
              {labels.map(label => (
                <button
                  key={label.id}
                  className={`mobile-menu-item ${activeLabelId === label.id ? 'active' : ''}`}
                  onClick={() => { navigate(`/vault?label_id=${label.id}`); closeMobileMenu(); }}
                >
                  <span className="label-dot" style={{ backgroundColor: label.color || '#8B5CF6' }} />
                  {label.name}
                  <span className="label-count">{labelCounts[label.id] || 0}</span>
                </button>
              ))}
            </div>

            {user && (
              <div className="mobile-menu-user">
                <div className="mobile-menu-user-info">
                  <span className="mobile-menu-user-name">
                    {user.displayName || user.email}
                  </span>
                  <span className="mobile-menu-user-email">{user.email}</span>
                </div>
                <button className="mobile-menu-logout" onClick={handleLogout}>
                  <LogoutIcon /> {t('sign_out')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
