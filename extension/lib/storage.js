// chrome.storage.session - ephemeral, cleared on browser close
export async function getSession(key) {
  const result = await chrome.storage.session.get(key);
  return result[key] ?? null;
}

export async function setSession(key, value) {
  await chrome.storage.session.set({ [key]: value });
}

export async function removeSession(key) {
  await chrome.storage.session.remove(key);
}

// chrome.storage.local - persistent
export async function getLocal(key) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? null;
}

export async function setLocal(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeLocal(key) {
  await chrome.storage.local.remove(key);
}

// chrome.storage.sync - syncs across devices
export async function getSync(key) {
  const result = await chrome.storage.sync.get(key);
  return result[key] ?? null;
}

export async function setSync(key, value) {
  await chrome.storage.sync.set({ [key]: value });
}
