import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Capacitor } from '@capacitor/core';

// Halftone orb from Stitch — CSS radial gradient dots with mask
function HalftoneOrb({ size = 160 }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{
        width: size, height: size,
        backgroundImage: 'radial-gradient(#b79fff 20%, transparent 20%), radial-gradient(#b79fff 20%, transparent 20%)',
        backgroundPosition: '0 0, 10px 10px',
        backgroundSize: '20px 20px',
        WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0) 70%)',
        maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0) 70%)',
        opacity: 0.9,
      }} />
      {/* Glow behind */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(183,159,255,0.2)', filter: 'blur(60px)',
        borderRadius: '50%', zIndex: -1,
      }} />
    </div>
  );
}

// Glass icon container from Stitch
function GlassIcon({ icon, sparkle }) {
  return (
    <div style={{ position: 'relative', marginBottom: 32 }}>
      {sparkle && (
        <>
          <span style={{ position: 'absolute', top: -8, right: -8, color: '#b79fff', opacity: 0.6, fontSize: 28 }}
            className="material-symbols-outlined">auto_awesome</span>
          <span style={{ position: 'absolute', bottom: -4, left: -16, color: '#62fae3', opacity: 0.4, fontSize: 22 }}
            className="material-symbols-outlined">auto_awesome</span>
        </>
      )}
      <div style={{
        width: 100, height: 100, borderRadius: '50%',
        background: 'rgba(26,25,25,0.8)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(73,72,71,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(183,159,255,0.15), rgba(98,250,227,0.05))' }} />
        <span className="material-symbols-outlined" style={{
          fontSize: 48, color: '#b79fff', position: 'relative', zIndex: 1,
          fontVariationSettings: "'FILL' 1",
        }}>{icon}</span>
      </div>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        boxShadow: '0 0 40px rgba(183,159,255,0.3)', pointerEvents: 'none',
      }} />
    </div>
  );
}

const SLIDES = [
  { id: 'welcome' },
  { id: 'language' },
  { id: 'ai', icon: 'psychology', sparkle: true,
    title_en: 'AI Analyzes Everything', title_tr: 'AI Her Şeyi Analiz Eder',
    body_en: 'Automatic transcription, image OCR, smart summaries, and community insights — all powered by AI.',
    body_tr: 'Otomatik transkripsiyon, görsel OCR, akıllı özetler ve topluluk analizleri — tümü AI destekli.' },
  { id: 'assistant', icon: 'forum', sparkle: false,
    title_en: 'Your Knowledge Assistant', title_tr: 'Bilgi Asistanın',
    body_en: 'Ask Aether anything about your saved content. Find connections, get summaries, explore your vault.',
    body_tr: 'Kayıtlı içeriklerin hakkında Aether\'a sor. Bağlantıları bul, özetler al.' },
  { id: 'privacy', icon: 'shield', sparkle: false,
    title_en: 'Your Data, Your Vault', title_tr: 'Senin Verin, Senin Kasan',
    body_en: 'Everything stays private. Your knowledge engine — always searchable, always yours.',
    body_tr: 'Her şey gizli kalır. Bilgi motorun — her zaman aranabilir, her zaman senin.' },
  { id: 'tutorial' },
  { id: 'notifications', icon: 'notifications_active', sparkle: false,
    title_en: 'Stay in the Loop', title_tr: 'Gelişmelerden Haberdar Ol',
    body_en: 'Get notified when your saved links are processed and ready to explore.',
    body_tr: 'Kaydettiğin linkler işlendiğinde bildirim al.' },
];

