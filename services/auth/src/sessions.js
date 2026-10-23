import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { RefreshToken, User } from './models.js';
import { signAccess } from '@findit/shared/tokens';
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

export async function issueSession(env, user, family = crypto.randomUUID()) {
  const jti = crypto.randomUUID();
  await RefreshToken.create({ user: user._id, family, jti, expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400 * 1000) });
  const refresh = signRefresh(env, { sub: user._id, family, jti, tv: user.tokenVersion ?? 0 });
  const access = signAccess(env, { sub: user._id, role: user.role, name: user.name });
  return { access, refresh, jti, family };
}

/** Rotation with reuse detection: a revoked token being replayed revokes the whole family. */
export async function rotate(env, rawRefresh) {
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
  const next = await issueSession(env, user, rec.family);
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
