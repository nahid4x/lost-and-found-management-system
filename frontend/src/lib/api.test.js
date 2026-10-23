import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setToken, getToken, safeNext, qs, ApiError } from './api.js';

const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (body === undefined ? '' : JSON.stringify(body)) });

describe('api client', () => {
  beforeEach(() => { setToken(null); vi.restoreAllMocks(); localStorage.clear(); });

  it('sends the CSRF header + bearer token, never touches localStorage/sessionStorage', async () => {
    setToken('tok');
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(res(200, { ok: 1 }));
    await api.get('/items/stats');
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('/api/items/stats');
    expect(opts.headers['X-Requested-With']).toBe('findit');
    expect(opts.headers.Authorization).toBe('Bearer tok');
    expect(opts.credentials).toBe('include');
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    setToken('old');
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(res(401, { error: { message: 'Authentication required' } }))
      .mockResolvedValueOnce(res(200, { accessToken: 'new', user: { id: 'u' } })) // /auth/refresh
      .mockResolvedValueOnce(res(200, { data: 1 }));
    const r = await api.get('/claims/mine');
    expect(r).toEqual({ data: 1 });
    expect(getToken()).toBe('new');
    expect(f.mock.calls[1][0]).toBe('/api/auth/refresh');
    expect(f.mock.calls[2][1].headers.Authorization).toBe('Bearer new');
  });

  it('deduplicates concurrent refreshes and does not loop forever', async () => {
    setToken('old');
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (url === '/api/auth/refresh' ? res(401, {}) : res(401, { error: { message: 'no' } })));
    await expect(Promise.all([api.get('/a'), api.get('/b')])).rejects.toBeInstanceOf(ApiError);
    expect(f.mock.calls.filter(([u]) => u === '/api/auth/refresh').length).toBe(1);
    expect(getToken()).toBeNull();
  });

  it('login failures are not retried via refresh and surface the server message', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(res(401, { error: { message: 'Invalid email or password' } }));
    await expect(api.post('/auth/login', { email: 'a', password: 'b' })).rejects.toThrow('Invalid email or password');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('safeNext blocks open redirects; qs drops empty values', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', undefined, null]) expect(safeNext(bad)).toBe('/');
    expect(safeNext('/items/5?x=1')).toBe('/items/5?x=1');
    expect(qs({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x+y');
  });
});
