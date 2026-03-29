import { isAuthenticated, clearToken } from '../lib/auth.js';
import { STORAGE_KEYS, DEFAULTS } from '../lib/constants.js';

const apiUrlInput = document.getElementById('api-url');
const webappUrlInput = document.getElementById('webapp-url');
const notifSave = document.getElementById('notif-save');
const notifComplete = document.getElementById('notif-complete');
const authDot = document.querySelector('.auth-dot');
const authText = document.getElementById('auth-text');
const signOutBtn = document.getElementById('sign-out-btn');
const saveSettingsBtn = document.getElementById('save-btn');
const saveMsg = document.getElementById('save-msg');

async function init() {
  // Load saved settings
  const settings = await chrome.storage.sync.get([
    STORAGE_KEYS.API_BASE,
    STORAGE_KEYS.WEBAPP_URL,
    STORAGE_KEYS.PREFERENCES,
  ]);

  apiUrlInput.value = settings[STORAGE_KEYS.API_BASE] || '';
  webappUrlInput.value = settings[STORAGE_KEYS.WEBAPP_URL] || '';

  const prefs = settings[STORAGE_KEYS.PREFERENCES] || {};
  notifSave.checked = prefs.notifSave !== false;
  notifComplete.checked = prefs.notifComplete !== false;

  // Auth status
  const authed = await isAuthenticated();
  if (authed) {
    authDot.classList.add('connected');
    authText.textContent = 'Connected';
  } else {
    authDot.classList.add('disconnected');
    authText.textContent = 'Not connected — open Aether webapp to sign in';
  }
}

// Save settings
saveSettingsBtn.addEventListener('click', async () => {
  const apiUrl = apiUrlInput.value.trim() || DEFAULTS.API_BASE;
  const webappUrl = webappUrlInput.value.trim() || DEFAULTS.WEBAPP_URL;

  await chrome.storage.sync.set({
    [STORAGE_KEYS.API_BASE]: apiUrl === DEFAULTS.API_BASE ? '' : apiUrl,
    [STORAGE_KEYS.WEBAPP_URL]: webappUrl === DEFAULTS.WEBAPP_URL ? '' : webappUrl,
    [STORAGE_KEYS.PREFERENCES]: {
      notifSave: notifSave.checked,
      notifComplete: notifComplete.checked,
    },
  });

  saveMsg.classList.remove('hidden');
  setTimeout(() => saveMsg.classList.add('hidden'), 2000);
});

// Sign out
signOutBtn.addEventListener('click', async () => {
  await clearToken();
  authDot.className = 'auth-dot disconnected';
  authText.textContent = 'Signed out';
});

init();
