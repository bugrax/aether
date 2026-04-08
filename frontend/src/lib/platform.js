import { Capacitor } from '@capacitor/core';

// Detect Tauri desktop by checking for the __TAURI_INTERNALS__ global
const isTauriDesktop = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
const isCapacitorNative = !isTauriDesktop && Capacitor.isNativePlatform();
const isWeb = !isTauriDesktop && !isCapacitorNative;

export const platform = {
  // Platform type
  isNative: isCapacitorNative,
  isDesktop: isTauriDesktop,
  isWeb,
  isMobile: isCapacitorNative,
  isIOS: isCapacitorNative && Capacitor.getPlatform() === 'ios',
  isAndroid: isCapacitorNative && Capacitor.getPlatform() === 'android',

  // Feature flags
  usesNativeAuth: isCapacitorNative,
  usesPopupAuth: !isCapacitorNative,
  usesNativeShare: isCapacitorNative,
  usesNativeNotifications: isCapacitorNative,
  usesDesktopNotifications: isTauriDesktop,
  hasNativeMenu: isTauriDesktop,

  // Platform name string
  type: isCapacitorNative ? Capacitor.getPlatform() : isTauriDesktop ? 'desktop' : 'web',
};
