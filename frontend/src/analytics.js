import { Capacitor } from '@capacitor/core';

let analytics = null;
let isNative = false;
let nativePlugin = null;

export async function initAnalytics() {
  isNative = Capacitor.isNativePlatform();

  if (isNative) {
    // Native: use Capacitor Firebase Analytics plugin
    try {
      const { FirebaseAnalytics } = await import('@capacitor-firebase/analytics');
      nativePlugin = FirebaseAnalytics;
      await nativePlugin.setEnabled({ enabled: true });
      await nativePlugin.logEvent({ name: 'app_open', params: {} });
      console.log('[Analytics] Native OK');
    } catch (err) {
      console.warn('[Analytics] Native failed:', err.message || err);
    }
  } else {
    // Web: use Firebase JS SDK
    try {
      const { app } = await import('./firebase.js');
      if (!app) return;
      const { getAnalytics, logEvent } = await import('firebase/analytics');
      analytics = getAnalytics(app);
      logEvent(analytics, 'app_open');
      console.log('[Analytics] Web OK');
    } catch (err) {
      console.warn('[Analytics] Web failed:', err.message || err);
    }
  }
}

function getPlatform() {
  if (!isNative) return 'web';
  return /iphone|ipad/i.test(navigator.userAgent) ? 'ios' : 'android';
}

export function trackEvent(eventName, params = {}) {
  try {
    const fullParams = { ...params, platform: getPlatform() };
    if (isNative && nativePlugin) {
      nativePlugin.logEvent({ name: eventName, params: fullParams });
    } else if (analytics) {
      import('firebase/analytics').then(({ logEvent }) => {
        logEvent(analytics, eventName, fullParams);
      });
    }
  } catch {}
}

export function trackScreenView(screenName) {
  if (isNative && nativePlugin) {
    nativePlugin.setCurrentScreen({ screenName });
  } else {
    trackEvent('screen_view', { firebase_screen: screenName });
  }
}

// ── Predefined Event Helpers ──────────────────────────

export function trackLinkCapture(url, source = 'web') {
  let domain = '';
  try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
  trackEvent('link_capture', { url, domain, source });
}

export function trackNoteOpen(noteId, source = 'vault') {
  trackEvent('note_open', { note_id: noteId, source });
}

export function trackChatMessage(sessionId) {
  trackEvent('chat_message', { session_id: sessionId });
}

export function trackChatChipClick(chipName) {
  trackEvent('chat_chip_click', { chip_name: chipName });
}

export function trackLabelFilter(labelName) {
  trackEvent('label_filter', { label_name: labelName });
}

export function trackViewModeChange(mode) {
  trackEvent('view_mode_change', { mode });
}

export function trackShareExtensionUse(platform) {
  trackEvent('share_extension_use', { platform });
}

export function trackSignIn(provider) {
  trackEvent('login', { method: provider });
}

export function trackSignOut() {
  trackEvent('sign_out');
}

export function trackDeleteAccount() {
  trackEvent('delete_account');
}

export function trackNotificationClick(noteId) {
  trackEvent('notification_click', { note_id: noteId });
}

export function trackPullToRefresh() {
  trackEvent('pull_to_refresh');
}

export function trackAetherChatOpen() {
  trackEvent('aether_chat_open');
}

export function trackAetherChatHistory() {
  trackEvent('aether_chat_history');
}
