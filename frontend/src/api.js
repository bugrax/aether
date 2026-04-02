const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

async function request(method, path, body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
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
};

// ── Chat ─────────────────────────────────────────────
export const chatAPI = {
  send: async (message, sessionId, language, onToken, onDone, onError) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const resp = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, session_id: sessionId, language }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Chat request failed');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const event = line.slice(7);
            // Next line should be data
            continue;
          }
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.text !== undefined) {
                onToken(parsed.text);
              } else if (parsed.id) {
                onDone(parsed.id);
              } else if (parsed.error) {
                onError(parsed.error);
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      onError(err.message);
    }
  },
  feedback: (messageId, value) => request('POST', `/chat/${messageId}/feedback`, { feedback: value }),
  sessions: () => request('GET', '/chat/sessions'),
  sessionMessages: (sessionId) => request('GET', `/chat/sessions/${sessionId}`),
};
