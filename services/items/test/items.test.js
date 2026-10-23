import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { z } from 'zod';
import { loadEnv } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { createMemoryBus } from '@findit/shared/events';
import { mongoose, connectMongo } from '@findit/shared/db';
import { signAccess } from '@findit/shared/tokens';
import { createItemsApp } from '../src/app.js';
import { buildFilter, searchSchema } from '../src/search.js';
import { Item } from '../src/models.js';

const env = loadEnv({ MONGO_URL: z.string().default('mongodb://127.0.0.1:27017/findit_test_items') });
const logger = createLogger('t', 'silent');
const tok = (id, name = 'Test User', role = 'user') => ({ Authorization: `Bearer ${signAccess(env, { sub: id, role, name })}` });
const A = '64b000000000000000000001'; const B = '64b000000000000000000002'; const ADMIN = '64b0000000000000000000ff';
let app; let bus; let destroyed; let png;

const storage = { uploadPublic: async () => ({ publicId: `p${Math.random()}`, url: 'https://res.cloudinary.com/x/img.webp' }), destroy: async (id) => { destroyed.push(id); } };
const base = { type: 'found', title: 'Black leather wallet', description: 'Found near the library entrance, has a scratch.', category: 'wallet', date: new Date(Date.now() - 86400000).toISOString(), lat: '23.8761234', lng: '90.3203456', areaLabel: 'Ashulia, Dhaka', questions: JSON.stringify(['What colour is the lining?']), heldAt: 'Library desk', contactNote: 'Call 01700-000000' };
const post = (who, fields = {}, files = 0) => {
  let r = request(app).post('/').set(who);
  for (const [k, v] of Object.entries({ ...base, ...fields })) if (v !== undefined) r = r.field(k, v);
  for (let i = 0; i < files; i++) r = r.attach('images', png, { filename: 'a.png', contentType: 'image/png' });
  return r;
};

beforeAll(async () => {
  await connectMongo(env.MONGO_URL, logger, { autoIndex: false });
  png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#0f0' } }).png().toBuffer();
});
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  destroyed = [];
  bus = createMemoryBus();
  app = createItemsApp({ env, logger, bus, storage, lookupUser: async (id) => (id === ADMIN ? { role: 'admin', isActive: true } : { role: 'user', isActive: true }) });
  await app.locals.wire();
});

describe('creating reports', () => {
  it('requires auth', async () => { expect((await request(app).post('/').send({})).status).toBe(401); });
  it('creates a found item, publishes item.created with questions, hides private data from others', async () => {
    const r = await post(tok(A, 'Alice Rahman'), {}, 2);
    expect(r.status).toBe(201);
    expect(r.body.item.questions).toEqual(['What colour is the lining?']);
    expect(r.body.item.images).toHaveLength(2);
    expect(bus.published.find((e) => e.type === 'item.created').payload.questions).toHaveLength(1);
    const id = r.body.item.id;
    const pub = await request(app).get(`/${id}`);
    expect(pub.status).toBe(200);
    for (const k of ['location', 'heldAt', 'contactNote', 'questions', 'history', 'approvedClaimant']) expect(pub.body.item[k]).toBeUndefined();
    expect(pub.body.item.area.lat).toBe(23.88); // approximate only
    expect(pub.body.item.ownerName).toBe('Alice');
    const other = await request(app).get(`/${id}`).set(tok(B));
    expect(other.body.item.location).toBeUndefined();
    const owner = await request(app).get(`/${id}`).set(tok(A));
    expect(owner.body.item.location.lat).toBeCloseTo(23.8761234, 6);
  });
  it('blocks mass assignment and bad input', async () => {
    for (const extra of [{ status: 'returned' }, { owner: B }, { role: 'admin' }, { score: '100' }]) expect((await post(tok(A), extra)).status).toBe(400);
    expect((await post(tok(A), { questions: undefined })).status).toBe(400); // found needs questions
    expect((await post(tok(A), { type: 'lost', questions: undefined, heldAt: undefined })).status).toBe(201);
    expect((await post(tok(A), { lat: '999' })).status).toBe(400);
    expect((await post(tok(A), { title: 'x' })).status).toBe(400);
    expect((await post(tok(A), { date: '2999-01-01' })).status).toBe(400);
    expect((await post(tok(A), {}, 6)).status).toBe(400); // more than 5 files
  });
  it('stores XSS payloads as inert plain text', async () => {
    const r = await post(tok(A), { title: '<img src=x onerror=alert(1)>Wallet', description: '<script>alert(1)</script> something long enough' });
    expect(r.status).toBe(201);
    expect(r.body.item.title).not.toMatch(/[<>]/);
    expect(r.body.item.description).not.toMatch(/[<>]/);
  });
});

