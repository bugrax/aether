import { useState } from 'react';
import { labelsAPI } from '../api';
import { useLanguage } from '../contexts/LanguageContext';

export default function LabelManager({ labels, onLabelsChanged }) {
  const { t } = useLanguage();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#8B5CF6');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const presetColors = [
    '#8B5CF6', '#62fae3', '#ff6e84', '#9093ff', 
    '#f59e0b', '#10b981', '#ec4899', '#6366f1',
  ];

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await labelsAPI.create({ name: newName.trim(), color: newColor });
      setNewName('');
      onLabelsChanged();
    } catch (err) {
      console.error('Failed to create label:', err);
    }
  }

  async function handleUpdate(id) {
    try {
      await labelsAPI.update(id, { name: editName, color: editColor });
      setEditingId(null);
      onLabelsChanged();
    } catch (err) {
      console.error('Failed to update label:', err);
    }
  }

  async function handleDelete(id) {
    try {
      await labelsAPI.delete(id);
      onLabelsChanged();
    } catch (err) {
      console.error('Failed to delete label:', err);
    }
  }

  function startEditing(label) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color || '#8B5CF6');
  }

  return (
    <div className="label-manager fade-in">
      <div className="label-manager-header">
        <span style={{ 
          fontFamily: 'var(--font-label)', 
          fontSize: '0.75rem', 
          fontWeight: 600, 
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--on-surface)',
        }}>
          {t('manage_labels')}
        </span>
        <button type="button" className="btn-ghost" style={{ opacity: 0, pointerEvents: 'none' }}>✕</button>
      </div>

      {/* Create new label */}
      <form onSubmit={handleCreate} className="label-create-form">
        <input
          type="text"
          placeholder={t('new_label')}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          className="label-input"
          id="label-create-input"
        />
        <div className="color-picker">
          {presetColors.map(color => (
            <button
              key={color}
              type="button"
              className={`color-dot ${newColor === color ? 'selected' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => setNewColor(color)}
            />
          ))}
        </div>
        <button type="submit" className="btn-primary" style={{ 
          padding: '6px 12px', 
          fontSize: '0.75rem',
          width: '100%',
        }}>
          {t('create')}
        </button>
      </form>

      {/* Label list */}
      <div className="label-list">
        {labels.map(label => (
          <div key={label.id} className="label-list-item">
            {editingId === label.id ? (
              <div className="label-edit-form">
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="label-input"
                  autoFocus
                />
                <div className="color-picker">
                  {presetColors.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`color-dot ${editColor === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setEditColor(color)}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn-secondary" onClick={() => handleUpdate(label.id)}
                    style={{ flex: 1, padding: '4px 8px', fontSize: '0.7rem' }}>
                    {t('save')}
                  </button>
                  <button className="btn-ghost" onClick={() => setEditingId(null)}
                    style={{ fontSize: '0.7rem' }}>
                    {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <span className="label-dot" style={{ backgroundColor: label.color || '#8B5CF6' }} />
                  <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                    {label.name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button className="btn-ghost" onClick={() => startEditing(label)}
                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                    ✏️
                  </button>
                  <button className="btn-ghost" onClick={() => handleDelete(label.id)}
                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                    🗑️
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
