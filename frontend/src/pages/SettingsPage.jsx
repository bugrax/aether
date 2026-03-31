import { useLanguage } from '../contexts/LanguageContext';
import { useOutletContext } from 'react-router-dom';
import LabelManager from '../components/LabelManager';

function LangButton({ active, onClick, children }) {
  return (
    <button
      className={`btn-secondary ${active ? 'active' : ''}`}
      onClick={onClick}
      style={{
        flex: 1,
        borderColor: active ? 'var(--primary)' : undefined,
        background: active ? 'var(--primary-container)' : undefined,
        color: active ? '#fff' : undefined,
        fontWeight: active ? 600 : undefined,
      }}
    >
      {children}
    </button>
  );
}

export default function SettingsPage() {
  const { lang, setLang, aiLang, setAiLang, t } = useLanguage();
  const { labels, reloadLabels } = useOutletContext();

  const effectiveAiLang = aiLang || lang;

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">{t('settings')}</h1>
      </div>

      <div className="fade-in" style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

        {/* App Language */}
        <section style={{
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
            <LangButton active={lang === 'en'} onClick={() => setLang('en')}>English</LangButton>
            <LangButton active={lang === 'tr'} onClick={() => setLang('tr')}>Türkçe</LangButton>
          </div>
        </section>

        {/* AI Insight Language */}
        <section style={{
          background: 'var(--surface)',
          padding: 'var(--space-5)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--outline-variant)'
        }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>{t('ai_language')}</h2>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem', marginBottom: 'var(--space-4)' }}>
            {t('ai_language_desc')}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <LangButton active={!aiLang} onClick={() => setAiLang('')}>
              {t('ai_lang_auto')}
            </LangButton>
            <LangButton active={effectiveAiLang === 'en' && !!aiLang} onClick={() => setAiLang('en')}>
              English
            </LangButton>
            <LangButton active={effectiveAiLang === 'tr' && !!aiLang} onClick={() => setAiLang('tr')}>
              Türkçe
            </LangButton>
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