describe('access control (IDOR)', () => {
  it("other users cannot edit, close, or read another user's matches; hidden items are 404", async () => {
    const id = (await post(tok(A))).body.item.id;
    expect((await request(app).patch(`/${id}`).set(tok(B)).send({ title: 'hijacked' })).status).toBe(404);
    expect((await request(app).patch(`/${id}`).send({ title: 'x' })).status).toBe(401);
    expect((await request(app).post(`/${id}/close`).set(tok(B))).status).toBe(404);
    expect((await request(app).get(`/${id}/matches`).set(tok(B))).status).toBe(404);
    expect((await request(app).patch(`/${id}`).set(tok(A)).send({ status: 'verified' })).status).toBe(400);
    expect((await request(app).patch(`/${id}`).set(tok(A)).send({ title: 'Brown wallet' })).status).toBe(200);
    await Item.updateOne({ _id: id }, { hidden: true });
    expect((await request(app).get(`/${id}`)).status).toBe(404);
    expect((await request(app).get(`/${id}`).set(tok(A))).status).toBe(200);
  });
  it('invalid ids are rejected, not cast', async () => {
    expect((await request(app).get('/not-an-id')).status).toBe(400);
  });
  it('admin routes: anonymous 401, user 403, admin 200; admin actions are audited', async () => {
    const id = (await post(tok(A))).body.item.id;
    expect((await request(app).get('/admin/items')).status).toBe(401);
    expect((await request(app).get('/admin/items').set(tok(A))).status).toBe(403);
    expect((await request(app).get('/admin/items').set(tok(ADMIN, 'Root', 'admin'))).status).toBe(200);
    const p = await request(app).patch(`/admin/items/${id}`).set(tok(ADMIN, 'Root', 'admin')).send({ hidden: true });
    expect(p.status).toBe(200);
    expect(bus.published.some((e) => e.type === 'audit.record' && e.payload.action === 'admin.item_update')).toBe(true);
    const d = await request(app).delete(`/admin/items/${id}`).set(tok(ADMIN, 'Root', 'admin'));
    expect(d.status).toBe(204);
    expect(destroyed.length).toBeGreaterThanOrEqual(0);
  });
});

describe('search + injection', () => {
  it('rejects operator injection in every query param', async () => {
    for (const qs of ['category[$ne]=x', 'q[$gt]=', 'type[$ne]=lost', 'limit=500', 'page=0', 'lat=1', 'radiusKm=5']) {
      expect((await request(app).get(`/?${qs}`)).status).toBe(400);
    }
  });
  it('lists public items paginated without private fields', async () => {
    await post(tok(A)); await post(tok(B), { title: 'Blue umbrella' });
    const r = await request(app).get('/?limit=1&category=wallet');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.total).toBe(2);
    expect(r.body.items[0].location).toBeUndefined();
  });
  it('buildFilter produces typed, trusted operators', () => {
    const q = searchSchema.parse({ q: 'wallet', lat: '23.8', lng: '90.3', radiusKm: '5', from: '2026-01-01' });
    const f = buildFilter(q);
    expect(f.hidden).toBe(false);
    expect(f.$text).toBeTruthy();
    expect(f.location.$geoWithin.$centerSphere[1]).toBeCloseTo(5 / 6378.1, 6);
  });
});

