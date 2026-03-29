import { notesAPI } from '../lib/api.js';
import { isAuthenticated } from '../lib/auth.js';
import { getSession, getLocal, setLocal } from '../lib/storage.js';
import { STORAGE_KEYS, getWebappUrl } from '../lib/constants.js';

// ── DOM Elements ─────────────────────────────────────

const authView = document.getElementById('auth-view');
const mainView = document.getElementById('main-view');
const signInBtn = document.getElementById('sign-in-btn');
const settingsBtn = document.getElementById('settings-btn');

const pageFavicon = document.getElementById('page-favicon');
const pageUrl = document.getElementById('page-url');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const searchResults = document.getElementById('search-results');

const processingSection = document.getElementById('processing-section');
const processingList = document.getElementById('processing-list');

const recentNotes = document.getElementById('recent-notes');
const recentEmpty = document.getElementById('recent-empty');
const recentLoading = document.getElementById('recent-loading');
const recentDivider = document.getElementById('recent-divider');

// ── State ────────────────────────────────────────────

let currentTabUrl = null;
let searchTimeout = null;

// ── Init ─────────────────────────────────────────────

async function init() {
  try {
    const authenticated = await isAuthenticated();

    if (!authenticated) {
      authView.classList.remove('hidden');
      mainView.classList.add('hidden');
      return;
    }

    authView.classList.add('hidden');
    mainView.classList.remove('hidden');

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      currentTabUrl = tab.url;
      displayCurrentPage(tab);
    }

    // Load processing notes
    await loadProcessingNotes();

    // Load recent notes
    await loadRecentNotes();
  } catch (err) {
    console.error('[Aether] Init error:', err);
    // Show error state in popup
    authView.classList.add('hidden');
    mainView.classList.remove('hidden');
    showSaveStatus('error', `Init error: ${err.message}`);
  }
}

// ── Current Page ─────────────────────────────────────

function displayCurrentPage(tab) {
  // Favicon
  if (tab.favIconUrl) {
    const img = document.createElement('img');
    img.src = tab.favIconUrl;
    img.onerror = () => { pageFavicon.textContent = ''; };
    pageFavicon.innerHTML = '';
    pageFavicon.appendChild(img);
  }

  // URL display
  try {
    const url = new URL(tab.url);
    pageUrl.textContent = url.hostname + (url.pathname !== '/' ? url.pathname : '');
  } catch {
    pageUrl.textContent = tab.url;
  }

  // Check if URL is unsaveable
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Cannot save this page';
    return;
  }

  // Check if already saved (from recent notes cache)
  checkIfAlreadySaved(tab.url);
}

