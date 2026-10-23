// API client. The access token lives only in memory (never localStorage); the refresh token is an
// httpOnly SameSite=Strict cookie that JavaScript cannot read. Every request is same-origin via the gateway.
let accessToken = null;
let onSession = () => {};
export const getToken = () => accessToken;
export const setToken = (t) => { accessToken = t; };
export const onSessionChange = (fn) => { onSession = fn; };

export class ApiError extends Error {
  constructor(status, message, code, details, retryAfter) { super(message); this.status = status; this.code = code; this.details = details; this.retryAfter = retryAfter; }
}

let refreshing = null;
export function refresh() {
  refreshing ??= (async () => {
    try {
      const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'findit' } });
      if (!r.ok) { accessToken = null; onSession(null); return false; }
      const d = await r.json();
      accessToken = d.accessToken; onSession(d.user);
      return true;
    } catch { return false; }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

// `form` = FormData (multipart). `raw` = a File/Blob sent as-is with its own content type (used for avatars).
async function request(path, { method = 'GET', body, form, raw, retry = true, signal } = {}) {
  const headers = { 'X-Requested-With': 'findit' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (raw) headers['Content-Type'] = raw.type;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, credentials: 'include', signal, body: raw ?? form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  if (res.status === 401 && retry && !path.startsWith('/auth/login') && !path.startsWith('/auth/register') && (await refresh())) return request(path, { method, body, form, raw, retry: false, signal });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const retryAfter = data?.retryAfter ?? (Number(res.headers.get('Retry-After')) || undefined);
    const fallback = res.status === 413 ? 'That file is too large' : `Request failed (${res.status})`;
    throw new ApiError(res.status, data?.error?.message ?? fallback, data?.error?.code, data?.error?.details, retryAfter);
  }
  return data;
}

export const api = {
  get: (p, o) => request(p, o),
  post: (p, body, o) => request(p, { ...o, method: 'POST', body: body ?? {} }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  del: (p) => request(p, { method: 'DELETE' }),
  upload: (p, form) => request(p, { method: 'POST', form }),
  /** Sends a File as the raw request body (Content-Type = file.type). */
  uploadRaw: (p, file) => request(p, { method: 'POST', raw: file }),
};

/** Only same-origin relative paths are accepted for post-login redirects (blocks open redirects). */
export const safeNext = (n, fallback = '/') => (typeof n === 'string' && /^\/(?![/\\])/.test(n) ? n : fallback);

export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};