export const API_BASE_URL_PROD = 'https://aether.relayhaus.org/api/v1';
export const API_BASE_URL_DEV = 'http://localhost:8080/api/v1';

export const WEBAPP_URL_PROD = 'https://aether.relayhaus.org';
export const WEBAPP_URL_DEV = 'http://localhost:5173';

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'authToken',
  TOKEN_EXPIRY: 'tokenExpiry',
  API_BASE: 'apiBaseUrl',
  WEBAPP_URL: 'webappUrl',
  RECENT_NOTES: 'recentNotes',
  OFFLINE_QUEUE: 'offlineQueue',
  PROCESSING_NOTES: 'processingNotes',
  PREFERENCES: 'preferences',
};

export const DEFAULTS = {
  API_BASE: API_BASE_URL_PROD,
  WEBAPP_URL: WEBAPP_URL_PROD,
};

export async function getApiBase() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.API_BASE);
  return result[STORAGE_KEYS.API_BASE] || DEFAULTS.API_BASE;
}

export async function getWebappUrl() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.WEBAPP_URL);
  return result[STORAGE_KEYS.WEBAPP_URL] || DEFAULTS.WEBAPP_URL;
}
