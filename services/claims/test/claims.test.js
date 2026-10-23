import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { z } from 'zod';
import { loadEnv } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { createMemoryBus } from '@findit/shared/events';
import { mongoose, connectMongo } from '@findit/shared/db';
import { signAccess } from '@findit/shared/tokens';
import { createClaimsApp, LIMITS } from '../src/app.js';
import { Claim, AuditLog } from '../src/models.js';

const env = loadEnv({ MONGO_URL: z.string().default('mongodb://127.0.0.1:27017/findit_test_claims') });
const logger = createLogger('t', 'silent');
const U = (id, name = 'U', role = 'user') => ({ Authorization: `Bearer ${signAccess(env, { sub: id, role, name })}` });
const FIND = '64b0000000000000000000a1'; const CLA = '64b0000000000000000000b1'; const CLB = '64b0000000000000000000b2'; const ADM = '64b0000000000000000000ff';
const ITEM = '64c000000000000000000001';
let app; let bus; let png;
const storage = { uploadPrivate: async () => ({ publicId: `priv${Math.random()}` }), signedPrivateUrl: (id) => `https://res.cloudinary.com/x/authenticated/s--sig--/${id}`, destroy: async () => {} };
const seed = (id = ITEM, extra = {}) => bus.publish('item.created', { id, type: 'found', owner: FIND, ownerName: 'Finder Person', title: 'Black wallet', status: 'open', questions: ['What is inside?', 'Any scratch?'], ...extra });
const claim = (who, answers = ['cards', 'yes'], itemId = ITEM, files = 0) => {
  let r = request(app).post('/').set(who).field('itemId', itemId).field('answers', JSON.stringify(answers));
  for (let i = 0; i < files; i++) r = r.attach('proofs', png, { filename: 'p.png', contentType: 'image/png' });
  return r;
};

beforeAll(async () => { await connectMongo(env.MONGO_URL, logger, { autoIndex: true }); png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#00f' } }).png().toBuffer(); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
  bus = createMemoryBus();
  app = createClaimsApp({ env, logger, bus, storage, lookupUser: async (id) => ({ role: id === ADM ? 'admin' : 'user', isActive: true }) });
  await app.locals.wire();
  await seed();
});

describe('claim creation', () => {
  it('shows questions only to signed-in non-owners', async () => {
    expect((await request(app).get(`/questions/${ITEM}`)).status).toBe(401);
    expect((await request(app).get(`/questions/${ITEM}`).set(U(FIND))).status).toBe(404);
    const r = await request(app).get(`/questions/${ITEM}`).set(U(CLA));
    expect(r.status).toBe(200); expect(r.body.questions).toHaveLength(2);
  });
  it('creates a claim with private proofs, publishes claim.created, blocks own-item, duplicates and wrong answer counts', async () => {
    const r = await claim(U(CLA, 'Claimant A'), ['cards', 'yes'], ITEM, 2);
    expect(r.status).toBe(201);
    expect(r.body.claim.proofCount).toBe(2);
    expect(r.body.claim.finderName).toBeUndefined();
    expect(bus.published.some((e) => e.type === 'claim.created' && e.payload.finder === FIND)).toBe(true);
    expect((await claim(U(CLA))).status).toBe(409);
    expect((await claim(U(FIND))).status).toBe(403);
    expect((await claim(U(CLB), ['only one'])).status).toBe(400);
    expect((await claim(U(CLB), ['x', 'y'], '64c0000000000000000000ff')).status).toBe(404);
    expect((await request(app).post('/').send({})).status).toBe(401);
    expect((await request(app).post('/').set(U(CLB)).send({ itemId: ITEM, answers: '["a","b"]', status: 'approved' })).status).toBe(400);
  });
  it('limits: locked after repeated rejections; XSS in answers neutralised', async () => {
    for (let i = 0; i < LIMITS.rejectedMax; i++) {
      const id = `64c00000000000000000010${i}`; await seed(id);
      const c = (await claim(U(CLB), ['a', 'b'], id)).body.claim;
      expect((await request(app).post(`/${c.id}/decision`).set(U(FIND)).send({ decision: 'reject' })).status).toBe(200);
    }
    expect((await claim(U(CLB))).status).toBe(429);
    const x = await claim(U(CLA), ['<script>alert(1)</script>', '<img onerror=x>']);
    expect(JSON.stringify(x.body)).not.toMatch(/[<>]/);
  });
});

