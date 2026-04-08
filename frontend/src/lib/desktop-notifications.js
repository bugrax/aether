import { platform } from './platform';

let notificationModule = null;

async function getModule() {
  if (!platform.isDesktop) return null;
  if (!notificationModule) {
    notificationModule = await import('@tauri-apps/plugin-notification');
  }
  return notificationModule;
}

export async function requestDesktopNotificationPermission() {
  const mod = await getModule();
  if (!mod) return false;
  let granted = await mod.isPermissionGranted();
  if (!granted) {
    const permission = await mod.requestPermission();
    granted = permission === 'granted';
  }
  return granted;
}

export async function sendDesktopNotification(title, body) {
  const mod = await getModule();
  if (!mod) return;
  const granted = await mod.isPermissionGranted();
  if (granted) {
    mod.sendNotification({ title, body });
  }
}