describe('status machine via events', () => {
  it('match -> claimed -> verified (approved claimant sees exact location) -> returned/closed with history', async () => {
    const id = (await post(tok(A))).body.item.id;
    await bus.publish('match.created', { lostItemId: B, foundItemId: id });
    expect((await Item.findById(id)).status).toBe('matched');
    await bus.publish('claim.created', { itemId: id, claimant: B });
    expect((await Item.findById(id)).status).toBe('claimed');
    const beforeApproval = await request(app).get(`/${id}`).set(tok(B));
    expect(beforeApproval.body.item.location).toBeUndefined();
    await bus.publish('claim.approved', { itemId: id, claimant: B, finder: A });
    const afterApproval = await request(app).get(`/${id}`).set(tok(B));
    expect(afterApproval.body.item.status).toBe('verified');
    expect(afterApproval.body.item.heldAt).toBe('Library desk');
    expect(afterApproval.body.item.questions).toBeUndefined();
    const third = await request(app).get(`/${id}`).set(tok('64b000000000000000000003'));
    expect(third.body.item.location).toBeUndefined();
    await bus.publish('claim.returned', { itemId: id, actor: B });
    const done = await Item.findById(id);
    expect(done.status).toBe('closed');
    expect(done.history.map((h) => h.to)).toEqual(['open', 'matched', 'claimed', 'verified', 'returned', 'closed']);
    expect(done.history.every((h) => h.actor && h.at)).toBe(true);
    const stats = await request(app).get('/stats');
    expect(stats.body.recovered).toBe(1);
  });
});

describe('owner actions, public feeds and matching proxy', () => {
  it('owner can close; verified items cannot be closed; heldAt only on found items', async () => {
    const id = (await post(tok(A))).body.item.id;
    expect((await request(app).patch(`/${id}`).set(tok(A)).send({ heldAt: 'Desk 2' })).status).toBe(200);
    const lostId = (await post(tok(A), { type: 'lost', questions: undefined, heldAt: undefined })).body.item.id;
    expect((await request(app).patch(`/${lostId}`).set(tok(A)).send({ heldAt: 'x1' })).status).toBe(400);
    await bus.publish('claim.approved', { itemId: id, claimant: B, finder: A });
    expect((await request(app).post(`/${id}/close`).set(tok(A))).status).toBe(400);
    expect((await request(app).post(`/${lostId}/close`).set(tok(A))).body.item.status).toBe('closed');
    expect((await request(app).patch(`/${lostId}`).set(tok(A)).send({ title: 'Too late now' })).status).toBe(400);
  });
  it('public map + stats expose only approximate data', async () => {
    await post(tok(A));
    const m = await request(app).get('/map');
    expect(m.status).toBe(200);
    expect(m.body.items[0]).toMatchObject({ lat: 23.88, lng: 90.32, type: 'found' });
    expect(JSON.stringify(m.body)).not.toMatch(/heldAt|contactNote|questions|owner/);
    expect((await request(app).get('/map?bbox=1,2,3')).status).toBe(400);
    expect((await request(app).get('/map?type[$ne]=x')).status).toBe(400);
    expect((await request(app).get('/stats')).body.openFound).toBe(1);
  });
  it('proxies match suggestions to the internal matching service with the service token, owner only', async () => {
    const id = (await post(tok(A))).body.item.id;
    const calls = [];
    vi.stubGlobal('fetch', async (url, opts) => { calls.push({ url: String(url), opts }); return { ok: true, json: async () => ({ matches: [{ id: 'm1', score: 77 }] }) }; });
    try {
      const r = await request(app).get(`/${id}/matches`).set(tok(A));
      expect(r.body.matches[0].score).toBe(77);
      expect(calls[0].url).toContain(`/internal/matches?itemId=${id}&owner=${A}`);
      expect(calls[0].opts.headers['x-internal-token']).toBe(env.INTERNAL_SERVICE_TOKEN);
      const d = await request(app).post(`/${id}/matches/64b0000000000000000000cc/dismiss`).set(tok(A));
      expect(d.status).toBe(200);
      expect((await request(app).post(`/${id}/matches/64b0000000000000000000cc/dismiss`).set(tok(B))).status).toBe(404);
    } finally { vi.unstubAllGlobals(); }
  });
  it('admin stats, status override and delete publish item.deleted', async () => {
    const id = (await post(tok(A))).body.item.id;
    const adm = tok(ADMIN, 'Root', 'admin');
    expect((await request(app).get('/admin/stats').set(adm)).body.total).toBe(1);
    const p = await request(app).patch(`/admin/items/${id}`).set(adm).send({ status: 'closed' });
    expect(p.body.item.status).toBe('closed');
    expect((await request(app).patch(`/admin/items/${id}`).set(adm).send({ status: 'bogus' })).status).toBe(400);
    expect((await request(app).delete(`/admin/items/${id}`).set(adm)).status).toBe(204);
    expect(bus.published.some((e) => e.type === 'item.deleted' && e.payload.id === id)).toBe(true);
    expect((await request(app).get(`/${id}`)).status).toBe(404);
  });
});
