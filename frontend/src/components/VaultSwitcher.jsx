import { useState, useRef, useEffect } from 'react';
import { useVault } from '../contexts/VaultContext';
import VaultManager from './VaultManager';

export default function VaultSwitcher() {
  const { vaults, currentVault, setCurrentVault } = useVault();
  const [open, setOpen] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!currentVault) return null;

  return (
    <div ref={ref} style={{ position: 'relative', marginTop: 'var(--space-3)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%',
          padding: '8px 12px',
          background: 'var(--surface-container)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--on-surface)',
          fontSize: '0.8125rem',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '1rem' }}>{currentVault.icon || '🗂️'}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentVault.name}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0, right: 0,
          background: 'var(--surface-container-high)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 1000,
          overflow: 'hidden',
          maxHeight: 400,
          overflowY: 'auto',
        }}>
          {vaults.map(v => (
            <button
              key={v.id}
              onClick={() => { setCurrentVault(v); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%',
                padding: '10px 12px',
                background: v.id === currentVault.id ? 'var(--surface-container-highest)' : 'transparent',
                border: 'none',
                color: 'var(--on-surface)',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                textAlign: 'left',
                borderBottom: '1px solid var(--outline-variant)',
              }}
            >
              <span style={{ fontSize: '1rem' }}>{v.icon || '🗂️'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.name}
              </span>
              {v.is_default && (
                <span style={{ fontSize: '0.65rem', color: 'var(--primary)', background: 'rgba(183,159,255,0.15)', padding: '2px 6px', borderRadius: 4 }}>
                  default
                </span>
              )}
              {v.id === currentVault.id && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
          <button
            onClick={() => { setOpen(false); setShowManager(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%',
              padding: '10px 12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--primary)',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              textAlign: 'left',
              fontWeight: 600,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Manage Vaults
          </button>
        </div>
      )}

      {showManager && <VaultManager onClose={() => setShowManager(false)} />}
    </div>
  );
}
