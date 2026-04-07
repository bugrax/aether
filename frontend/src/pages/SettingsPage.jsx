import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { usersAPI } from '../api';
import { Capacitor } from '@capacitor/core';
import LabelManager from '../components/LabelManager';
import { trackDeleteAccount, trackScreenView } from '../analytics';

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
  const { logout } = useAuth();
  const { labels, reloadLabels } = useOutletContext();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { trackScreenView('Settings'); }, []);
  const effectiveAiLang = aiLang || lang;
  const [notifEnabled, setNotifEnabled] = useState(false);
  const isNativePlatform = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNativePlatform) return;
    import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
      LocalNotifications.checkPermissions().then(p => {
        setNotifEnabled(p.display === 'granted');
      });
    }).catch(() => {});
  }, []);

  const toggleNotifications = async () => {
    if (!isNativePlatform) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      if (notifEnabled) {
        // Can't revoke — direct to system settings
        if (Capacitor.getPlatform() === 'ios') {
          window.open('app-settings:', '_system');
        }
      } else {
        const perm = await LocalNotifications.requestPermissions();
        setNotifEnabled(perm.display === 'granted');
        if (perm.display !== 'granted' && Capacitor.getPlatform() === 'ios') {
          window.open('app-settings:', '_system');
        }
      }
    } catch {}
  };

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await usersAPI.deleteAccount();
      trackDeleteAccount();
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Account deletion failed:', err);
      alert(t('delete_account_failed'));
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

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

        {/* Notifications */}
        {isNativePlatform && (
          <section style={{
            background: 'var(--surface)',
            padding: 'var(--space-5)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--outline-variant)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-1)' }}>
                  {lang === 'tr' ? 'Bildirimler' : 'Notifications'}
                </h2>
                <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.8125rem', margin: 0 }}>
                  {lang === 'tr' ? 'Islem tamamlandiginda bildir' : 'Notify when processing completes'}
                </p>
              </div>
              <button
                onClick={toggleNotifications}
                style={{
                  width: 50, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: notifEnabled ? 'var(--primary)' : 'var(--surface-container-highest)',
                  position: 'relative', transition: 'background 0.2s',
                }}>
                <span style={{
                  position: 'absolute', top: 3, left: notifEnabled ? 25 : 3,
                  width: 22, height: 22, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
          </section>
        )}

        {/* AI Rules */}
        <section style={{
          background: 'var(--surface)',
          padding: 'var(--space-5)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--outline-variant)'
        }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>
            {lang === 'tr' ? 'AI Kuralları' : 'AI Rules'}
          </h2>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.8125rem', marginBottom: 'var(--space-3)' }}>
            {lang === 'tr' ? 'AI\'ın içeriklerinizi nasıl işleyeceğini ve analiz edeceğini özelleştirin.' : 'Customize how AI processes and analyzes your content.'}
          </p>
          <textarea
            defaultValue=""
            placeholder={lang === 'tr' ? 'Örn: Sağlık içeriklerini Wellness altında kategorize et. Türkçe kaynaklara öncelik ver.' : 'E.g.: Always categorize health content under Wellness. Prioritize actionable takeaways.'}
            onBlur={(e) => usersAPI.updateSettings({ ai_rules: e.target.value })}
            style={{
              width: '100%', minHeight: 100, padding: 'var(--space-3)',
              background: 'var(--surface-container)', border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)', color: 'var(--on-surface)',
              fontSize: '0.8125rem', fontFamily: 'var(--font-body)',
              resize: 'vertical', outline: 'none',
            }}
          />
        </section>

        {/* Manage Labels */}
        <section className="settings-section">
          <LabelManager labels={labels} onLabelsChanged={reloadLabels} />
        </section>

        {/* Delete Account */}
        <section style={{
          background: 'var(--surface)',
          padding: 'var(--space-5)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--error-container)',
        }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)', color: 'var(--error)' }}>{t('delete_account')}</h2>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem', marginBottom: 'var(--space-4)' }}>
            {t('delete_account_desc')}
          </p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                background: 'transparent',
                color: 'var(--error)',
                border: '1px solid var(--error)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-2) var(--space-5)',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              {t('delete_account')}
            </button>
          ) : (
            <div style={{
              background: 'rgba(255, 110, 132, 0.08)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
            }}>
              <p style={{ color: 'var(--error)', fontSize: '0.9375rem', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                {t('delete_account_confirm_title')}
              </p>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.8125rem', marginBottom: 'var(--space-4)' }}>
                {t('delete_account_confirm_body')}
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  style={{
                    background: 'var(--error)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-2) var(--space-5)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    opacity: deleting ? 0.6 : 1,
                  }}
                >
                  {deleting ? '...' : t('delete_account_confirm_btn')}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="btn-secondary"
                  style={{ fontSize: '0.875rem' }}
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
