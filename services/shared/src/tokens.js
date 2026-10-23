import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { unauthorized, forbidden } from './errors.js';

export function signAccess(env, { sub, role, name }) {
  return jwt.sign({ role, name }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256', expiresIn: '15m', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, subject: String(sub),
  });
}

/** Algorithm is pinned; `none` and algorithm confusion are rejected; exp/iss/aud verified. */
export function verifyAccess(env, token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'], issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE,
  });
}

const toUser = (p) => ({ id: p.sub, role: p.role, name: p.name });

export const authenticate = (env) => (req, _res, next) => {
  const h = req.headers.authorization;
  if (typeof h !== 'string' || !h.startsWith('Bearer ')) return next(unauthorized());
  try {
    req.user = toUser(verifyAccess(env, h.slice(7)));
    next();
  } catch {
    next(unauthorized());
  }
};

export const optionalAuth = (env) => (req, _res, next) => {
  const h = req.headers.authorization;
  if (typeof h === 'string' && h.startsWith('Bearer ')) {
    try { req.user = toUser(verifyAccess(env, h.slice(7))); } catch { /* treated as anonymous */ }
  }
  next();
};

/** Admin check reads role + isActive from the database (via `lookup`), not only the token. */
export const requireAdmin = (lookup) => async (req, _res, next) => {
  try {
    if (!req.user) return next(unauthorized());
    const u = await lookup(req.user.id);
    if (!u || u.isActive === false || u.role !== 'admin') return next(forbidden());
    next();
  } catch (e) { next(e); }
};

export function timingSafeEqualStr(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const internalOnly = (env) => (req, _res, next) =>
  timingSafeEqualStr(req.headers['x-internal-token'], env.INTERNAL_SERVICE_TOKEN) ? next() : next(forbidden());

export async function internalFetch(env, url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'x-internal-token': env.INTERNAL_SERVICE_TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`internal call failed: ${res.status}`);
  return res.json();
}
