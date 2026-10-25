import http from 'node:http';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { io as client } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadEnv } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { createMemoryBus } from '@findit/shared/events';
import { mongoose, connectMongo } from '@findit/shared/db';
import { signAccess } from '@findit/shared/tokens';
import { createRealtimeApp } from '../src/app.js';
import { attachSocket } from '../src/socket.js';
import { createPresence } from '../src/presence.js';
import { iceServers } from '../src/ice.js';
import { Message } from '../src/models.js';

const env = loadEnv({
  MONGO_URL: z.string().default('mongodb://127.0.0.1:27017/findit_test_rt'),
  STUN_URLS: z.string().default('stun:stun.example.org:3478').transform((v) => v.split(',')),
  TURN_URLS: z.string().default('turn:turn.example.org:3478').transform((v) => v.split(',')),
  TURN_SECRET: z.string().default('turn-shared-secret-1234567890'), TURN_TTL_SECONDS: z.coerce.number().default(3600),
});
const logger = createLogger('t', 'silent');
const A = '64b000000000000000000001'; const B = '64b000000000000000000002'; const C = '64b000000000000000000003';
const tok = (id, name) => signAccess(env, { sub: id, role: 'user', name });
const H = (id, name) => ({ Authorization: `Bearer ${tok(id, name)}` });
let server; let io; let app; let bus; let url; let conv; const open = [];

const connect = (token, opts = {}) => new Promise((resolve, reject) => {
  const s = client(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true, ...opts });
  open.push(s);
  s.on('connect', () => resolve(s));
  s.on('connect_error', (e) => { s.close(); reject(e); });
});
const emit = (s, ev, payload) => new Promise((resolve) => s.emit(ev, payload, resolve));
const once = (s, ev, ms = 2000) => new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error(`timeout waiting for ${ev}`)), ms); s.once(ev, (d) => { clearTimeout(t); resolve(d); }); });
const cid = () => crypto.randomUUID();

beforeAll(async () => {
  await connectMongo(env.MONGO_URL, logger, { autoIndex: true });
});
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
  bus = createMemoryBus();
  app = createRealtimeApp({ env, logger, bus, getIo: () => io });
  server = http.createServer(app);
  io = attachSocket({ httpServer: server, env, logger, bus, presence: createPresence(null), allowedOrigins: env.CORS_ORIGINS });
  await app.locals.wire();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
  await bus.publish('claim.approved', { claimId: 'x', itemId: '64c000000000000000000001', itemTitle: 'Wallet', finder: A, finderName: 'Alice F', claimant: B, claimantName: 'Bob C' });
  conv = (await request(app).get('/conversations').set(H(A, 'Alice F'))).body.conversations[0].id;
});
afterEach(async () => { open.splice(0).forEach((s) => s.close()); io.close(); await new Promise((r) => server.close(r)); });

