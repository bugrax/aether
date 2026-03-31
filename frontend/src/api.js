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
};
