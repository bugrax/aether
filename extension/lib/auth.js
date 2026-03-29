import { STORAGE_KEYS } from './constants.js';
import { getSession, setSession, removeSession } from './storage.js';

export async function getToken() {
  const token = await getSession(STORAGE_KEYS.AUTH_TOKEN);
  if (!token) return null;

  const expiry = await getSession(STORAGE_KEYS.TOKEN_EXPIRY);
  if (expiry && Date.now() > expiry) {
    await clearToken();
    return null;
  }

  return token;
}

export async function setToken(token, expiresAt) {
  await setSession(STORAGE_KEYS.AUTH_TOKEN, token);
  if (expiresAt) {
    await setSession(STORAGE_KEYS.TOKEN_EXPIRY, expiresAt);
  }
}

export async function clearToken() {
  await removeSession(STORAGE_KEYS.AUTH_TOKEN);
  await removeSession(STORAGE_KEYS.TOKEN_EXPIRY);
}

export async function isAuthenticated() {
  const token = await getToken();
  return !!token;
}