describe('socket authentication', () => {
  it('rejects missing, invalid, expired and wrong-audience tokens', async () => {
    await expect(connect(undefined)).rejects.toThrow(/unauthorized/);
    await expect(connect('garbage')).rejects.toThrow(/unauthorized/);
    const expired = jwt.sign({ role: 'user', name: 'x' }, env.JWT_ACCESS_SECRET, { subject: A, expiresIn: -5, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
    await expect(connect(expired)).rejects.toThrow(/unauthorized/);
    const aud = jwt.sign({ role: 'user', name: 'x' }, env.JWT_ACCESS_SECRET, { subject: A, expiresIn: 60, issuer: env.JWT_ISSUER, audience: 'other' });
    await expect(connect(aud)).rejects.toThrow(/unauthorized/);
    await expect(connect(tok(A, 'Alice'))).resolves.toBeTruthy();
  });
  it('rejects cross-site origins and caps connections per user', async () => {
    await expect(connect(tok(A, 'Alice'), { extraHeaders: { origin: 'https://evil.test' } })).rejects.toBeTruthy();
    for (let i = 0; i < 5; i++) await connect(tok(A, 'Alice'));
    await expect(connect(tok(A, 'Alice'))).rejects.toThrow(/too_many_connections/);
  });
});

describe('chat', () => {
  it('delivers a message to the other user instantly, acks the sender, tracks delivered/read, persists history', async () => {
    const a = await connect(tok(A, 'Alice F')); const b = await connect(tok(B, 'Bob C'));
    const got = once(b, 'message:new');
    const started = Date.now();
    const ack = await emit(a, 'message:send', { conversationId: conv, text: 'Hello, is this my wallet?', clientId: cid() });
    expect(ack.ok).toBe(true);
    const m = await got;
    expect(Date.now() - started).toBeLessThan(1000);
    expect(m.text).toBe('Hello, is this my wallet?');
    expect(m.deliveredAt).toBeTruthy(); // recipient was online
    const read = once(a, 'message:read');
    expect((await emit(b, 'message:read', { conversationId: conv })).ok).toBe(true);
    expect((await read).conversationId).toBe(conv);
    const hist = await request(app).get(`/conversations/${conv}/messages`).set(H(B, 'Bob C'));
    expect(hist.body.messages).toHaveLength(1);
    expect(hist.body.messages[0].readAt).toBeTruthy();
    expect(bus.published.some((e) => e.type === 'message.created' && e.payload.recipient === B)).toBe(true);
    expect(JSON.stringify(bus.published.filter((e) => e.type === 'message.created'))).not.toMatch(/wallet/); // no message body on the bus
  });
  it('is idempotent on clientId (no duplicates after a retry) and sanitises text', async () => {
    const a = await connect(tok(A, 'Alice F'));
    const id = cid();
    const r1 = await emit(a, 'message:send', { conversationId: conv, text: '<script>alert(1)</script>hi', clientId: id });
    const r2 = await emit(a, 'message:send', { conversationId: conv, text: '<script>alert(1)</script>hi', clientId: id });
    expect(r2.duplicate).toBe(true);
    expect(r1.message.id).toBe(r2.message.id);
    expect(r1.message.text).not.toMatch(/[<>]/);
    expect(await Message.countDocuments({})).toBe(1);
  });
  it('enforces membership: outsiders cannot send, type, read, or fetch history', async () => {
    const c = await connect(tok(C, 'Mallory'));
    expect((await emit(c, 'message:send', { conversationId: conv, text: 'hi', clientId: cid() })).error).toBe('forbidden');
    expect((await emit(c, 'typing', { conversationId: conv, typing: true })).error).toBe('forbidden');
    expect((await emit(c, 'message:read', { conversationId: conv })).error).toBe('forbidden');
    expect((await request(app).get(`/conversations/${conv}/messages`).set(H(C, 'Mallory'))).status).toBe(404);
    expect((await request(app).post(`/conversations/${conv}/read`).set(H(C, 'Mallory'))).status).toBe(404);
    expect((await request(app).get('/conversations').set(H(C, 'Mallory'))).body.conversations).toHaveLength(0);
    expect((await request(app).get(`/conversations/${conv}/messages`)).status).toBe(401);
  });
  it('validates payloads (length, shape, unknown fields) and rate-limits per user', async () => {
    const a = await connect(tok(A, 'Alice F'));
    expect((await emit(a, 'message:send', { conversationId: conv, text: 'x'.repeat(4001), clientId: cid() })).error).toBe('invalid');
    expect((await emit(a, 'message:send', { conversationId: { $ne: null }, text: 'hi', clientId: cid() })).error).toBe('invalid');
    expect((await emit(a, 'message:send', { conversationId: conv, text: 'hi', clientId: cid(), sender: B })).error).toBe('invalid');
    expect((await emit(a, 'message:send', { conversationId: conv, text: '   ', clientId: cid() })).error).toBeTruthy();
    let limited = 0;
    for (let i = 0; i < 25; i++) if ((await emit(a, 'message:send', { conversationId: conv, text: `m${i}`, clientId: cid() })).error === 'rate_limited') limited++;
    expect(limited).toBeGreaterThan(0);
  });
  it('typing indicator reaches the peer; reconnect catch-up returns only newer messages with no duplicates', async () => {
    const a = await connect(tok(A, 'Alice F')); const b = await connect(tok(B, 'Bob C'));
    const t = once(b, 'typing');
    await emit(a, 'typing', { conversationId: conv, typing: true });
    expect((await t).typing).toBe(true);
    const first = (await emit(a, 'message:send', { conversationId: conv, text: 'one', clientId: cid() })).message;
    b.close(); // network drop
    await emit(a, 'message:send', { conversationId: conv, text: 'two', clientId: cid() });
    await emit(a, 'message:send', { conversationId: conv, text: 'three', clientId: cid() });
    const b2 = await connect(tok(B, 'Bob C'));
    expect(b2.connected).toBe(true);
    const catchup = await request(app).get(`/conversations/${conv}/messages?after=${first.id}`).set(H(B, 'Bob C'));
    expect(catchup.body.messages.map((m) => m.text)).toEqual(['two', 'three']);
    const unread = await request(app).get('/unread-count').set(H(B, 'Bob C'));
    expect(unread.body.unread).toBe(3);
    const list = await request(app).get('/conversations').set(H(B, 'Bob C'));
    expect(list.body.conversations[0].unread).toBe(3);
    expect(list.body.conversations[0].other.name).toBe('Alice F');
  });
  it('marks offline messages delivered when the recipient connects', async () => {
    const a = await connect(tok(A, 'Alice F'));
    const sent = (await emit(a, 'message:send', { conversationId: conv, text: 'offline msg', clientId: cid() })).message;
    expect(sent.deliveredAt).toBeNull();
    const delivered = once(a, 'message:delivered');
    await connect(tok(B, 'Bob C'));
    expect((await delivered).conversationId).toBe(conv);
  });
  it('pushes notification.push events and disconnects deactivated users', async () => {
    const a = await connect(tok(A, 'Alice F'));
    const n = once(a, 'notification:new');
    await bus.publish('notification.push', { user: A, notification: { id: 'n1', type: 'match' } });
    expect((await n).id).toBe('n1');
    const closed = once(a, 'disconnect');
    await bus.publish('user.deactivated', { userId: A });
    expect(await closed).toBeTruthy();
  });
});

describe('calls (WebRTC signalling)', () => {
  it('ring -> accept -> offer/answer/ice relay -> end; only the two participants may signal', async () => {
    const a = await connect(tok(A, 'Alice F')); const b = await connect(tok(B, 'Bob C')); const c = await connect(tok(C, 'Mallory'));
    const incoming = once(b, 'call:incoming');
    const inv = await emit(a, 'call:invite', { conversationId: conv, callType: 'video' });
    expect(inv.ok).toBe(true);
    const inc = await incoming;
    expect(inc).toMatchObject({ callId: inv.callId, callType: 'video', from: { id: A, name: 'Alice F' } });
    expect((await emit(a, 'call:invite', { conversationId: conv })).error).toBe('busy');
    expect((await emit(c, 'call:offer', { callId: inv.callId, data: { sdp: 'x' } })).error).toBe('forbidden');
    expect((await emit(c, 'call:end', { callId: inv.callId })).error).toBe('forbidden');
    expect((await emit(a, 'call:accept', { callId: inv.callId })).error).toBe('forbidden'); // caller cannot accept
    const accepted = once(a, 'call:accepted');
    expect((await emit(b, 'call:accept', { callId: inv.callId })).ok).toBe(true);
    await accepted;
    const offer = once(b, 'call:offer');
    await emit(a, 'call:offer', { callId: inv.callId, data: { type: 'offer', sdp: 'v=0...' } });
    expect((await offer).data.type).toBe('offer');
    const ice = once(a, 'call:ice');
    await emit(b, 'call:ice', { callId: inv.callId, data: { candidate: 'cand' } });
    expect((await ice).data.candidate).toBe('cand');
    expect((await emit(a, 'call:offer', { callId: inv.callId, data: 'x'.repeat(20000) })).error).toBe('invalid');
    const ended = once(b, 'call:ended');
    expect((await emit(a, 'call:end', { callId: inv.callId })).ok).toBe(true);
    await ended;
    expect((await emit(a, 'call:offer', { callId: inv.callId, data: {} })).error).toBe('forbidden'); // call is over
  });
  it('reject notifies the caller; offline callee and non-members are refused', async () => {
    const a = await connect(tok(A, 'Alice F'));
    expect((await emit(a, 'call:invite', { conversationId: conv })).error).toBe('offline');
    const b = await connect(tok(B, 'Bob C')); const c = await connect(tok(C, 'Mallory'));
    expect((await emit(c, 'call:invite', { conversationId: conv })).error).toBe('forbidden');
    const inv = await emit(a, 'call:invite', { conversationId: conv });
    const rejected = once(a, 'call:rejected');
    await emit(b, 'call:reject', { callId: inv.callId });
    expect((await rejected).callId).toBe(inv.callId);
  });
  it('issues short-lived HMAC TURN credentials to authenticated users only', async () => {
    expect((await request(app).get('/calls/ice')).status).toBe(401);
    const r = await request(app).get('/calls/ice').set(H(A, 'Alice F'));
    expect(r.body.iceServers).toHaveLength(2);
    const turn = r.body.iceServers[1];
    const [expiry, uid] = turn.username.split(':');
    expect(uid).toBe(A);
    expect(Number(expiry)).toBeGreaterThan(Date.now() / 1000);
    expect(turn.credential).toBe(crypto.createHmac('sha1', env.TURN_SECRET).update(turn.username).digest('base64'));
    expect(JSON.stringify(r.body)).not.toContain(env.TURN_SECRET);
    expect(iceServers({ ...env, TURN_URLS: undefined }, A).iceServers).toHaveLength(1); // STUN only when TURN unset
  });
});