async function checkIfAlreadySaved(url) {
  const cached = await getLocal(STORAGE_KEYS.RECENT_NOTES);
  if (cached && Array.isArray(cached)) {
    const found = cached.find((n) => n.source_url === url);
    if (found) {
      showSaveStatus('already', `Already in vault: "${truncate(found.title, 40)}"`);
      saveBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Already Saved`;
      saveBtn.disabled = true;
      return;
    }
  }

  // Also check processing notes
  const processing = await getSession(STORAGE_KEYS.PROCESSING_NOTES) || [];
  const inProgress = processing.find((n) => n.url === url);
  if (inProgress) {
    showSaveStatus('saving', 'Currently processing...');
    saveBtn.disabled = true;
  }
}

// ── Save ─────────────────────────────────────────────

saveBtn.addEventListener('click', async () => {
  if (!currentTabUrl || saveBtn.disabled) return;

  saveBtn.disabled = true;
  saveBtn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Saving...`;
  showSaveStatus('saving', 'Sending to Aether...');

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'SAVE_URL', url: currentTabUrl });
  } catch (err) {
    console.error('sendMessage failed:', err);
    showSaveStatus('error', `Extension error: ${err.message}`);
    saveBtn.disabled = false;
    saveBtn.innerHTML = 'Retry';
    return;
  }

  if (response?.success) {
    saveBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Saved!`;
    showSaveStatus('success', 'URL queued for processing');
    await loadProcessingNotes();
  } else if (response?.error === 'not_authenticated') {
    showSaveStatus('error', 'Sign in required — open Aether webapp first');
    saveBtn.disabled = false;
    saveBtn.innerHTML = 'Save to Aether';
  } else {
    showSaveStatus('error', `Error: ${response?.error || 'unknown'}`);
    saveBtn.disabled = false;
    saveBtn.innerHTML = 'Retry';
  }
});

function showSaveStatus(type, message) {
  saveStatus.textContent = message;
  saveStatus.className = `save-status ${type}`;
  saveStatus.classList.remove('hidden');
}

// ── Search ───────────────────────────────────────────

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();

  // Show/hide clear button
  searchClear.classList.toggle('hidden', !query);

  // Debounce
  clearTimeout(searchTimeout);

  if (!query) {
    searchResults.classList.add('hidden');
    searchResults.innerHTML = '';
    recentDivider.classList.remove('hidden');
    return;
  }

  searchTimeout = setTimeout(() => performSearch(query), 400);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  searchResults.classList.add('hidden');
  searchResults.innerHTML = '';
  recentDivider.classList.remove('hidden');
  searchInput.focus();
});

async function performSearch(query) {
  searchResults.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  searchResults.classList.remove('hidden');
  recentDivider.classList.add('hidden');

  try {
    const data = await notesAPI.search(query);
    const results = data.results || [];

    if (results.length === 0) {
      searchResults.innerHTML = '<div class="empty-mini"><p>No results found</p></div>';
      return;
    }

    searchResults.innerHTML = '';
    for (const note of results) {
      searchResults.appendChild(createNoteCard(note));
    }
  } catch (err) {
    searchResults.innerHTML = `<div class="empty-mini"><p style="color:var(--error)">Search failed</p></div>`;
  }
}

// ── Processing Notes ─────────────────────────────────

async function loadProcessingNotes() {
  const notes = await getSession(STORAGE_KEYS.PROCESSING_NOTES) || [];

  if (notes.length === 0) {
    processingSection.classList.add('hidden');
    return;
  }

  processingSection.classList.remove('hidden');
  processingList.innerHTML = '';

  for (const note of notes) {
    const card = document.createElement('div');
    card.className = 'processing-card';
    card.innerHTML = `
      <div class="spinner-sm"></div>
      <div class="processing-card-info">
        <div class="processing-card-title">${escapeHtml(note.title || 'Processing...')}</div>
        <div class="processing-card-url">${escapeHtml(truncate(note.url, 50))}</div>
      </div>`;
    processingList.appendChild(card);
  }
}

// ── Recent Notes ─────────────────────────────────────

async function loadRecentNotes() {
  // Show cached first
  const cached = await getLocal(STORAGE_KEYS.RECENT_NOTES);
  if (cached && cached.length > 0) {
    renderRecentNotes(cached);
  } else {
    recentLoading.classList.remove('hidden');
  }

  // Fetch fresh data
  try {
    const data = await notesAPI.list({ limit: 10 });
    const notes = data.notes || [];
    await setLocal(STORAGE_KEYS.RECENT_NOTES, notes);
    renderRecentNotes(notes);
  } catch (err) {
    if (!cached || cached.length === 0) {
      recentEmpty.classList.remove('hidden');
    }
  } finally {
    recentLoading.classList.add('hidden');
  }
}

function renderRecentNotes(notes) {
  recentNotes.innerHTML = '';
  recentLoading.classList.add('hidden');

  if (notes.length === 0) {
    recentEmpty.classList.remove('hidden');
    return;
  }

  recentEmpty.classList.add('hidden');
  for (const note of notes.slice(0, 10)) {
    recentNotes.appendChild(createNoteCard(note));
  }
}

// ── Note Card Component ──────────────────────────────

function createNoteCard(note) {
  const card = document.createElement('a');
  card.className = 'note-card';
  card.href = '#';
  card.addEventListener('click', async (e) => {
    e.preventDefault();
    const webappUrl = await getWebappUrl();
    chrome.tabs.create({ url: `${webappUrl}/vault/${note.id}` });
    window.close();
  });

  const title = note.title || 'Untitled';
  const domain = note.source_url ? getDomain(note.source_url) : null;
  const date = formatRelativeDate(note.updated_at || note.created_at);
  const labels = note.labels || [];

  let metaHtml = '';
  if (note.status && note.status !== 'ready') {
    metaHtml += `<span class="note-card-status ${note.status}">${note.status}</span>`;
  }
  if (domain) {
    metaHtml += `<span class="note-card-domain">${escapeHtml(domain)}</span>`;
  }
  if (date) {
    metaHtml += `<span>${date}</span>`;
  }

  let labelsHtml = '';
  if (labels.length > 0) {
    labelsHtml = `<div class="note-card-labels">${labels.map((l) =>
      `<span class="label-chip" style="border-left-color:${l.color || '#808080'}">${escapeHtml(l.name)}</span>`
    ).join('')}</div>`;
  }

  card.innerHTML = `
    <div class="note-card-title">${escapeHtml(title)}</div>
    <div class="note-card-meta">${metaHtml}</div>
    ${labelsHtml}`;

  return card;
}

// ── Navigation ───────────────────────────────────────

signInBtn.addEventListener('click', async () => {
  // Try to extract token from any open Aether tab first
  const tabs = await chrome.tabs.query({ url: ['https://aether.relayhaus.org/*', 'http://localhost:5173/*'] });
  if (tabs.length > 0) {
    try {
      // Execute script in the Aether tab to read Firebase token from IndexedDB
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          return new Promise((resolve) => {
            const request = indexedDB.open('firebaseLocalStorageDb');
            request.onsuccess = (event) => {
              const db = event.target.result;
              if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
                db.close();
                resolve(null);
                return;
              }
              const tx = db.transaction('firebaseLocalStorage', 'readonly');
              const store = tx.objectStore('firebaseLocalStorage');
              const getAll = store.getAll();
              getAll.onsuccess = () => {
                for (const item of getAll.result) {
                  if (item?.value?.stsTokenManager?.accessToken) {
                    db.close();
                    resolve({
                      token: item.value.stsTokenManager.accessToken,
                      expiresAt: item.value.stsTokenManager.expirationTime
                    });
                    return;
                  }
                }
                db.close();
                resolve(null);
              };
              getAll.onerror = () => { db.close(); resolve(null); };
            };
            request.onerror = () => resolve(null);
          });
        },
      });

      const tokenData = results?.[0]?.result;
      if (tokenData?.token) {
        await chrome.runtime.sendMessage({
          type: 'AUTH_TOKEN',
          token: tokenData.token,
          expiresAt: tokenData.expiresAt,
        });
        // Reload popup
        window.location.reload();
        return;
      }
    } catch (err) {
      console.error('[Aether] Script injection failed:', err);
    }
  }

  // No Aether tab or no token — open webapp
  const webappUrl = await getWebappUrl();
  chrome.tabs.create({ url: `${webappUrl}/login` });
  window.close();
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ── Utilities ────────────────────────────────────────

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Start ────────────────────────────────────────────

init();
