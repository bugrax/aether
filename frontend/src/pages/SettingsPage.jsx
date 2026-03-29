import { useLanguage } from '../contexts/LanguageContext';
import { useOutletContext } from 'react-router-dom';
import LabelManager from '../components/LabelManager';

export default function SettingsPage() {
  const { lang, setLang, t } = useLanguage();
  const { labels, reloadLabels } = useOutletContext(); // provided by App.jsx ProtectedRoute

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">{t('settings')}</h1>
      </div>

      <div className="fade-in" style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        
        {/* Language Selection */}
        <section className="settings-section" style={{
          background: 'var(--surface)',
          padding: 'var(--space-5)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--outline-variant)'
        }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>{t('language')}</h2>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem', marginBottom: 'var(--space-4)' }}>
            {t('select_language')}
          </p>
          
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button 
              className={`btn-secondary ${lang === 'en' ? 'active' : ''}`}
              onClick={() => setLang('en')}
              style={{ flex: 1, borderColor: lang === 'en' ? 'var(--primary)' : undefined, background: lang === 'en' ? 'var(--primary-container)' : undefined }}
            >
              English
            </button>
            <button 
              className={`btn-secondary ${lang === 'tr' ? 'active' : ''}`}
              onClick={() => setLang('tr')}
              style={{ flex: 1, borderColor: lang === 'tr' ? 'var(--primary)' : undefined, background: lang === 'tr' ? 'var(--primary-container)' : undefined }}
            >
              Türkçe
            </button>
          </div>
        </section>

        {/* Manage Labels */}
        <section className="settings-section">
          <LabelManager labels={labels} onLabelsChanged={reloadLabels} />
        </section>

      </div>
    </div>
  );
}
