import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { loadEnv, secret } from '@findit/shared/env';
import { z } from 'zod';
import { createLogger } from '@findit/shared/logger';
import { createMemoryBus } from '@findit/shared/events';
import { mongoose, connectMongo } from '@findit/shared/db';
import { createAuthApp } from '../src/app.js';
import { User } from '../src/models.js';
import { hashPassword } from '../src/passwords.js';

const env = loadEnv({ MONGO_URL: z.string().default('mongodb://127.0.0.1:27017/findit_test_auth'), JWT_REFRESH_SECRET: secret, BCRYPT_COST: z.coerce.number().default(4) });
const logger = createLogger('t', process.env.TEST_LOG ?? 'silent');
let app; let bus;
const H = { 'X-Requested-With': 'findit' };
const good = { name: 'Tester One', email: 'one@example.com', password: 'Tr1cky-Horse-Battery' };

beforeAll(async () => { await connectMongo(env.MONGO_URL, logger, { autoIndex: true }); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
  bus = createMemoryBus();
  app = createAuthApp({ env, logger, bus });
});

const register = (b = good) => request(app).post('/register').send(b);

describe('registration + login', () => {
  it('registers, hashes the password with bcrypt, never returns hash, always role user', async () => {
    const r = await register({ ...good, role: 'admin' }); // unknown field must be rejected (strict)
    expect(r.status).toBe(400);
    const ok = await register();
    expect(ok.status).toBe(201);
    expect(ok.body.user.role).toBe('user');
    expect(JSON.stringify(ok.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    const u = await User.findOne({ email: good.email }).select('+passwordHash');
    expect(u.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(ok.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(ok.headers['set-cookie'][0]).toMatch(/SameSite=Strict/i);
    expect(bus.published.some((e) => e.type === 'auth.email_token')).toBe(true);
  });
  it('rejects weak and common passwords', async () => {
    expect((await register({ ...good, password: 'short' })).status).toBe(400);
    expect((await register({ ...good, password: 'password123' })).status).toBe(400);
  });
  it('rejects NoSQL operator payloads in login', async () => {
    await register();
    const r = await request(app).post('/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(r.status).toBe(400);
  });
  it('gives one generic error for wrong email or wrong password', async () => {
    await register();
    const a = await request(app).post('/login').send({ email: good.email, password: 'Wrong-Password-1' });
    const b = await request(app).post('/login').send({ email: 'nobody@example.com', password: 'Wrong-Password-1' });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
  it('locks the account after repeated failures (even with the right password)', async () => {
    await register();
    for (let i = 0; i < 5; i++) await request(app).post('/login').send({ email: good.email, password: 'Wrong-Password-1' });
    const r = await request(app).post('/login').send({ email: good.email, password: good.password });
    expect(r.status).toBe(401);
  });
  it('logs in, calls /me, and rejects missing/tampered/none/expired tokens', async () => {
    await register();
    const l = await request(app).post('/login').send({ email: good.email, password: good.password });
    expect(l.status).toBe(200);
    const me = await request(app).get('/me').set('Authorization', `Bearer ${l.body.accessToken}`);
    expect(me.status).toBe(200);
    expect((await request(app).get('/me')).status).toBe(401);
    expect((await request(app).get('/me').set('Authorization', `Bearer ${l.body.accessToken}x`)).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: l.body.user.id, role: 'admin' })).toString('base64url')}.`;
    expect((await request(app).get('/me').set('Authorization', `Bearer ${none}`)).status).toBe(401);
    const expired = jwt.sign({ role: 'user' }, env.JWT_ACCESS_SECRET, { subject: l.body.user.id, expiresIn: -10, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
    expect((await request(app).get('/me').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
    const wrongAud = jwt.sign({ role: 'user' }, env.JWT_ACCESS_SECRET, { subject: l.body.user.id, expiresIn: 60, issuer: env.JWT_ISSUER, audience: 'other' });
    expect((await request(app).get('/me').set('Authorization', `Bearer ${wrongAud}`)).status).toBe(401);
  });
});

describe('refresh rotation', () => {
  it('rotates, detects reuse and revokes the family, requires CSRF header', async () => {
    const reg = await register();
    const c1 = reg.headers['set-cookie'][0].split(';')[0];
    expect((await request(app).post('/refresh').set('Cookie', c1)).status).toBe(403); // no CSRF header
    const r1 = await request(app).post('/refresh').set(H).set('Cookie', c1);
    expect(r1.status).toBe(200);
    const c2 = r1.headers['set-cookie'][0].split(';')[0];
    expect(c2).not.toBe(c1);
    // replay the old (rotated) token => reuse detected
    expect((await request(app).post('/refresh').set(H).set('Cookie', c1)).status).toBe(401);
    // family revoked => the newer token is dead too
    expect((await request(app).post('/refresh').set(H).set('Cookie', c2)).status).toBe(401);
  });
  it('logout revokes the session', async () => {
    const reg = await register();
    const c1 = reg.headers['set-cookie'][0].split(';')[0];
    expect((await request(app).post('/logout').set(H).set('Cookie', c1)).status).toBe(204);
    expect((await request(app).post('/refresh').set(H).set('Cookie', c1)).status).toBe(401);
  });
});

describe('password reset', () => {
  it('never reveals whether the email exists; token is single-use and revokes sessions', async () => {
    const reg = await register();
    const c1 = reg.headers['set-cookie'][0].split(';')[0];
    const a = await request(app).post('/password/forgot').send({ email: good.email });
    const b = await request(app).post('/password/forgot').send({ email: 'ghost@example.com' });
    expect(a.status).toBe(202); expect(b.status).toBe(202);
    const evt = [...bus.published].reverse().find((e) => e.type === 'auth.email_token' && e.payload.kind === 'reset');
    const np = 'Brand-New-Passphrase-77';
    expect((await request(app).post('/password/reset').send({ token: evt.payload.token, password: np })).status).toBe(200);
    expect((await request(app).post('/password/reset').send({ token: evt.payload.token, password: np })).status).toBe(400);
    expect((await request(app).post('/refresh').set(H).set('Cookie', c1)).status).toBe(401);
    expect((await request(app).post('/login').send({ email: good.email, password: np })).status).toBe(200);
  });
});

describe('admin authorization', () => {
  it('denies anonymous and normal users; allows DB-verified admin; cannot self-modify; role read from DB', async () => {
    const u = await register();
    expect((await request(app).get('/admin/users')).status).toBe(401);
    expect((await request(app).get('/admin/users').set('Authorization', `Bearer ${u.body.accessToken}`)).status).toBe(403);
    // forged token claiming admin role is still denied because the role is read from the database
    const forged = jwt.sign({ role: 'admin', name: 'x' }, env.JWT_ACCESS_SECRET, { subject: u.body.user.id, expiresIn: 60, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
    expect((await request(app).get('/admin/users').set('Authorization', `Bearer ${forged}`)).status).toBe(403);

    await User.create({ name: 'Admin', email: 'admin@example.com', passwordHash: await hashPassword(env, 'x'.repeat(14)), role: 'admin' });
    const al = await request(app).post('/login').send({ email: 'admin@example.com', password: 'x'.repeat(14) });
    const auth = { Authorization: `Bearer ${al.body.accessToken}` };
    const list = await request(app).get('/admin/users').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(2);
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash/);
    const patch = await request(app).patch(`/admin/users/${u.body.user.id}`).set(auth).send({ isActive: false });
    expect(patch.status).toBe(200);
    expect(bus.published.some((e) => e.type === 'user.deactivated')).toBe(true);
    expect((await request(app).post('/login').send({ email: good.email, password: good.password })).status).toBe(401);
    expect((await request(app).patch(`/admin/users/${al.body.user.id}`).set(auth).send({ role: 'user' })).status).toBe(403);
  });
});

describe('internal + headers + cors', () => {
  it('internal endpoint requires the service token', async () => {
    const u = await register();
    expect((await request(app).get(`/internal/users/${u.body.user.id}`)).status).toBe(403);
    const ok = await request(app).get(`/internal/users/${u.body.user.id}`).set('x-internal-token', env.INTERNAL_SERVICE_TOKEN);
    expect(ok.status).toBe(200);
  });
  it('gateway-verify: needs service token + valid admin JWT (role from DB)', async () => {
    const u = await register();
    const T = { 'x-internal-token': env.INTERNAL_SERVICE_TOKEN };
    expect((await request(app).get('/internal/gateway-verify').set({ Authorization: `Bearer ${u.body.accessToken}` })).status).toBe(403);
    expect((await request(app).get('/internal/gateway-verify').set(T)).status).toBe(401);
    expect((await request(app).get('/internal/gateway-verify').set(T).set({ Authorization: `Bearer ${u.body.accessToken}` })).status).toBe(403);
    await User.updateOne({ _id: u.body.user.id }, { role: 'admin' });
    expect((await request(app).get('/internal/gateway-verify').set(T).set({ Authorization: `Bearer ${u.body.accessToken}` })).status).toBe(204);
  });
  it('sets security headers, hides X-Powered-By, rejects untrusted origins, no stack traces', async () => {
    const r = await request(app).get('/health');
    for (const h of ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cache-control']) expect(r.headers[h]).toBeTruthy();
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    const bad = await request(app).post('/login').set('Origin', 'https://evil.test').send({ email: good.email, password: 'x' });
    expect(bad.status).toBe(403);
    const preflight = await request(app).options('/login').set('Origin', 'https://evil.test').set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    const nf = await request(app).get('/nope');
    expect(nf.status).toBe(404);
    expect(JSON.stringify(nf.body)).not.toMatch(/at .*\.js/);
    const big = await request(app).post('/login').send({ email: 'a@b.co', password: 'x'.repeat(20000) });
    expect(big.status).toBe(413);
  });
});

describe('account lifecycle', () => {
  it('verifies email once; resend works only while unverified', async () => {
    const reg = await register();
    const evt = bus.published.find((e) => e.type === 'auth.email_token' && e.payload.kind === 'verify');
    expect((await request(app).post('/email/verify').send({ token: 'z'.repeat(64) })).status).toBe(400);
    expect((await request(app).post('/email/verify').send({ token: 'nothex' })).status).toBe(400);
    expect((await request(app).post('/email/verify').send({ token: evt.payload.token })).status).toBe(200);
    expect((await request(app).post('/email/verify').send({ token: evt.payload.token })).status).toBe(400); // single use
    expect((await request(app).get('/me').set('Authorization', `Bearer ${reg.body.accessToken}`)).body.user.emailVerified).toBe(true);
    const before = bus.published.length;
    expect((await request(app).post('/email/resend').set('Authorization', `Bearer ${reg.body.accessToken}`)).status).toBe(202);
    expect(bus.published.length).toBe(before); // verified users get no new mail
  });
  it('password change needs the current password and revokes every session', async () => {
    const reg = await register();
    const c1 = reg.headers['set-cookie'][0].split(';')[0];
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    expect((await request(app).post('/password/change').set(auth).send({ current: 'Wrong-Password-1', password: 'Another-Long-Passphrase-1' })).status).toBe(401);
    expect((await request(app).post('/password/change').set(auth).send({ current: good.password, password: 'Another-Long-Passphrase-1' })).status).toBe(204);
    expect((await request(app).post('/refresh').set(H).set('Cookie', c1)).status).toBe(401);
    expect((await request(app).post('/login').send({ email: good.email, password: 'Another-Long-Passphrase-1' })).status).toBe(200);
  });
  it('logout-all invalidates all refresh tokens; /me rejects deactivated users', async () => {
    const reg = await register();
    const c1 = reg.headers['set-cookie'][0].split(';')[0];
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    expect((await request(app).post('/logout-all').set(auth)).status).toBe(403); // CSRF header required
    expect((await request(app).post('/logout-all').set(auth).set(H)).status).toBe(204);
    expect((await request(app).post('/refresh').set(H).set('Cookie', c1)).status).toBe(401);
    await User.updateOne({ email: good.email }, { isActive: false });
    expect((await request(app).get('/me').set(auth)).status).toBe(401);
  });
  it('admin can search users and read stats; unknown ids 404; bad ids 400', async () => {
    await register();
    await User.create({ name: 'Admin', email: 'admin2@example.com', passwordHash: await hashPassword(env, 'x'.repeat(14)), role: 'admin' });
    const al = await request(app).post('/login').send({ email: 'admin2@example.com', password: 'x'.repeat(14) });
    const a = { Authorization: `Bearer ${al.body.accessToken}` };
    expect((await request(app).get('/admin/users?q=one@').set(a)).body.total).toBe(1);
    expect((await request(app).get('/admin/users?q=.*').set(a)).body.total).toBe(0); // regex metacharacters are escaped
    const st = await request(app).get('/admin/stats').set(a);
    expect(st.body).toMatchObject({ users: 2, admins: 1 });
    expect((await request(app).patch('/admin/users/64b0000000000000000000aa').set(a).send({ isActive: false })).status).toBe(404);
    expect((await request(app).patch('/admin/users/zzz').set(a).send({ isActive: false })).status).toBe(400);
    expect((await request(app).patch(`/admin/users/${al.body.user.id}`).set(a).send({})).status).toBe(400);
  });
});