export default function OnboardingPage({ onComplete }) {
  const { lang, setLang, aiLang, setAiLang } = useLanguage();
  const [step, setStep] = useState(0);
  const total = SLIDES.length;
  const slide = SLIDES[step];
  const t = (en, tr) => lang === 'tr' ? tr : en;

  const next = () => { if (step < total - 1) setStep(step + 1); else finish(); };
  const finish = () => {
    localStorage.setItem('aether_onboarded', '1');
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
        LocalNotifications.requestPermissions();
      }).catch(() => {});
    }
    onComplete();
  };
  const skip = () => { localStorage.setItem('aether_onboarded', '1'); onComplete(); };

  return (
    <div className="onboarding">
      {/* Material Symbols font */}
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      {/* Background ambient */}
      <div style={{ position: 'fixed', top: 0, right: 0, width: 500, height: 500, background: 'rgba(183,159,255,0.04)', filter: 'blur(120px)', borderRadius: '50%', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, width: 400, height: 400, background: 'rgba(98,250,227,0.03)', filter: 'blur(100px)', borderRadius: '50%', pointerEvents: 'none', zIndex: 0 }} />

      <div className="onboarding-slide" key={slide.id} style={{ position: 'relative', zIndex: 1 }}>

        {/* Welcome */}
        {slide.id === 'welcome' && (
          <>
            <HalftoneOrb size={160} />
            <h1 className="onb-logo">AETHER</h1>
            <p className="onb-tagline">{t('Where links become knowledge', 'Linkler bilgiye dönüşür')}</p>
            <div style={{ height: 32 }} />
            <h2 className="onb-title">{t('Save Any Link,', 'Herhangi Bir Linki Kaydet,')}<br/>{t('Unlock Knowledge', 'Bilgiye Dönüştür')}</h2>
            <p className="onb-body">{t(
              'YouTube, Instagram, articles, tweets — drop any URL and AI extracts the key insights.',
              'YouTube, Instagram, makaleler, tweetler — herhangi bir URL bırak, AI temel bilgileri çıkarsın.'
            )}</p>
            {/* Glassmorphism link cards */}
            <div style={{ position: 'relative', width: '100%', height: 100, marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                position: 'absolute', width: 180, height: 56, background: 'rgba(19,19,19,0.8)',
                borderRadius: 12, transform: 'rotate(-6deg)', backdropFilter: 'blur(20px)',
                border: '1px solid rgba(73,72,71,0.15)', display: 'flex', alignItems: 'center', padding: '0 16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              }}>
                <span className="material-symbols-outlined" style={{ color: '#b79fff', marginRight: 12, fontSize: 20 }}>link</span>
                <div style={{ height: 6, width: 80, background: 'rgba(255,255,255,0.1)', borderRadius: 3 }} />
              </div>
              <div style={{
                position: 'absolute', width: 180, height: 56, background: 'rgba(32,31,31,0.6)',
                borderRadius: 12, transform: 'rotate(4deg) translateY(16px)', backdropFilter: 'blur(24px)',
                border: '1px solid rgba(73,72,71,0.2)', display: 'flex', alignItems: 'center', padding: '0 16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              }}>
                <span className="material-symbols-outlined" style={{ color: '#62fae3', marginRight: 12, fontSize: 20 }}>auto_awesome</span>
                <div style={{ height: 6, width: 56, background: 'rgba(255,255,255,0.15)', borderRadius: 3 }} />
              </div>
            </div>
          </>
        )}

        {/* Language */}
        {slide.id === 'language' && (
          <>
            <h2 className="onb-title">{t('Choose Your Language', 'Dilini Seç')}</h2>
            <div className="onb-section-label">{t('APP LANGUAGE', 'UYGULAMA DİLİ')}</div>
            <div className="onb-lang-row">
              <button className={`onb-lang-card ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>
                <span className="onb-flag">🇬🇧</span> English
              </button>
              <button className={`onb-lang-card ${lang === 'tr' ? 'active' : ''}`} onClick={() => setLang('tr')}>
                <span className="onb-flag">🇹🇷</span> Türkçe
              </button>
            </div>
            <div className="onb-section-label">{t('AI INSIGHT LANGUAGE', 'AI ÖZET DİLİ')}</div>
            <p className="onb-body" style={{ marginBottom: 12 }}>{t('AI summaries can be in a different language', 'AI özetleri farklı bir dilde olabilir')}</p>
            <div className="onb-lang-row three">
              <button className={`onb-lang-pill ${!aiLang ? 'active' : ''}`} onClick={() => setAiLang('')}>{t('Same as app', 'Aynı')}</button>
              <button className={`onb-lang-pill ${aiLang === 'en' ? 'active' : ''}`} onClick={() => setAiLang('en')}>English</button>
              <button className={`onb-lang-pill ${aiLang === 'tr' ? 'active' : ''}`} onClick={() => setAiLang('tr')}>Türkçe</button>
            </div>
          </>
        )}

        {/* Icon slides: AI, Assistant, Privacy */}
        {['ai', 'assistant', 'privacy'].includes(slide.id) && (
          <>
            <GlassIcon icon={slide.icon} sparkle={slide.sparkle} />
            <h2 className="onb-title">{t(slide.title_en, slide.title_tr)}</h2>
            <p className="onb-body">{t(slide.body_en, slide.body_tr)}</p>
          </>
        )}

        {/* Tutorial */}
        {slide.id === 'tutorial' && (
          <>
            <h2 className="onb-title">{t('Save From Anywhere', 'Her Yerden Kaydet')}</h2>
            <div className="onb-steps">
              <div className="onb-step">
                <span className="onb-step-num">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                </span>
                <div>
                  <strong>{t('Find something interesting', 'İlginç bir şey bul')}</strong>
                  <span className="onb-step-sub">YouTube, Instagram, X, Safari...</span>
                </div>
              </div>
              <div className="onb-step-line" />
              <div className="onb-step">
                <span className="onb-step-num">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>ios_share</span>
                </span>
                <div>
                  <strong>{t('Tap the Share button', 'Paylaş butonuna bas')}</strong>
                  <span className="onb-step-sub">{t('The system share sheet', 'Sistem paylaşım menüsü')}</span>
                </div>
              </div>
              <div className="onb-step-line" />
              <div className="onb-step">
                <span className="onb-step-num">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
                </span>
                <div>
                  <strong>{t('Choose Aether', 'Aether\'ı seç')}</strong>
                  <span className="onb-step-sub">{t('AI processes it automatically', 'AI otomatik işler')}</span>
                </div>
              </div>
            </div>
            <p className="onb-body" style={{ marginTop: 20 }}>
              {t('Works with YouTube, Instagram, X, articles, PDFs & more', 'YouTube, Instagram, X, makaleler, PDF ve daha fazlası')}
            </p>
          </>
        )}

        {/* Notifications */}
        {slide.id === 'notifications' && (
          <>
            <GlassIcon icon={slide.icon} sparkle={false} />
            <h2 className="onb-title">{t(slide.title_en, slide.title_tr)}</h2>
            <p className="onb-body">{t(slide.body_en, slide.body_tr)}</p>
          </>
        )}
      </div>

      {/* Bottom */}
      <div className="onb-bottom">
        <div className="onb-dots">
          {SLIDES.map((_, i) => (
            <span key={i} className={`onb-dot ${i === step ? 'active' : ''}`}
              style={i === step ? { boxShadow: '0 0 12px rgba(183,159,255,0.6)' } : {}} />
          ))}
        </div>

        {slide.id === 'notifications' ? (
          <>
            <button className="onb-btn-primary" onClick={finish}>
              {t('Enable Notifications', 'Bildirimleri Aç')}
            </button>
            <button className="onb-btn-ghost" onClick={skip}>
              {t('Maybe Later', 'Belki Sonra')}
            </button>
          </>
        ) : (
          <>
            <button className="onb-btn-primary" onClick={next}>
              {step === 0 ? t('Get Started', 'Başla') : t('Next', 'İleri')}
            </button>
            <button className="onb-btn-skip" onClick={skip}>
              {t('SKIP', 'ATLA')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
