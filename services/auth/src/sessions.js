import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { RefreshToken, User } from './models.js';
import { signAccess } from '@findit/shared/tokens';
import { trusted } from '@findit/shared/db';
import { unauthorized } from '@findit/shared/errors';

const REFRESH_DAYS = 7;
export const COOKIE = 'fi_rt';

export const cookieOpts = (env) => ({
  httpOnly: true, secure: env.NODE_ENV !== 'test', sameSite: 'strict', path: '/api/auth', maxAge: REFRESH_DAYS * 86400 * 1000,
});

function signRefresh(env, { sub, family, jti, tv }) {
  return jwt.sign({ fam: family, tv }, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256', expiresIn: `${REFRESH_DAYS}d`, issuer: env.JWT_ISSUER, audience: `${env.JWT_AUDIENCE}:refresh`, subject: String(sub), jwtid: jti,
  });
}

/** "Chrome on Windows" from a User-Agent string. Only a label for the Devices list, never used for security. */
export function describeDevice(ua) {
  const s = String(ua ?? '');
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Browser';
  const os = /Android/.test(s) ? 'Android' : /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /CrOS/.test(s) ? 'ChromeOS' : /Linux/.test(s) ? 'Linux' : 'Unknown device';
  return `${browser} on ${os}`;
}

/** Hide the last part of an address, so the list shows the area but not the exact address. */
export function maskIp(ip) {
  const s = String(ip ?? '').replace(/^::ffff:/, '');
  const v4 = s.split('.');
  if (v4.length === 4 && v4.every((p) => /^\d{1,3}$/.test(p))) return `${v4.slice(0, 3).join('.')}.x`;
  if (s.includes(':')) return `${s.split(':').slice(0, 3).join(':')}:…`;
  return '';
}

export async function issueSession(env, user, family = crypto.randomUUID(), meta = {}) {
  const jti = crypto.randomUUID();
  await RefreshToken.create({
    user: user._id, family, jti, expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400 * 1000),
    ua: String(meta.ua ?? '').slice(0, 200) || undefined, ip: String(meta.ip ?? '').slice(0, 64) || undefined, loginAt: meta.loginAt ?? new Date(),
  });
  const refresh = signRefresh(env, { sub: user._id, family, jti, tv: user.tokenVersion ?? 0 });
  const access = signAccess(env, { sub: user._id, role: user.role, name: user.name });
  return { access, refresh, jti, family };
}

/** Rotation with reuse detection: a revoked token being replayed revokes the whole family. */
export async function rotate(env, rawRefresh, ip) {
  let p;
  try {
    p = jwt.verify(rawRefresh, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'], issuer: env.JWT_ISSUER, audience: `${env.JWT_AUDIENCE}:refresh` });
  } catch { throw unauthorized(); }
  const rec = await RefreshToken.findOne({ jti: p.jti });
  if (!rec) throw unauthorized();
  if (rec.revokedAt) {
    await RefreshToken.updateMany({ family: rec.family, revokedAt: null }, { revokedAt: new Date() });
    throw unauthorized();
  }
  const user = await User.findById(p.sub).select('+tokenVersion');
  if (!user || !user.isActive || (user.tokenVersion ?? 0) !== p.tv) throw unauthorized();
  const next = await issueSession(env, user, rec.family, { ua: rec.ua, ip: ip ?? rec.ip, loginAt: rec.loginAt }); // same device: keep its label and first login time
  rec.revokedAt = new Date();
  rec.replacedBy = next.jti;
  await rec.save();
  return { ...next, user };
}

export async function revokeFamilyFromToken(env, rawRefresh) {
  try {
    const p = jwt.verify(rawRefresh, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'], issuer: env.JWT_ISSUER, audience: `${env.JWT_AUDIENCE}:refresh`, ignoreExpiration: true });
    await RefreshToken.updateMany({ family: p.fam, revokedAt: null }, { revokedAt: new Date() });
  } catch { /* nothing to revoke */ }
}

export const revokeAllForUser = (userId) => RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });

/** The login (family) a refresh cookie belongs to, or null. An expired cookie still identifies its device. */
export function familyFromToken(env, rawRefresh) {
  if (!rawRefresh) return null;
  try {
    return jwt.verify(rawRefresh, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'], issuer: env.JWT_ISSUER, audience: `${env.JWT_AUDIENCE}:refresh`, ignoreExpiration: true }).fam ?? null;
  } catch { return null; }
}

/** One row per signed-in device: a login has exactly one live (unrevoked, unexpired) refresh token at a time. */
export async function listSessions(userId, currentFamily) {
  const rows = await RefreshToken.find({ user: userId, revokedAt: null, expiresAt: trusted({ $gt: new Date() }) }).sort({ createdAt: -1 }).limit(50);
  return rows.map((r) => ({ id: r.family, device: describeDevice(r.ua), ip: maskIp(r.ip), loginAt: r.loginAt ?? r.createdAt, lastActive: r.createdAt, current: r.family === currentFamily }));
}

/** Signs one device out. Scoped to the caller's own logins, so another user's id simply matches nothing. */
export async function revokeFamily(userId, family) {
  const r = await RefreshToken.updateMany({ user: userId, family, revokedAt: null }, { revokedAt: new Date() });
  return r.modifiedCount;
}
