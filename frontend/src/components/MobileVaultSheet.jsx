import { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import VaultManager from './VaultManager';

export default function MobileVaultSheet({ open, onClose }) {
  const { vaults, currentVault, setCurrentVault } = useVault();
  const [showManager, setShowManager] = useState(false);

  if (!open && !showManager) return null;

  const handleSelect = (vault) => {
    setCurrentVault(vault);
    onClose();
  };

  return (
    <>
      {open && (
        <div className="mobile-vault-sheet-overlay" onClick={onClose}>
          <div className="mobile-vault-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-vault-sheet-handle" />
            <div className="mobile-vault-sheet-title">Switch Vault</div>
            <div className="mobile-vault-sheet-list">
              {vaults.length === 0 ? (
                <div className="mobile-vault-sheet-empty">
                  No vaults found. Tap "Manage Vaults" below to create one.
                </div>
              ) : (
                vaults.map(v => (
                  <button
                    key={v.id}
                    className={`mobile-vault-sheet-item ${v.id === currentVault?.id ? 'active' : ''}`}
                    onClick={() => handleSelect(v)}
                  >
                    <span className="mobile-vault-sheet-icon">{v.icon || '🗂️'}</span>
                    <div className="mobile-vault-sheet-info">
                      <span className="mobile-vault-sheet-name">{v.name}</span>
                      {v.is_default && <span className="mobile-vault-sheet-badge">default</span>}
                    </div>
                    {v.id === currentVault?.id && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
            <button
              className="mobile-vault-sheet-manage"
              onClick={() => { onClose(); setShowManager(true); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Manage Vaults
            </button>
          </div>
        </div>
      )}
      {showManager && <VaultManager onClose={() => setShowManager(false)} />}
    </>
  );
}
