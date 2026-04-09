import { useState } from 'react';
import { useVault } from '../contexts/VaultContext';

const ICONS = ['🗂️', '💼', '🏠', '📚', '🎓', '🎨', '🔬', '💡', '🚀', '❤️', '🌱', '⚡', '🎯', '🧠'];
const COLORS = ['#b79fff', '#62fae3', '#9093ff', '#ff6e84', '#FFEAA7', '#FF6B6B', '#4ECDC4', '#96CEB4'];

export default function VaultManager({ onClose }) {
  const { vaults, createVault, updateVault, deleteVault, currentVault } = useVault();
  const [creating, setCreating] = useState(false);
  const [newVault, setNewVault] = useState({ name: '', icon: '🗂️', color: '#b79fff' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  async function handleCreate() {
    if (!newVault.name.trim()) return;
    setBusy(true);
    try {
      await createVault(newVault);
      setCreating(false);
      setNewVault({ name: '', icon: '🗂️', color: '#b79fff' });
    } finally { setBusy(false); }
  }

  async function handleUpdate() {
    if (!editForm.name?.trim()) return;
    setBusy(true);
    try {
      await updateVault(editingId, editForm);
      setEditingId(null);
    } finally { setBusy(false); }
  }

  async function handleDelete(vault) {
    setBusy(true);
    try {
      await deleteVault(vault.id);
      setDeleteConfirm(null);
    } finally { setBusy(false); }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000,
      padding: 24,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        width: '100%', maxWidth: 560,
        maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--on-surface)' }}>Manage Vaults</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--outline)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
        </div>

        {/* Vault list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {vaults.map(v => (
            <div key={v.id} style={{
              padding: 'var(--space-3)',
              background: 'var(--surface-container)',
              border: `1px solid ${v.id === currentVault?.id ? 'var(--primary)' : 'var(--outline-variant)'}`,
              borderRadius: 'var(--radius-md)',
            }}>
              {editingId === v.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <input
                    value={editForm.name || ''}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    style={{ background: 'var(--surface-container-high)', border: '1px solid var(--outline-variant)', color: 'var(--on-surface)', padding: '6px 10px', borderRadius: 6, fontSize: '0.875rem' }}
                  />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ICONS.map(icon => (
                      <button key={icon} onClick={() => setEditForm({ ...editForm, icon })} style={{
                        width: 32, height: 32,
                        background: editForm.icon === icon ? 'var(--primary)' : 'var(--surface-container-high)',
                        border: '1px solid var(--outline-variant)', borderRadius: 6, cursor: 'pointer', fontSize: '1rem',
                      }}>{icon}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleUpdate} disabled={busy} className="btn-primary" style={{ flex: 1, fontSize: '0.8125rem' }}>Save</button>
                    <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ flex: 1, fontSize: '0.8125rem' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '1.5rem' }}>{v.icon || '🗂️'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--on-surface)', fontWeight: 600, fontSize: '0.9375rem' }}>{v.name}</div>
                    {v.is_default && <div style={{ fontSize: '0.65rem', color: 'var(--primary)' }}>DEFAULT</div>}
                  </div>
                  <button onClick={() => { setEditingId(v.id); setEditForm({ name: v.name, icon: v.icon, color: v.color }); }}
                    style={{ background: 'none', border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem' }}>Edit</button>
                  {!v.is_default && (
                    <button onClick={() => setDeleteConfirm(v)}
                      style={{ background: 'none', border: '1px solid var(--error)', color: 'var(--error)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem' }}>Delete</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Create new vault */}
        {creating ? (
          <div style={{ padding: 'var(--space-3)', background: 'var(--surface-container)', borderRadius: 'var(--radius-md)', border: '1px solid var(--primary)' }}>
            <input
              autoFocus
              placeholder="Vault name (e.g. Work)"
              value={newVault.name}
              onChange={e => setNewVault({ ...newVault, name: e.target.value })}
              style={{ width: '100%', background: 'var(--surface-container-high)', border: '1px solid var(--outline-variant)', color: 'var(--on-surface)', padding: '8px 12px', borderRadius: 6, fontSize: '0.875rem', marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {ICONS.map(icon => (
                <button key={icon} onClick={() => setNewVault({ ...newVault, icon })} style={{
                  width: 32, height: 32,
                  background: newVault.icon === icon ? 'var(--primary)' : 'var(--surface-container-high)',
                  border: '1px solid var(--outline-variant)', borderRadius: 6, cursor: 'pointer', fontSize: '1rem',
                }}>{icon}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreate} disabled={busy || !newVault.name.trim()} className="btn-primary" style={{ flex: 1 }}>Create Vault</button>
              <button onClick={() => setCreating(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} className="btn-primary" style={{ width: '100%' }}>
            + Create New Vault
          </button>
        )}

        {/* Delete confirmation */}
        {deleteConfirm && (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2100, padding: 24,
          }}>
            <div style={{ background: 'var(--surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', maxWidth: 400, border: '1px solid var(--error)' }}>
              <h3 style={{ color: 'var(--error)', margin: '0 0 var(--space-3)' }}>Delete Vault "{deleteConfirm.name}"?</h3>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem', marginBottom: 'var(--space-4)' }}>
                This will permanently delete ALL notes, labels, entities, synthesis pages, and activity in this vault. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleDelete(deleteConfirm)} disabled={busy}
                  style={{ flex: 1, background: 'var(--error)', color: '#fff', border: 'none', padding: '10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                  Delete Forever
                </button>
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
