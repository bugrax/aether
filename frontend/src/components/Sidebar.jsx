import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { notesAPI } from '../api';
import AetherChat from './AetherChat';
import { trackSignOut, trackAetherChatOpen, trackNotificationClick, trackLabelFilter } from '../analytics';
import { Capacitor } from '@capacitor/core';

function translateLabel(name, t) {
  const key = 'label_' + name.toLowerCase();
  const translated = t(key);
  return translated !== key ? translated : name;
}

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
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeLabelId = searchParams.get('label_id');
  const [labelCounts, setLabelCounts] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatExpandedRef = useRef(false);
  const [notifications, setNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('aether_notifications') || '[]');
    } catch { return []; }
  });

  // Persist notifications to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('aether_notifications', JSON.stringify(notifications.slice(0, 50)));
    } catch {}
  }, [notifications]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const prevNotesRef = useRef({});
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
    trackAetherChatOpen();
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

  // Request notification permission on mount
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
      LocalNotifications.requestPermissions();
    }).catch(() => {});
  }, []);

  // Send native local notification
  const sendNativeNotification = async (title, body) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display !== 'granted') return;
        await LocalNotifications.schedule({
          notifications: [{
            title,
            body,
            id: Math.floor(Math.random() * 100000),
            schedule: { at: new Date(Date.now() + 500) },
            sound: 'default',
          }],
        });
      } catch {}
    } else if (window.__TAURI_INTERNALS__) {
      try {
        const { sendDesktopNotification } = await import('../lib/desktop-notifications');
        await sendDesktopNotification(title, body);
      } catch {}
    }
  };

  // Poll for note status changes → generate notifications
  useEffect(() => {
    if (!user) return;
    const checkNotifications = async () => {
      try {
        const data = await notesAPI.list({ limit: 20, offset: 0 });
        const notes = data.notes || [];
        const prev = prevNotesRef.current;

        for (const note of notes) {
          const prevStatus = prev[note.id];
          if (prevStatus === 'processing' && note.status === 'ready') {
            setNotifications(n => {
              if (n.some(x => x.noteId === note.id)) return n;
              return [{
                id: Date.now() + Math.random(),
                noteId: note.id,
                title: note.title || 'Note',
                message: t('done'),
                time: new Date(),
                read: false,
              }, ...n].slice(0, 20);
            });
            sendNativeNotification('Aether', `${note.title || 'Note'} — ${t('done')}`);
          } else if (prevStatus === 'processing' && note.status === 'error') {
            setNotifications(n => {
              if (n.some(x => x.noteId === note.id)) return n;
              return [{
                id: Date.now() + Math.random(),
                noteId: note.id,
                title: note.title || 'Note',
                message: t('processing_failed'),
                time: new Date(),
                read: false,
                isError: true,
              }, ...n].slice(0, 20);
            });
            sendNativeNotification('Aether', `${note.title || 'Note'} — ${t('processing_failed')}`);
          }
          prev[note.id] = note.status;
        }
        prevNotesRef.current = prev;
      } catch {}
    };
    checkNotifications();
    const interval = setInterval(checkNotifications, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleNotificationClick = (notif) => {
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    setShowNotifications(false);
    trackNotificationClick(notif.noteId);
    navigate(`/vault/${notif.noteId}`);
  };

  // Fetch note counts per label (only when user is authenticated)
  useEffect(() => {
    if (!user) return;
    async function fetchCounts() {
      try {
        const data = await notesAPI.list({ limit: 20, offset: 0 });
        const notes = data.notes || [];
        setTotalCount(data.total || notes.length);

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
    trackSignOut();
    await logout();
    navigate('/');
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const avatarUrl = user?.photoURL || user?.photoUrl;

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────── */}
      <aside className="sidebar sidebar-desktop">
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
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
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="btn-ghost" onClick={() => navigate('/settings')} title={t('settings')} style={{ padding: 4, opacity: 0.5 }}>
              <GearIcon />
            </button>
            {user && (
              <button className="btn-ghost" onClick={handleLogout} title={t('sign_out')} style={{ padding: 4, opacity: 0.5 }}>
                <LogoutIcon />
              </button>
            )}
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/vault"
            className={({ isActive }) => `sidebar-link ${isActive && !activeLabelId ? 'active' : ''}`}
            end
          >
            <span className="icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </span>
            Home
          </NavLink>

          <NavLink
            to="/vault/list"
            className={({ isActive }) => `sidebar-link ${isActive && !activeLabelId ? 'active' : ''}`}
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

          <NavLink
            to="/vault/graph"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/>
                <line x1="8.5" y1="7.5" x2="15.5" y2="16.5"/><line x1="15.5" y1="7.5" x2="8.5" y2="16.5"/>
              </svg>
            </span>
            Knowledge Graph
          </NavLink>

          <NavLink
            to="/vault/synthesis"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </span>
            Synthesis
          </NavLink>

          <NavLink
            to="/activity"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </span>
            Activity
          </NavLink>

          <NavLink
            to="/entities"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="3"/><circle cx="19" cy="17" r="3"/><circle cx="5" cy="17" r="3"/>
                <line x1="12" y1="8" x2="19" y2="14"/><line x1="12" y1="8" x2="5" y2="14"/><line x1="5" y1="17" x2="19" y2="17"/>
              </svg>
            </span>
            Entities
          </NavLink>

          <NavLink
            to="/chat"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            Aether AI
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
              onClick={() => { trackLabelFilter(label.name); navigate(`/vault/list?label_id=${label.id}`); }}
            >
              <span
                className="label-dot"
                style={{ backgroundColor: label.color || '#8B5CF6' }}
              />
              {translateLabel(label.name, t)}
              <span className="label-count">{labelCounts[label.id] || 0}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Mobile Top Header ───────────────────────── */}
      <header className="mobile-top-header">
        <button className="mobile-header-avatar" onClick={() => navigate('/settings')}>
          <GearIcon />
        </button>
        <div className="mobile-header-logo">Aether</div>
        <div className="mobile-header-right">
          <button className="mobile-header-icon-btn" onClick={() => navigate('/share')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button className="mobile-header-icon-btn" onClick={() => { if (!mobileMenuOpen && onLabelsChanged) onLabelsChanged(); setMobileMenuOpen(!mobileMenuOpen); }}>
            <LabelIcon />
          </button>
          <button className="mobile-header-icon-btn" onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) markAllRead(); }} style={{ position: 'relative' }}>
            <BellIcon />
            {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>
        </div>
      </header>


      {/* ── Notification Panel (full page overlay) ── */}
      {showNotifications && (
        <div className="notif-page">
          <div className="notif-page-header">
            <button className="notif-back-btn" onClick={() => setShowNotifications(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="notif-page-title">{lang === 'tr' ? 'Bildirimler' : 'Notifications'}</span>
            {notifications.length > 0 && (
              <button className="notif-clear-btn" onClick={() => setNotifications([])}>
                {lang === 'tr' ? 'Temizle' : 'Clear'}
              </button>
            )}
            {notifications.length === 0 && <span style={{width: 50}} />}
          </div>
          <div className="notif-page-list">
            {notifications.length === 0 ? (
              <div className="notif-page-empty">
                <BellIcon />
                <p>{lang === 'tr' ? 'Henüz bildirim yok' : 'No notifications yet'}</p>
              </div>
            ) : notifications.map(n => (
              <button key={n.id} className={`notif-item ${n.read ? '' : 'unread'} ${n.isError ? 'error' : ''}`}
                onClick={() => handleNotificationClick(n)}>
                <span className="notif-icon">{n.isError ? '✕' : '✓'}</span>
                <div className="notif-content">
                  <span className="notif-item-title">{n.title}</span>
                  <span className="notif-item-msg">{n.message}</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.3}}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Mobile Bottom Tab Bar ───────────────────── */}
      <nav className="mobile-tab-bar">
        <div className="mobile-tab-bar-inner">
          <NavLink
            to="/vault"
            className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}
            end
          >
            <span className="mobile-tab-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </span>
            <span className="mobile-tab-label">{lang === 'tr' ? 'Ana Sayfa' : 'Home'}</span>
          </NavLink>

          <NavLink
            to="/vault/list"
            className={({ isActive }) => `mobile-tab ${isActive && !activeLabelId ? 'active' : ''}`}
          >
            <span className="mobile-tab-icon"><VaultIcon /></span>
            <span className="mobile-tab-label">{t('vault')}</span>
          </NavLink>

          <NavLink
            to="/vault/graph"
            className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}
          >
            <span className="mobile-tab-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/>
                <line x1="8.5" y1="7.5" x2="15.5" y2="16.5"/><line x1="15.5" y1="7.5" x2="8.5" y2="16.5"/>
              </svg>
            </span>
            <span className="mobile-tab-label">{lang === 'tr' ? 'Harita' : 'Graph'}</span>
          </NavLink>

          <NavLink
            to="/entities"
            className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}
          >
            <span className="mobile-tab-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="3"/><circle cx="19" cy="17" r="3"/><circle cx="5" cy="17" r="3"/>
                <line x1="12" y1="8" x2="19" y2="14"/><line x1="12" y1="8" x2="5" y2="14"/><line x1="5" y1="17" x2="19" y2="17"/>
              </svg>
            </span>
            <span className="mobile-tab-label">{lang === 'tr' ? 'Varliklar' : 'Entities'}</span>
          </NavLink>
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
                  onClick={() => { trackLabelFilter(label.name); navigate(`/vault/list?label_id=${label.id}`); closeMobileMenu(); }}
                >
                  <span className="label-dot" style={{ backgroundColor: label.color || '#8B5CF6' }} />
                  {translateLabel(label.name, t)}
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
