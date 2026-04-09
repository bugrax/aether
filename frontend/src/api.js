const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

let authToken = null;
let currentVaultId = null;

export function setAuthToken(token) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

export function setCurrentVaultId(vaultId) {
  currentVaultId = vaultId;
  if (vaultId) {
    try { localStorage.setItem('aether_current_vault_id', vaultId); } catch {}
  }
}

export function getCurrentVaultId() {
  if (currentVaultId) return currentVaultId;
  try { return localStorage.getItem('aether_current_vault_id'); } catch { return null; }
}

async function request(method, path, body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const vaultId = getCurrentVaultId();
  if (vaultId) {
    headers['X-Vault-Id'] = vaultId;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// ── Notes ─────────────────────────────────────────────
export const notesAPI = {
  list: (params = {}) => {
    if (!params.limit) params.limit = 20;
    const query = new URLSearchParams(params).toString();
    return request('GET', `/notes${query ? '?' + query : ''}`);
  },
  get: (id) => request('GET', `/notes/${id}`),
  create: (data) => request('POST', '/notes', data),
  update: (id, data) => request('PUT', `/notes/${id}`, data),
  delete: (id) => request('DELETE', `/notes/${id}`),
  revisions: (id) => request('GET', `/notes/${id}/revisions`),
  updateLabels: (id, labelIds) => request('PUT', `/notes/${id}/labels`, { label_ids: labelIds }),
  shareURL: (url) => request('POST', '/share', { url }),
  toggleShare: (id) => request('POST', `/notes/${id}/share`),
  search: (query) => request('GET', `/search?q=${encodeURIComponent(query)}`),
  related: (id) => request('GET', `/notes/${id}/related`),
  stats: () => request('GET', '/notes/stats'),

  // SSE — stream note status updates
  streamStatus: (noteId, onMessage, onError) => {
    const url = `${API_BASE}/notes/${noteId}/stream`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
        if (data.status === 'ready' || data.status === 'error' || data.status === 'timeout') {
          eventSource.close();
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    eventSource.onerror = () => {
      if (onError) onError();
      eventSource.close();
    };

    return eventSource;
  },
};

// ── Labels ────────────────────────────────────────────
export const labelsAPI = {
  list: () => request('GET', '/labels'),
  create: (data) => request('POST', '/labels', data),
  update: (id, data) => request('PUT', `/labels/${id}`, data),
  delete: (id) => request('DELETE', `/labels/${id}`),
};

// ── Users & Settings ──────────────────────────────────
export const usersAPI = {
  getSettings: () => request('GET', '/user/settings'),
  updateSettings: (data) => request('PATCH', '/user/settings', data),
  deleteAccount: () => request('DELETE', '/user/account'),
  registerFCMToken: (token) => request('POST', '/user/fcm-token', { token }),
};

// ── Vaults ───────────────────────────────────────────
export const vaultsAPI = {
  list: () => request('GET', '/vaults'),
  create: (data) => request('POST', '/vaults', data),
  update: (id, data) => request('PUT', `/vaults/${id}`, data),
  delete: (id) => request('DELETE', `/vaults/${id}`),
  setDefault: (id) => request('POST', `/vaults/${id}/default`),
  moveNote: (noteId, targetVaultId) => request('POST', `/notes/${noteId}/move`, { target_vault_id: targetVaultId }),
};

// ── Knowledge Graph ──────────────────────────────────
export const graphAPI = {
  get: () => request('GET', '/graph'),
  entities: () => request('GET', '/graph/entities'),
};

// ── Activity Log ─────────────────────────────────────
export const activityAPI = {
  list: () => request('GET', '/activity'),
};

// ── Synthesis Pages ──────────────────────────────────
export const synthesisAPI = {
  list: () => request('GET', '/synthesis'),
  get: (id) => request('GET', `/synthesis/${id}`),
};

// ── Entities ─────────────────────────────────────────
export const entitiesAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request('GET', `/entities${query ? '?' + query : ''}`);
  },
  get: (id) => request('GET', `/entities/${id}`),
};

// ── Chat ─────────────────────────────────────────────
export const chatAPI = {
  send: async (message, sessionId, language, onToken, onDone, onError) => {
    try {
      // Debug logs removed for production

      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        console.log('[Chat] TIMEOUT after 90s');
        controller.abort();
      }, 90000);

      console.log('[Chat] Fetching:', `${API_BASE}/chat`);
      const resp = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, session_id: sessionId, language }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      console.log('[Chat] Response status:', resp.status, resp.statusText);
      console.log('[Chat] Response headers:', resp.headers.get('content-type'));

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => 'no body');
        console.log('[Chat] Error body:', errBody);
        throw new Error(`Chat failed: ${resp.status} ${errBody.substring(0, 200)}`);
      }

      if (!resp.body) {
        console.log('[Chat] No response body (ReadableStream not available)');
        throw new Error('Streaming not supported');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let gotDone = false;
      let tokenCount = 0;

      console.log('[Chat] Starting stream read...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[Chat] Stream ended. Tokens received:', tokenCount);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        if (tokenCount === 0) {
          console.log('[Chat] First chunk received:', chunk.substring(0, 100));
        }

        // Process complete SSE messages (separated by double newline)
        while (buffer.includes('\n\n')) {
          const idx = buffer.indexOf('\n\n');
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          let data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('data: ')) {
              data = line.slice(6);
            }
          }

          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text !== undefined) {
              tokenCount++;
              onToken(parsed.text);
            } else if (parsed.id) {
              console.log('[Chat] Done event, id:', parsed.id);
              gotDone = true;
              onDone(parsed.id);
            } else if (parsed.error) {
              console.log('[Chat] Error event:', parsed.error);
              onError(parsed.error);
              return;
            }
          } catch (e) {
            console.log('[Chat] JSON parse error:', e.message, 'data:', data.substring(0, 100));
          }
        }
      }

      if (!gotDone) {
        console.log('[Chat] Stream ended without done event. Buffer remaining:', buffer.substring(0, 200));
        onDone(null);
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        onError('Request timed out. Please try again.');
      } else {
        onError(err.message);
      }
    }
  },
  feedback: (messageId, value) => request('POST', `/chat/${messageId}/feedback`, { feedback: value }),
  sessions: () => request('GET', '/chat/sessions'),
  sessionMessages: (sessionId) => request('GET', `/chat/sessions/${sessionId}`),
};
