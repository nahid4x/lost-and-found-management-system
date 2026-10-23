import { z } from 'zod';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { createBaseApp } from '@findit/shared/app';
import { authenticate, requireAdmin, internalOnly } from '@findit/shared/tokens';
import { validate, objectId, pagination } from '@findit/shared/validate';
import { makeLimiter } from '@findit/shared/ratelimit';
import { forbidden, notFound, unauthorized, conflict, badRequest } from '@findit/shared/errors';
import { escapeRegex } from '@findit/shared/sanitize';
import { audit } from '@findit/shared/events';
import { trusted } from '@findit/shared/db';
import { makeAvatar } from '@findit/shared/cloud';
import { User, OneTimeToken, EmailOtp, EmailChange, Avatar, userView } from './models.js';
import { passwordSchema, hashPassword, verifyPassword } from './passwords.js';
import { issueSession, rotate, revokeFamilyFromToken, revokeAllForUser, cookieOpts, COOKIE } from './sessions.js';

const email = z.string().trim().toLowerCase().email().max(254);
const registerSchema = z.object({ name: z.string().trim().min(2).max(60), email, password: passwordSchema(10) }).strict();
const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
const tokenBody = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const forgotSchema = z.object({ email }).strict();
const resetSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema(10) }).strict();
const changeSchema = z.object({ current: z.string().min(1).max(128), password: passwordSchema(10) }).strict();
const adminPatch = z.object({ isActive: z.boolean().optional(), role: z.enum(['user', 'admin']).optional() }).strict().refine((v) => Object.keys(v).length > 0);
const adminList = pagination.extend({ q: z.string().trim().max(80).optional(), verified: z.enum(['true', 'false']).optional() });
const otpBody = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
const passwordConfirm = z.object({ password: z.string().min(1).max(128) }).strict();
const emailChangeSchema = z.object({ password: z.string().min(1).max(128), newEmail: email }).strict();
// eslint-disable-next-line no-control-regex -- intentionally strips control characters (keeps newline)
const stripCtl = (s) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '');
const profileSchema = z.object({
  name: z.string().trim().min(2).max(60).transform(stripCtl).optional(),
  bio: z.string().trim().max(280).transform(stripCtl).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const GENERIC_LOGIN_ERROR = 'Invalid email or password';
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const DELETE_GRACE_MS = 7 * 86_400_000;

export function createAuthApp({ env, logger, bus, redis = null }) {
  if (env.JWT_REFRESH_SECRET === env.JWT_ACCESS_SECRET) throw new Error('JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET');
  const { app, finish } = createBaseApp({ service: 'auth', env, logger, redis });
  app.use(cookieParser());
  const auth = authenticate(env);
  const adminOnly = requireAdmin(async (id) => User.findById(id).select('role isActive').lean());
  const csrf = (req, _res, next) => (req.headers['x-requested-with'] === 'findit' ? next() : next(forbidden('Missing CSRF header')));
  const ip = (req) => req.ip;

  const limit = (windowMin, max, prefix, keyGenerator, skipSuccessfulRequests) =>
    makeLimiter({ redis, windowMs: windowMin * 60_000, limit: max, prefix: `auth:${prefix}`, keyGenerator, skipSuccessfulRequests });
  const byEmail = (req) => `e:${String(req.body?.email ?? '').toLowerCase()}`;
  const byUser = (req) => `u:${req.user?.id}`;
  const loginIp = limit(15, 20, 'login-ip', undefined, true);
  const loginEmail = limit(15, 8, 'login-email', byEmail, true);
  const registerLimit = limit(60, 10, 'register');
  const forgotLimit = limit(60, 5, 'forgot');
  const forgotEmail = limit(60, 3, 'forgot-email', byEmail);
  const tokenLimit = limit(15, 20, 'token');
  const otpSendLimit = limit(60, 6, 'otp-send', byUser);
  const otpVerifyLimit = limit(15, 10, 'otp-verify', byUser);
  // Anything that asks for the current password is limited per user, so a stolen access token cannot brute-force it.
  const sensitiveLimit = limit(15, 8, 'sensitive', byUser);
  const emailChangeSendLimit = limit(60, 6, 'email-change-send', byUser);
  const avatarLimit = limit(60, 20, 'avatar', byUser);

  async function makeEmailToken(user, kind, ttlMs) {
    // Older unused tokens of the same kind stop working as soon as a new one is issued.
    await OneTimeToken.updateMany({ user: user._id, kind, usedAt: null }, { usedAt: new Date() });
    const raw = crypto.randomBytes(32).toString('hex');
    await OneTimeToken.create({ user: user._id, kind, hash: sha(raw), expiresAt: new Date(Date.now() + ttlMs) });
    await bus.publish('auth.email_token', { userId: String(user._id), email: user.email, name: user.name, kind, token: raw });
  }
  async function consumeToken(raw, kind) {
    const t = await OneTimeToken.findOneAndUpdate({ hash: sha(raw), kind, usedAt: null, expiresAt: trusted({ $gt: new Date() }) }, { usedAt: new Date() });
    return t;
  }

  /** Confirms the current password for sensitive actions. Throws 400 (not 401) so the client does not try a token refresh. */
  async function requirePassword(userId, password) {
    const u = await User.findOne({ _id: userId, isActive: true }).select('+passwordHash');
    if (!u) throw unauthorized();
    if (!(await verifyPassword(env, password, u.passwordHash))) throw badRequest('Password is incorrect', 'bad_password');
    return u;
  }

  const OTP_TTL_MS = 5 * 60_000;
  const OTP_COOLDOWN_MS = 60_000;
  const OTP_MAX_ATTEMPTS = 5;
  const otpHash = (userId, code) => crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`otp:verify:${userId}:${code}`).digest('hex');
  const changeHash = (userId, newEmail, code) => crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`otp:change:${userId}:${newEmail}:${code}`).digest('hex');
  const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'); // CSPRNG, zero-padded
  const retryAfterFrom = (sentAt, now) => Math.max(1, Math.ceil(((sentAt?.getTime() ?? now) + OTP_COOLDOWN_MS - now) / 1000));
  const cooldownReply = (res, retryAfter) =>
    res.status(429).set('Retry-After', String(retryAfter)).json({
      error: { code: 'otp_cooldown', message: `Please wait ${retryAfter}s before requesting another code` },
      retryAfter,
    });

  /** Returns { sent: true } or { sent: false, retryAfter } while inside the cooldown. */
  async function sendOtp(user) {
    const code = newCode();
    const now = Date.now();
    try {
      // Atomic cooldown: the filter only matches once the cooldown has passed; otherwise the upsert hits the
      // unique index on `user` (E11000) and we report the remaining wait. No race between two resend clicks.
      await EmailOtp.findOneAndUpdate(
        { user: user._id, sentAt: trusted({ $lte: new Date(now - OTP_COOLDOWN_MS) }) },
        { $set: { hash: otpHash(user._id, code), attempts: 0, sentAt: new Date(now), expiresAt: new Date(now + OTP_TTL_MS) } },
        { upsert: true },
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
      const cur = await EmailOtp.findOne({ user: user._id }).lean();
      return { sent: false, retryAfter: retryAfterFrom(cur?.sentAt, now) };
    }
    await bus.publish('auth.email_otp', { userId: String(user._id), email: user.email, name: user.name, code, ttlMinutes: 5 });
    return { sent: true };
  }

  /** Same idea for an email change: the code goes to the NEW address and is bound to it. */
  async function sendChangeOtp(user, newEmail) {
    const code = newCode();
    const now = Date.now();
    try {
      await EmailChange.findOneAndUpdate(
        { user: user._id, sentAt: trusted({ $lte: new Date(now - OTP_COOLDOWN_MS) }) },
        { $set: { newEmail, hash: changeHash(user._id, newEmail, code), attempts: 0, sentAt: new Date(now), expiresAt: new Date(now + OTP_TTL_MS) } },
        { upsert: true },
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
      const cur = await EmailChange.findOne({ user: user._id }).lean();
      return { sent: false, retryAfter: retryAfterFrom(cur?.sentAt, now) };
    }
    await bus.publish('auth.email_otp', { userId: String(user._id), email: newEmail, name: user.name, code, ttlMinutes: 5, purpose: 'email_change' });
    return { sent: true };
  }

  const sendSession = (res, s, user) => {
    res.cookie(COOKIE, s.refresh, cookieOpts(env));
    res.json({ accessToken: s.access, user: userView(user) });
  };

  app.post('/register', registerLimit, validate(registerSchema), async (req, res, next) => {
    try {
      const { name, email: em, password } = req.body;
      if (await User.exists({ email: em })) throw conflict('Email already registered', 'email_taken');
      // role/isActive are never read from the request: mass assignment is impossible by construction.
      const user = await User.create({ name, email: em, passwordHash: await hashPassword(env, password) });
      // A failed send must not fail the signup: the user can request a new code on the verify screen.
      try { await sendOtp(user); } catch (err) { logger.error('otp send failed', { err: err.message }); }
      await audit(bus, 'auth', { action: 'user.register', actor: user._id, targetType: 'user', targetId: user._id, ip: ip(req) });
      const full = await User.findById(user._id).select('+tokenVersion');
      res.status(201);
      sendSession(res, await issueSession(env, full), user);
    } catch (e) { next(e); }
  });

  app.post('/login', loginIp, loginEmail, validate(loginSchema), async (req, res, next) => {
    try {
      const user = await User.findOne({ email: req.body.email }).select('+passwordHash +tokenVersion +failedLogins +lockUntil');
      const locked = user?.lockUntil && user.lockUntil > new Date();
      const ok = await verifyPassword(env, req.body.password, user?.passwordHash);
      if (!user || !ok || locked || !user.isActive) {
        if (user && !ok && !locked) {
          const n = (user.failedLogins ?? 0) + 1;
          const upd = { failedLogins: n };
          if (n >= 5) upd.lockUntil = new Date(Date.now() + Math.min(60, 2 ** (n - 5)) * 60_000); // progressive back-off
          await User.updateOne({ _id: user._id }, upd);
        }
        throw unauthorized(GENERIC_LOGIN_ERROR);
      }
      if (user.failedLogins) await User.updateOne({ _id: user._id }, { failedLogins: 0, $unset: { lockUntil: 1 } });
      await audit(bus, 'auth', { action: 'user.login', actor: user._id, targetType: 'user', targetId: user._id, ip: ip(req) });
      sendSession(res, await issueSession(env, user), user);
    } catch (e) { next(e); }
  });

  app.post('/refresh', csrf, tokenLimit, async (req, res, next) => {
    try {
      const raw = req.cookies?.[COOKIE];
      if (!raw) throw unauthorized();
      const s = await rotate(env, raw);
      sendSession(res, s, s.user);
    } catch (e) {
      if (e.status === 401) res.clearCookie(COOKIE, { ...cookieOpts(env), maxAge: undefined });
      next(e);
    }
  });

  app.post('/logout', csrf, async (req, res, next) => {
    try {
      if (req.cookies?.[COOKIE]) await revokeFamilyFromToken(env, req.cookies[COOKIE]);
      res.clearCookie(COOKIE, { ...cookieOpts(env), maxAge: undefined });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  app.post('/logout-all', auth, csrf, async (req, res, next) => {
    try {
      await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
      await revokeAllForUser(req.user.id);
      res.clearCookie(COOKIE, { ...cookieOpts(env), maxAge: undefined });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  app.get('/me', auth, async (req, res, next) => {
    try {
      const u = await User.findById(req.user.id);
      if (!u || !u.isActive) throw unauthorized();
      res.json({ user: userView(u) });
    } catch (e) { next(e); }
  });

  // The id comes from the verified access token, never from the request: users can only edit themselves.
  // role, email, emailVerified and isActive are not in the schema (.strict()), so they cannot be set here.
  app.patch('/me', auth, validate(profileSchema), async (req, res, next) => {
    try {
      const u = await User.findOneAndUpdate({ _id: req.user.id, isActive: true }, { $set: req.body }, { new: true, runValidators: true });
      if (!u) throw unauthorized();
      await audit(bus, 'auth', { action: 'user.profile_update', actor: u._id, targetType: 'user', targetId: u._id, ip: ip(req), meta: { fields: Object.keys(req.body) } });
      res.json({ user: userView(u) });
    } catch (e) { next(e); }
  });

  // ---------- Profile picture ----------
  // The browser sends the raw image bytes (Content-Type: image/jpeg|png|webp), up to 5 MB. The server checks the real
  // file type from its magic bytes, strips metadata, crops to 256x256 WebP and stores it against the token's user id.
  app.post('/me/avatar', auth, avatarLimit,
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: AVATAR_MAX_BYTES }),
    async (req, res, next) => {
      try {
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw badRequest('Choose a JPEG, PNG or WebP image', 'bad_image');
        const data = await makeAvatar(req.body);
        await Avatar.findOneAndUpdate({ user: req.user.id }, { $set: { data, contentType: 'image/webp' } }, { upsert: true });
        const u = await User.findOneAndUpdate({ _id: req.user.id, isActive: true }, { $set: { avatarUrl: `/api/auth/avatar/${req.user.id}?v=${Date.now()}` } }, { new: true });
        if (!u) throw unauthorized();
        await audit(bus, 'auth', { action: 'user.avatar_update', actor: u._id, targetType: 'user', targetId: u._id, ip: ip(req) });
        res.json({ user: userView(u) });
      } catch (e) { next(e); }
    });

  app.delete('/me/avatar', auth, avatarLimit, async (req, res, next) => {
    try {
      await Avatar.deleteOne({ user: req.user.id });
      const u = await User.findOneAndUpdate({ _id: req.user.id, isActive: true }, { $set: { avatarUrl: '' } }, { new: true });
      if (!u) throw unauthorized();
      res.json({ user: userView(u) });
    } catch (e) { next(e); }
  });

  // Profile pictures are public by design (they are shown next to names). The ?v= in avatarUrl busts the cache on change.
  app.get('/avatar/:id', validate(z.object({ id: objectId }), 'params'), async (req, res, next) => {
    try {
      const a = await Avatar.findOne({ user: req.params.id });
      if (!a) throw notFound('No profile picture');
      res.set({
        'Content-Type': a.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="avatar.webp"',
      });
      res.send(a.data);
    } catch (e) { next(e); }
  });

  // ---------- Change email (current password + OTP sent to the NEW address) ----------
  app.post('/email/change/request', auth, sensitiveLimit, emailChangeSendLimit, validate(emailChangeSchema), async (req, res, next) => {
    try {
      const u = await requirePassword(req.user.id, req.body.password);
      const { newEmail } = req.body;
      if (newEmail === u.email) throw badRequest('That is already your email address', 'same_email');
      if (await User.exists({ email: newEmail })) throw conflict('That email address is already in use', 'email_taken');
      const r = await sendChangeOtp(u, newEmail);
      if (!r.sent) return cooldownReply(res, r.retryAfter);
      await audit(bus, 'auth', { action: 'user.email_change_requested', actor: u._id, targetType: 'user', targetId: u._id, ip: ip(req) });
      res.status(202).json({ ok: true, expiresIn: OTP_TTL_MS / 1000, resendIn: OTP_COOLDOWN_MS / 1000 });
    } catch (e) { next(e); }
  });

  app.post('/email/change/confirm', auth, otpVerifyLimit, validate(otpBody), async (req, res, next) => {
    try {
      // Count the attempt BEFORE comparing, atomically, so parallel guesses can't exceed the limit.
      const rec = await EmailChange.findOneAndUpdate(
        { user: req.user.id, expiresAt: trusted({ $gt: new Date() }), attempts: trusted({ $lt: OTP_MAX_ATTEMPTS }) },
        { $inc: { attempts: 1 } },
        { new: true },
      );
      if (!rec) throw badRequest('This code has expired or was tried too many times. Request a new one.');
      const given = Buffer.from(changeHash(req.user.id, rec.newEmail, req.body.code), 'hex');
      const stored = Buffer.from(rec.hash, 'hex');
      if (!crypto.timingSafeEqual(given, stored)) throw badRequest(`Incorrect code. ${OTP_MAX_ATTEMPTS - rec.attempts} attempt(s) left.`);
      const del = await EmailChange.deleteOne({ _id: rec._id, hash: rec.hash });
      if (!del.deletedCount) throw badRequest('This code was already used.');
      const before = await User.findById(req.user.id);
      if (!before || !before.isActive) throw unauthorized();
      let u;
      try {
        u = await User.findOneAndUpdate({ _id: req.user.id, isActive: true }, { $set: { email: rec.newEmail, emailVerified: true } }, { new: true });
      } catch (err) {
        if (err.code === 11000) throw conflict('That email address is already in use', 'email_taken');
        throw err;
      }
      await audit(bus, 'auth', { action: 'user.email_changed', actor: req.user.id, targetType: 'user', targetId: req.user.id, ip: ip(req) });
      // Tells the OLD address that the login email changed (security notice).
      await bus.publish('auth.email_changed', { userId: String(u._id), email: before.email, newEmail: u.email, name: u.name });
      res.json({ ok: true, user: userView(u) });
    } catch (e) { next(e); }
  });

  // ---------- Delete account (7-day grace period) ----------
  app.post('/me/delete', auth, sensitiveLimit, validate(passwordConfirm), async (req, res, next) => {
    try {
      const u = await requirePassword(req.user.id, req.body.password);
      if (u.role === 'admin') throw forbidden('Administrator accounts cannot be deleted here. Ask another administrator to change your role first.');
      const when = new Date(Date.now() + DELETE_GRACE_MS);
      // Only schedules once: a second request keeps the original deadline.
      const scheduled = await User.findOneAndUpdate({ _id: u._id, deletionScheduledFor: null }, { $set: { deletionRequestedAt: new Date(), deletionScheduledFor: when } }, { new: true });
      const cur = scheduled ?? (await User.findById(u._id));
      if (scheduled) {
        await audit(bus, 'auth', { action: 'user.deletion_requested', actor: u._id, targetType: 'user', targetId: u._id, ip: ip(req), meta: { scheduledFor: when } });
        await bus.publish('auth.deletion_scheduled', { userId: String(u._id), email: u.email, name: u.name, scheduledFor: when.toISOString() });
      }
      res.json({ user: userView(cur) });
    } catch (e) { next(e); }
  });

  app.post('/me/delete/cancel', auth, async (req, res, next) => {
    try {
      const u = await User.findOneAndUpdate(
        { _id: req.user.id, isActive: true, deletionScheduledFor: trusted({ $ne: null }) },
        { $unset: { deletionScheduledFor: 1, deletionRequestedAt: 1 } },
        { new: true },
      );
      if (u) {
        await audit(bus, 'auth', { action: 'user.deletion_cancelled', actor: u._id, targetType: 'user', targetId: u._id, ip: ip(req) });
        await bus.publish('auth.deletion_cancelled', { userId: String(u._id), email: u.email, name: u.name });
      }
      res.json({ user: userView(u ?? (await User.findById(req.user.id))) });
    } catch (e) { next(e); }
  });

  /** Permanently removes accounts whose 7 days are over. findOneAndDelete is atomic, so several instances never double-process. */
  async function purgeDueAccounts() {
    for (;;) {
      const u = await User.findOneAndDelete({ deletionScheduledFor: trusted({ $lte: new Date() }), role: 'user' });
      if (!u) break;
      const id = u._id;
      await revokeAllForUser(id);
      await Promise.all([OneTimeToken.deleteMany({ user: id }), EmailOtp.deleteMany({ user: id }), EmailChange.deleteMany({ user: id }), Avatar.deleteMany({ user: id })]);
      // user.deactivated is what other services already react to; user.deleted lets them purge the user's data.
      await bus.publish('user.deactivated', { userId: String(id) });
      await bus.publish('user.deleted', { userId: String(id) });
      await audit(bus, 'auth', { action: 'user.deleted', actor: null, targetType: 'user', targetId: id });
      logger.info('account purged', { userId: String(id) });
    }
  }
  if (env.NODE_ENV !== 'test') {
    const run = () => purgeDueAccounts().catch((err) => logger.error('account purge failed', { err: err.message }));
    setTimeout(run, 15_000).unref();
    setInterval(run, 15 * 60_000).unref();
  }

  // Legacy link verification: kept so previously emailed links still work.
  app.post('/email/verify', tokenLimit, validate(tokenBody), async (req, res, next) => {
    try {
      const t = await consumeToken(req.body.token, 'verify');
      if (!t) throw badRequest('Invalid or expired link');
      await User.updateOne({ _id: t.user }, { emailVerified: true });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post('/email/otp/send', auth, otpSendLimit, async (req, res, next) => {
    try {
      const u = await User.findById(req.user.id);
      if (!u || !u.isActive) throw unauthorized();
      if (u.emailVerified) return res.json({ ok: true, alreadyVerified: true });
      const r = await sendOtp(u);
      if (!r.sent) return cooldownReply(res, r.retryAfter);
      res.status(202).json({ ok: true, expiresIn: OTP_TTL_MS / 1000, resendIn: OTP_COOLDOWN_MS / 1000 });
    } catch (e) { next(e); }
  });

  app.post('/email/otp/verify', auth, otpVerifyLimit, validate(otpBody), async (req, res, next) => {
    try {
      // Count the attempt BEFORE comparing, atomically, so parallel guesses can't exceed the limit.
      const rec = await EmailOtp.findOneAndUpdate(
        { user: req.user.id, expiresAt: trusted({ $gt: new Date() }), attempts: trusted({ $lt: OTP_MAX_ATTEMPTS }) },
        { $inc: { attempts: 1 } },
        { new: true },
      );
      if (!rec) throw badRequest('This code has expired or was tried too many times. Request a new one.');
      const given = Buffer.from(otpHash(req.user.id, req.body.code), 'hex');
      const stored = Buffer.from(rec.hash, 'hex');
      if (!crypto.timingSafeEqual(given, stored)) throw badRequest(`Incorrect code. ${OTP_MAX_ATTEMPTS - rec.attempts} attempt(s) left.`);
      // Single use: only one request can delete the record, so a replayed code never verifies twice.
      const del = await EmailOtp.deleteOne({ _id: rec._id, hash: rec.hash });
      if (!del.deletedCount) throw badRequest('This code was already used.');
      const u = await User.findByIdAndUpdate(req.user.id, { emailVerified: true }, { new: true });
      await audit(bus, 'auth', { action: 'user.email_verified', actor: req.user.id, targetType: 'user', targetId: req.user.id, ip: ip(req) });
      res.json({ ok: true, user: userView(u) });
    } catch (e) { next(e); }
  });

  // Never reveals whether the email exists: always 202.
  app.post('/password/forgot', forgotLimit, forgotEmail, validate(forgotSchema), async (req, res, next) => {
    try {
      const u = await User.findOne({ email: req.body.email, isActive: true });
      if (u) await makeEmailToken(u, 'reset', 30 * 60_000);
      res.status(202).json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post('/password/reset', tokenLimit, validate(resetSchema), async (req, res, next) => {
    try {
      const t = await consumeToken(req.body.token, 'reset');
      if (!t) throw badRequest('Invalid or expired link');
      await User.updateOne({ _id: t.user }, { passwordHash: await hashPassword(env, req.body.password), $inc: { tokenVersion: 1 }, failedLogins: 0, $unset: { lockUntil: 1 } });
      await revokeAllForUser(t.user);
      await audit(bus, 'auth', { action: 'user.password_reset', actor: t.user, targetType: 'user', targetId: t.user, ip: ip(req) });
      const ru = await User.findById(t.user).select('email name');
      if (ru) await bus.publish('auth.password_changed', { userId: String(ru._id), email: ru.email, name: ru.name });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post('/password/change', auth, sensitiveLimit, validate(changeSchema), async (req, res, next) => {
    try {
      const u = await User.findById(req.user.id).select('+passwordHash');
      if (!u || !u.isActive) throw unauthorized();
      if (!(await verifyPassword(env, req.body.current, u.passwordHash))) throw badRequest('Current password is incorrect', 'bad_password');
      u.passwordHash = await hashPassword(env, req.body.password);
      await u.save();
      await User.updateOne({ _id: u._id }, { $inc: { tokenVersion: 1 } });
      await revokeAllForUser(u._id);
      await audit(bus, 'auth', { action: 'user.password_changed', actor: u._id, targetType: 'user', targetId: u._id, ip: ip(req) });
      await bus.publish('auth.password_changed', { userId: String(u._id), email: u.email, name: u.name });
      res.clearCookie(COOKIE, { ...cookieOpts(env), maxAge: undefined });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // ---------- Admin (authenticate -> admin role read from DB) ----------
  const admin = express.Router();
  admin.use(auth, adminOnly);
  admin.get('/users', async (req, res, next) => {
    try {
      const q = adminList.parse(req.query);
      // eslint-disable-next-line security/detect-non-literal-regexp -- user input is passed through escapeRegex()
      const filter = q.q ? { $or: [{ name: new RegExp(escapeRegex(q.q), 'i') }, { email: new RegExp(escapeRegex(q.q), 'i') }] } : {};
      if (q.verified) filter.emailVerified = q.verified === 'true';
      const [items, total] = await Promise.all([
        User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
        User.countDocuments(filter),
      ]);
      res.json({ items: items.map(userView), total, page: q.page, limit: q.limit });
    } catch (e) { next(e); }
  });
  admin.patch('/users/:id', validate(z.object({ id: objectId }), 'params'), validate(adminPatch), async (req, res, next) => {
    try {
      if (req.params.id === req.user.id) throw forbidden('Admins cannot modify their own account here');
      const upd = await User.updateOne({ _id: req.params.id }, { $set: req.body });
      if (!upd.matchedCount) throw notFound('User not found');
      const u = await User.findById(req.params.id);
      if (req.body.isActive === false) { await User.updateOne({ _id: u._id }, { $inc: { tokenVersion: 1 } }); await revokeAllForUser(u._id); await bus.publish('user.deactivated', { userId: String(u._id) }); }
      await audit(bus, 'auth', { action: 'admin.user_update', actor: req.user.id, targetType: 'user', targetId: u._id, ip: ip(req), meta: req.body });
      res.json({ user: userView(u) });
    } catch (e) { next(e); }
  });
  admin.get('/stats', async (_req, res, next) => {
    try {
      const week = new Date(Date.now() - 7 * 86400_000);
      const [total, active, admins, recent, verified, pendingDeletion] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ role: 'admin' }),
        User.countDocuments({ createdAt: trusted({ $gte: week }) }),
        User.countDocuments({ emailVerified: true }),
        User.countDocuments({ deletionScheduledFor: trusted({ $ne: null }) }),
      ]);
      res.json({ users: total, activeUsers: active, admins, newLast7Days: recent, verified, unverified: total - verified, pendingDeletion });
    } catch (e) { next(e); }
  });
  app.use('/admin', admin);

  // ---------- Internal (service token; never routed by the gateway) ----------
  app.get('/internal/users/:id', internalOnly(env), validate(z.object({ id: objectId }), 'params'), async (req, res, next) => {
    try {
      const u = await User.findById(req.params.id);
      if (!u) throw notFound();
      res.json({ id: String(u._id), name: u.name, email: u.email, role: u.role, isActive: u.isActive, emailVerified: u.emailVerified });
    } catch (e) { next(e); }
  });

  // Used by the gateway's auth_request for every /admin/* route: JWT valid AND role=admin read from the database.
  app.get('/internal/gateway-verify', internalOnly(env), auth, adminOnly, (_req, res) => res.status(204).end());

  return finish();
}