describe('decisions and access control', () => {
  let cid;
  beforeEach(async () => { cid = (await claim(U(CLA, 'Claimant A'))).body.claim.id; });
  it('only parties can read a claim; finder sees answers + signed proof URLs; claimant never sees others', async () => {
    expect((await request(app).get(`/${cid}`).set(U(CLB))).status).toBe(404);
    expect((await request(app).get(`/${cid}`)).status).toBe(401);
    const f = await request(app).get(`/${cid}`).set(U(FIND));
    expect(f.body.claim.answers).toHaveLength(2);
    const rec = await request(app).get('/received').set(U(FIND));
    expect(rec.body.claims).toHaveLength(1);
    expect((await request(app).get('/received').set(U(CLB))).body.claims).toHaveLength(0);
    expect((await request(app).get('/mine').set(U(CLA))).body.claims).toHaveLength(1);
  });
  it('only the finder can decide; claimant cannot approve own claim; decision is final', async () => {
    expect((await request(app).post(`/${cid}/decision`).set(U(CLA)).send({ decision: 'approve' })).status).toBe(404);
    expect((await request(app).post(`/${cid}/decision`).set(U(CLB)).send({ decision: 'approve' })).status).toBe(404);
    expect((await request(app).post(`/${cid}/decision`).set(U(FIND)).send({ decision: 'maybe' })).status).toBe(400);
    expect((await request(app).post(`/${cid}/decision`).set(U(FIND)).send({ decision: 'approve' })).status).toBe(200);
    expect((await request(app).post(`/${cid}/decision`).set(U(FIND)).send({ decision: 'reject' })).status).toBe(409);
  });
  it('approve: publishes claim.approved, auto-rejects other pending claims, returned closes flow', async () => {
    const other = (await claim(U(CLB, 'Claimant B'))).body.claim.id;
    await request(app).post(`/${cid}/decision`).set(U(FIND)).send({ decision: 'approve' });
    expect(bus.published.find((e) => e.type === 'claim.approved').payload).toMatchObject({ claimant: CLA, finder: FIND, finderName: 'Finder Person' });
    expect((await Claim.findById(other)).status).toBe('rejected');
    expect((await request(app).post(`/${cid}/returned`).set(U(CLB))).status).toBe(404);
    const ret = await request(app).post(`/${cid}/returned`).set(U(CLA));
    expect(ret.status).toBe(200);
    expect(bus.published.some((e) => e.type === 'claim.returned' && e.payload.actor === CLA)).toBe(true);
    expect((await request(app).post(`/${cid}/returned`).set(U(FIND))).status).toBe(409);
    const hist = (await Claim.findById(cid)).history;
    expect(hist.map((h) => h.to)).toEqual(['pending', 'approved', 'returned']);
    expect(hist.every((h) => h.actor && h.at && h.ip !== undefined)).toBe(true);
    const actions = (await AuditLog.find({})).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['claim.create', 'claim.approve', 'claim.returned']));
  });
  it('reject reopens item when nothing is pending; withdraw works only for claimant', async () => {
    expect((await request(app).post(`/${cid}/withdraw`).set(U(FIND))).status).toBe(404);
    expect((await request(app).post(`/${cid}/withdraw`).set(U(CLA))).status).toBe(200);
    expect(bus.published.some((e) => e.type === 'claim.reopened')).toBe(true);
    const c2 = (await claim(U(CLB))).body.claim.id;
    await request(app).post(`/${c2}/decision`).set(U(FIND)).send({ decision: 'reject' });
    expect(bus.published.filter((e) => e.type === 'claim.reopened')).toHaveLength(2);
    expect(JSON.stringify((await request(app).get(`/${c2}`).set(U(CLB))).body)).not.toMatch(/correct/i);
  });
  it('item deletion withdraws pending claims', async () => {
    await bus.publish('item.deleted', { id: ITEM });
    expect((await Claim.findById(cid)).status).toBe('withdrawn');
  });
});

describe('admin + audit', () => {
  it('admin endpoints are role-protected; audit.record events are persisted and readable by admin only', async () => {
    await bus.publish('audit.record', { service: 'items', action: 'item.create', actor: FIND, targetType: 'item', targetId: ITEM, ip: '1.2.3.4' });
    expect((await request(app).get('/admin/audit')).status).toBe(401);
    expect((await request(app).get('/admin/audit').set(U(FIND))).status).toBe(403);
    const r = await request(app).get('/admin/audit?action=item.create').set(U(ADM, 'Root', 'admin'));
    expect(r.status).toBe(200); expect(r.body.entries).toHaveLength(1);
    const cid = (await claim(U(CLA))).body.claim.id;
    expect((await request(app).patch(`/admin/claims/${cid}`).set(U(CLA)).send({ status: 'rejected' })).status).toBe(403);
    expect((await request(app).patch(`/admin/claims/${cid}`).set(U(ADM, 'Root', 'admin')).send({ status: 'rejected' })).status).toBe(200);
    expect((await request(app).get('/admin/stats').set(U(ADM, 'Root', 'admin'))).body.rejected).toBe(1);
    expect((await request(app).get('/admin/claims').set(U(ADM, 'Root', 'admin'))).body.claims).toHaveLength(1);
  });
});
