import { getToken, clearToken } from './auth.js';
import { getApiBase } from './constants.js';

async function request(method, path, body = null) {
  const token = await getToken();
  if (!token) {
    throw new Error('NOT_AUTHENTICATED');
  }

  const apiBase = await getApiBase();
  const url = `${apiBase}${path}`;

  // console.log(`[Aether API] ${method} ${url}`);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  // console.log(`[Aether API] Response: ${res.status} ${res.statusText}`);

  if (res.status === 401) {
    await clearToken();
    throw new Error('TOKEN_EXPIRED');
  }

  // Read response text first, then try to parse as JSON
  const text = await res.text();

  if (!text) {
    if (res.ok) return {};
    throw new Error(`Empty response: ${res.status} ${res.statusText}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`[Aether API] Non-JSON response (${res.status}):`, text.slice(0, 200));
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 100)}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

export const notesAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request('GET', `/notes${query ? '?' + query : ''}`);
  },
  get: (id) => request('GET', `/notes/${id}`),
  create: (data) => request('POST', '/notes', data),
  shareURL: (url) => request('POST', '/share', { url }),
  search: (query) => request('GET', `/search?q=${encodeURIComponent(query)}`),
};

export const labelsAPI = {
  list: () => request('GET', '/labels'),
};
