import { notesAPI } from '../lib/api.js';
import { getToken, setToken, clearToken, isAuthenticated } from '../lib/auth.js';
import { getSession, setSession, getLocal, setLocal } from '../lib/storage.js';
import { STORAGE_KEYS, getWebappUrl } from '../lib/constants.js';

// ── Context Menu Setup ───────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-page-to-aether',
    title: 'Save Page to Aether',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'save-link-to-aether',
    title: 'Save Link to Aether',
    contexts: ['link'],
  });
});

// ── Context Menu Click Handler ───────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.menuItemId === 'save-link-to-aether'
    ? info.linkUrl
    : info.pageUrl || tab?.url;

  if (url) {
    await saveURL(url);
  }
});

// ── Keyboard Shortcut Handler ────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-current-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      await saveURL(tab.url);
    }
  }
});

// ── Message Handler (from popup & content script) ────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTH_TOKEN') {
    handleAuthToken(message).then(sendResponse);
    return true; // async response
  }

  if (message.type === 'SAVE_URL') {
    saveURL(message.url).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_STATUS') {
    getExtensionStatus().then(sendResponse);
    return true;
  }
});

async function handleAuthToken(message) {
  await setToken(message.token, message.expiresAt);

  // Schedule token refresh 50 minutes from now
  chrome.alarms.create('refresh-token', { delayInMinutes: 50 });

  // Retry offline queue now that we have auth
  await retryOfflineQueue();

  return { success: true };
}

async function getExtensionStatus() {
  const authenticated = await isAuthenticated();
  const processing = await getSession(STORAGE_KEYS.PROCESSING_NOTES) || [];
  const offlineQueue = await getLocal(STORAGE_KEYS.OFFLINE_QUEUE) || [];
  return { authenticated, processingCount: processing.length, offlineCount: offlineQueue.length };
}

// ── Core Save Function ───────────────────────────────

async function saveURL(url) {
  // Validate URL
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    showNotification('Cannot Save', 'This page cannot be saved to Aether.');
    return { success: false, error: 'invalid_url' };
  }

  try {
    const result = await notesAPI.shareURL(url);
    const noteId = result.note.id;
    const title = result.note.title || url;

    // Track processing note
    await addProcessingNote(noteId, title, url);
    await updateBadge();

    // Start polling for status (every 6 seconds)
    chrome.alarms.create(`poll-${noteId}`, { periodInMinutes: 0.1 });

    showNotification('Saved to Aether', `Processing: ${truncate(url, 60)}`);
    return { success: true, noteId };
  } catch (err) {
    if (err.message === 'NOT_AUTHENTICATED' || err.message === 'TOKEN_EXPIRED') {
      showNotification('Sign In Required', 'Open Aether to sign in first.');
      const webappUrl = await getWebappUrl();
      chrome.tabs.create({ url: `${webappUrl}/login` });
      return { success: false, error: 'not_authenticated' };
    }

    // Network or other error
    return { success: false, error: err.message };
  }
}

// ── Processing Status Polling ────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('poll-')) {
    const noteId = alarm.name.replace('poll-', '');
    await pollNoteStatus(noteId);
  }

  if (alarm.name === 'retry-offline-queue') {
    await retryOfflineQueue();
  }

  if (alarm.name === 'refresh-token') {
    await requestTokenRefresh();
  }
});

async function pollNoteStatus(noteId) {
  try {
    const data = await notesAPI.get(noteId);
    const note = data.note || data;

    if (note.status === 'ready') {
      chrome.alarms.clear(`poll-${noteId}`);
      await removeProcessingNote(noteId);
      await updateBadge();

      const webappUrl = await getWebappUrl();
      showNotification(
        'Processing Complete',
        `"${truncate(note.title, 50)}" is ready!`,
        noteId
      );
    } else if (note.status === 'error') {
      chrome.alarms.clear(`poll-${noteId}`);
      await removeProcessingNote(noteId);
      await updateBadge();

      showNotification('Processing Failed', 'Could not process the URL.');
    }
    // If still processing, alarm continues
  } catch (err) {
    // Stop polling on auth errors or if note was deleted/not found
    if (err.message === 'NOT_AUTHENTICATED' || err.message === 'TOKEN_EXPIRED'
        || err.message.includes('404') || err.message.includes('not found')) {
      chrome.alarms.clear(`poll-${noteId}`);
      await removeProcessingNote(noteId);
      await updateBadge();
    }
  }
}

// ── Token Refresh ────────────────────────────────────

async function requestTokenRefresh() {
  // Try to get a fresh token by messaging any open Aether tab
  const tabs = await chrome.tabs.query({ url: ['https://app.aether.relayhaus.org/*', 'http://localhost:5173/*'] });

  if (tabs.length > 0) {
    // Ask the webapp to send a fresh token
    try {
      await chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_TOKEN_REFRESH' });
    } catch {
      // Tab might not have content script ready
    }
  }
  // If no tabs open, token will expire and user will need to re-login
}

// ── Processing Notes Tracker ─────────────────────────

async function addProcessingNote(noteId, title, url) {
  const notes = await getSession(STORAGE_KEYS.PROCESSING_NOTES) || [];
  notes.push({ id: noteId, title, url, startedAt: Date.now() });
  await setSession(STORAGE_KEYS.PROCESSING_NOTES, notes);
}

async function removeProcessingNote(noteId) {
  const notes = await getSession(STORAGE_KEYS.PROCESSING_NOTES) || [];
  const filtered = notes.filter((n) => n.id !== noteId);
  await setSession(STORAGE_KEYS.PROCESSING_NOTES, filtered);
}

// ── Badge ────────────────────────────────────────────

async function updateBadge() {
  const notes = await getSession(STORAGE_KEYS.PROCESSING_NOTES) || [];
  const count = notes.length;

  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: '#b79fff' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ── Notifications ────────────────────────────────────

function showNotification(title, message, noteId) {
  const notifId = noteId ? `note-${noteId}` : `aether-${Date.now()}`;
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title,
    message,
    priority: 1,
  });
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith('note-')) {
    const noteId = notificationId.replace('note-', '');
    const webappUrl = await getWebappUrl();
    chrome.tabs.create({ url: `${webappUrl}/vault/${noteId}` });
  }
  chrome.notifications.clear(notificationId);
});

// ── Offline Queue ────────────────────────────────────

async function addToOfflineQueue(url) {
  const queue = await getLocal(STORAGE_KEYS.OFFLINE_QUEUE) || [];
  queue.push({ url, timestamp: Date.now() });
  await setLocal(STORAGE_KEYS.OFFLINE_QUEUE, queue);

  // Retry every minute
  chrome.alarms.create('retry-offline-queue', { periodInMinutes: 1 });
}

async function retryOfflineQueue() {
  const queue = await getLocal(STORAGE_KEYS.OFFLINE_QUEUE) || [];
  if (queue.length === 0) {
    chrome.alarms.clear('retry-offline-queue');
    return;
  }

  const hasAuth = await isAuthenticated();
  if (!hasAuth) return;

  const remaining = [];
  for (const item of queue) {
    try {
      await notesAPI.shareURL(item.url);
    } catch (err) {
      if (err.message !== 'NOT_AUTHENTICATED' && err.message !== 'TOKEN_EXPIRED') {
        remaining.push(item);
      }
    }
  }

  await setLocal(STORAGE_KEYS.OFFLINE_QUEUE, remaining);
  if (remaining.length === 0) {
    chrome.alarms.clear('retry-offline-queue');
    showNotification('Queue Synced', 'All offline URLs have been saved.');
  }
}

// ── Utilities ────────────────────────────────────────

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}
