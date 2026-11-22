/**
 * Single fetch wrapper for the whole frontend.
 * - cookies are always sent (session cookie is HttpOnly)
 * - the custom header marks requests as same-site, which the API requires in
 *   addition to the Origin check
 * - errors are normalised so pages never parse raw error shapes
 */
const REQUEST_MARKER = 'aera-market';

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export async function api(path, options = {}) {
  const { method = 'GET', body, signal } = options;

  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': REQUEST_MARKER
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload && payload.error ? payload.error : {};
    throw new ApiError(error.message || 'Request failed', error.code || 'INTERNAL', response.status);
  }

  return payload ? payload.data : null;
}

export async function currentSession() {
  try {
    return await api('/api/auth/session');
  } catch {
    return null;
  }
}

export async function signOut() {
  await api('/api/auth/session', { method: 'DELETE' });
}

export function redirectToLogin() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login.html?next=${next}`);
}
