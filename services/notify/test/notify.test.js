import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { loadEnv } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { createMemoryBus } from '@findit/shared/events';
import { mongoose, connectMongo } from '@findit/shared/db';
import { signAccess } from '@findit/shared/tokens';
import { createNotifyApp } from '../src/app.js';
import { renderEmail } from '../src/mailer.js';
import { Notification } from '../src/models.js';

const env = loadEnv({ MONGO_URL: z.string().default('mongodb://127.0.0.1:27017/findit_test_notify'), APP_URL: z.string().default('https://findit.test') });
const logger = createLogger('t', 'silent');
const A = '64b000000000000000000001'; const B = '64b000000000000000000002';
const H = (id) => ({ Authorization: `Bearer ${signAccess(env, { sub: id, role: 'user', name: 'N' })}` });
let app; let bus; let mails; let onlineSet;

beforeAll(async () => { await connectMongo(env.MONGO_URL, logger, { autoIndex: true }); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  mails = []; onlineSet = new Set(); bus = createMemoryBus();
  app = createNotifyApp({ env, logger, bus, mailer: { send: async (m) => { mails.push(m); } }, isOnline: async (id) => onlineSet.has(id), getContact: async (id) => ({ email: `${id}@example.com` }) });
  await app.locals.wire();
});
const match = { matchId: 'm1', lostItemId: 'l1', foundItemId: 'f1', score: 82.4, lostOwner: A, foundOwner: B, lostTitle: 'Black wallet', foundTitle: 'Wallet found' };

describe('event -> notification -> push -> email', () => {
  it('match.created notifies both owners live and emails offline users', async () => {
    await bus.publish('match.created', match);
    expect(await Notification.countDocuments({})).toBe(2);
    const pushes = bus.published.filter((e) => e.type === 'notification.push');
    expect(pushes.map((p) => p.payload.user).sort()).toEqual([A, B]);
    expect(mails.map((m) => m.to).sort()).toEqual([`${A}@example.com`, `${B}@example.com`]);
  });
  it('does not email online users unless they opted in; still stores + pushes in-app', async () => {
    onlineSet.add(A);
    await bus.publish('match.created', match);
    expect(mails.map((m) => m.to)).toEqual([`${B}@example.com`]);
    expect(await Notification.countDocuments({ user: A })).toBe(1);
    await request(app).put('/preferences').set(H(A)).send({ emailWhenOnline: true });
    mails.length = 0;
    await bus.publish('claim.approved', { claimId: 'c1', itemId: 'f1', itemTitle: 'Wallet', finderName: 'Bob', claimant: A, finder: B });
    expect(mails.map((m) => m.to)).toEqual([`${A}@example.com`]);
  });
  it('per-user preferences switch off in-app and email independently', async () => {
    const r = await request(app).put('/preferences').set(H(A)).send({ inApp: { match: false }, email: { match: false } });
    expect(r.body.preferences.inApp.match).toBe(false);
    await bus.publish('match.created', match);
    expect(await Notification.countDocuments({ user: A })).toBe(0);
    expect(mails.some((m) => m.to.startsWith(A))).toBe(false);
    expect(await Notification.countDocuments({ user: B })).toBe(1);
  });
  it('message.created only notifies offline recipients and never includes message text', async () => {
    onlineSet.add(B);
    await bus.publish('message.created', { conversationId: 'c1', sender: A, senderName: 'Alice', recipient: B });
    expect(await Notification.countDocuments({})).toBe(0);
    onlineSet.delete(B);
    await bus.publish('message.created', { conversationId: 'c1', sender: A, senderName: 'Alice', recipient: B });
    expect(await Notification.countDocuments({})).toBe(1);
    expect(mails).toHaveLength(1);
  });
  it('claim.returned notifies the other party; claim.created notifies the finder', async () => {
    await bus.publish('claim.returned', { claimId: 'c1', itemId: 'f1', itemTitle: 'W', actor: A, finder: A, claimant: B });
    expect((await Notification.find({})).map((n) => n.user)).toEqual([B]);
    await bus.publish('claim.created', { claimId: 'c2', itemId: 'f1', itemTitle: 'W', claimant: B, claimantName: 'Bob', finder: A });
    expect(await Notification.countDocuments({ user: A })).toBe(1);
  });
  it('auth email tokens produce verify/reset mails with escaped content', async () => {
    await bus.publish('auth.email_token', { email: 'x@example.com', name: '<b>Eve</b>', kind: 'reset', token: 'a'.repeat(64) });
    expect(mails[0].html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
    expect(mails[0].html).not.toContain('<b>Eve</b>');
    expect(mails[0].html).toContain(`https://findit.test/reset-password?token=${'a'.repeat(64)}`);
    expect(renderEmail({ heading: '<img onerror=1>', lines: ['"><script>'] }).html).not.toMatch(/<img|<script/);
  });
});

describe('REST + authorization', () => {
  beforeEach(async () => { await bus.publish('match.created', match); });
  it('lists only my notifications, unread counter, paginates', async () => {
    expect((await request(app).get('/notifications')).status).toBe(401);
    const r = await request(app).get('/notifications?limit=1').set(H(A));
    expect(r.body.items).toHaveLength(1); expect(r.body.unread).toBe(1);
    expect(r.body.items[0].payload.matchId).toBe('m1');
    expect((await request(app).get('/notifications?limit=500').set(H(A))).status).toBe(400);
    expect((await request(app).get('/notifications/unread-count').set(H(B))).body.unread).toBe(1);
  });
  it("cannot mark or delete another user's notifications (IDOR)", async () => {
    const mine = (await request(app).get('/notifications').set(H(A))).body.items[0].id;
    expect((await request(app).post('/notifications/read').set(H(B)).send({ ids: [mine] })).body.updated).toBe(0);
    expect((await request(app).delete(`/notifications/${mine}`).set(H(B))).status).toBe(404);
    expect((await request(app).post('/notifications/read').set(H(A)).send({ ids: [mine] })).body.updated).toBe(1);
    expect((await request(app).get('/notifications/unread-count').set(H(A))).body.unread).toBe(0);
    expect((await request(app).post('/notifications/read').set(H(A)).send({ all: 1 })).status).toBe(400);
    expect((await request(app).post('/notifications/read').set(H(A)).send({ ids: [{ $ne: null }] })).status).toBe(400);
  });
  it('rejects unknown preference fields', async () => {
    expect((await request(app).put('/preferences').set(H(A)).send({ role: 'admin' })).status).toBe(400);
    expect((await request(app).put('/preferences').set(H(A)).send({})).status).toBe(400);
    expect((await request(app).get('/preferences').set(H(A))).body.preferences.email.match).toBe(true);
  });
});
