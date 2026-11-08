import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { z } from 'zod';
import { loadEnv } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { createMemoryBus } from '@findit/shared/events';
import { mongoose, connectMongo } from '@findit/shared/db';
import { signAccess } from '@findit/shared/tokens';
import { createClaimsApp, LIMITS } from '../src/app.js';
import { Claim, AuditLog, VerificationAttempt } from '../src/models.js';

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

describe('ownership verification (server-side scoring)', () => {
  const V1 = '64c0000000000000000000a1'; const V2 = '64c0000000000000000000a2'; const V3 = '64c0000000000000000000a3';
  const ENT = [
    { id: 'q1', question: 'How much money was inside?', type: 'number', weight: 3, answer: '2500', tolerance: null },
    { id: 'q2', question: 'What is written on the keychain?', type: 'text', weight: 2, answer: 'ZEBRA-4821', tolerance: null },
    { id: 'q3', question: 'Describe the interior', type: 'descriptive', weight: 1, answer: 'red lining with a torn corner', tolerance: null },
  ];
  const FIVE = ['a1', 'b2', 'c3', 'd4', 'e5'].map((a, i) => ({ id: `f${i}`, question: `Private question number ${i}`, type: 'text', weight: 1, answer: a, tolerance: null }));
  let calls; let remote;
  const meta = (entries) => entries.map(({ id, question, type, weight }) => ({ id, question, type, weight }));
  const seedV = (id, entries = ENT, extra = {}) => bus.publish('item.created', { id, type: 'found', owner: FIND, ownerName: 'Finder Person', title: 'Black wallet', status: 'open', questions: entries.map((e) => e.question), verification: meta(entries), ...extra });
  const send = (who, itemId, answers, extra = {}) => {
    let r = request(app).post('/').set(who).field('itemId', itemId);
    if (answers) r = r.field('answers', JSON.stringify(answers));
    for (const [k, v] of Object.entries(extra)) r = r.field(k, v);
    return r;
  };
  const review = async (id = V1) => (await request(app).get('/received').set(U(FIND))).body.claims.find((c) => c.itemId === id);

  beforeEach(() => {
    calls = []; remote = { [V1]: ENT, [V2]: FIVE };
    vi.stubGlobal('fetch', async (url, opts) => {
      calls.push({ url: String(url), token: opts?.headers?.['x-internal-token'] });
      const m = String(url).match(/internal\/items\/([a-f0-9]{24})\/verification/);
      const entries = remote[m?.[1]];
      if (!entries) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, json: async () => ({ itemId: m[1], owner: FIND, entries }) };
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('scores on the server: all-correct = 100% high; the claim never stores the correct answers', async () => {
    await seedV(V1);
    const r = await send(U(CLA, 'Claimant A'), V1, ['৳2,500', 'zebra-4821', 'Red lining with a torn corner']);
    expect(r.status).toBe(201);
    expect(calls[0].token).toBe(env.INTERNAL_SERVICE_TOKEN); // answers fetched over the authenticated internal channel
    const v = (await review()).verification;
    expect(v).toMatchObject({ scored: true, score: 100, level: 'high', matched: 3, total: 3, answered: 3 });
    const wrong = await send(U(CLB, 'Claimant B'), V1, ['1', 'nope', 'blue plastic']);
    expect(wrong.status).toBe(201);
    const doc = JSON.stringify((await Claim.findById(wrong.body.claim.id)).toObject());
    expect(doc).not.toContain('ZEBRA'); expect(doc).not.toContain('2500'); expect(doc).not.toContain('torn corner');
  });

  it('5 equal questions with 4 correct = 80%', async () => {
    await seedV(V2, FIVE);
    const r = await send(U(CLA, 'Claimant A'), V2, ['a1', 'b2', 'c3', 'd4', 'WRONG']);
    expect(r.status).toBe(201);
    const v = (await review(V2)).verification;
    expect(v).toMatchObject({ score: 80, matched: 4, total: 5, answered: 5, level: 'high' });
    expect(v.perQuestion.map((p) => p.result)).toEqual(['match', 'match', 'match', 'match', 'no_match']);
  });

  it('unanswered questions never raise the score; weights apply; descriptive near-matches are only "approx"', async () => {
    await seedV(V1);
    await send(U(CLA, 'Claimant A'), V1, ['', 'ZEBRA-4821', '']);
    expect((await review()).verification).toMatchObject({ score: 33, level: 'low', matched: 1, answered: 1, total: 3 }); // weight 2 of 6
    await send(U(CLB, 'Claimant B'), V1, ['2500', 'ZEBRA-4821', 'torn corner red lining its']);
    const b = (await request(app).get('/received').set(U(FIND))).body.claims.find((c) => c.claimantName === 'Claimant B');
    expect(b.verification).toMatchObject({ approximate: 1, matched: 2 });
    expect(b.verification.score).toBe(92); // (3 + 2 + 0.5) / 6
    expect(b.verification.perQuestion[2].result).toBe('approx');
  });

  it('the claimant never sees a score, per-answer results or any correct answer; the finder view never contains the correct answers', async () => {
    await seedV(V1);
    const r = await send(U(CLA, 'Claimant A'), V1, ['2500', 'wrong', 'x']);
    const mine = await request(app).get('/mine').set(U(CLA));
    for (const body of [r.body, mine.body, (await request(app).get(`/${r.body.claim.id}`).set(U(CLA))).body]) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/"score"|perQuestion|"level"|matched|approximate|ZEBRA|torn corner/);
    }
    const finderText = JSON.stringify(await review());
    expect(finderText).not.toContain('ZEBRA-4821'); expect(finderText).not.toContain('torn corner'); // result flags only, never the stored answers
    expect(finderText).toContain('"claimed":"wrong"');
  });

  it("claimants cannot read each other's claims; only the item's finder can review; strangers get nothing", async () => {
    await seedV(V1);
    const a = (await send(U(CLA, 'Claimant A'), V1, ['2500', 'ZEBRA-4821', 'x'])).body.claim.id;
    const b = (await send(U(CLB, 'Claimant B'), V1, ['1', '2', '3'])).body.claim.id;
    expect((await request(app).get(`/${a}`).set(U(CLB))).status).toBe(404);
    expect((await request(app).get(`/${b}`).set(U(CLA))).status).toBe(404);
    expect((await request(app).get('/mine').set(U(CLB))).body.claims.map((c) => c.id)).toEqual([b]);
    const stranger = '64b0000000000000000000c9';
    expect((await request(app).get(`/${a}`).set(U(stranger))).status).toBe(404);
    expect((await request(app).get('/received').set(U(stranger))).body.claims).toHaveLength(0);
    expect((await request(app).get('/received').set(U(CLA))).body.claims).toHaveLength(0);
    expect((await request(app).post(`/${a}/decision`).set(U(stranger)).send({ decision: 'approve' })).status).toBe(404);
    expect((await request(app).get(`/${a}`)).status).toBe(401);
  });

  it('one attempt per item (no re-submission to probe answers); every attempt is recorded', async () => {
    await seedV(V1);
    expect((await send(U(CLA, 'Claimant A'), V1, ['1', '2', '3'])).status).toBe(201);
    const again = await send(U(CLA, 'Claimant A'), V1, ['2500', 'ZEBRA-4821', 'red lining with a torn corner']);
    expect(again.status).toBe(409);
    expect(await Claim.countDocuments({ claimant: CLA, itemId: V1 })).toBe(1);
    expect((await review()).verification.score).toBeLessThan(10); // the first (wrong) attempt stands
    const outcomes = (await VerificationAttempt.find({ claimant: CLA }).sort({ at: 1 })).map((x) => x.outcome);
    expect(outcomes).toEqual(['scored', 'already_claimed']);
    expect((await VerificationAttempt.findOne({ claimant: CLA })).ip).toBeTruthy();
  });

  it('fails closed when the answers cannot be fetched; rejects stale question lists; needs at least one answer', async () => {
    await seedV(V3, ENT);
    const down = await send(U(CLA, 'Claimant A'), V3, ['1', '2', '3']); // V3 is unknown to the stub => items service unavailable
    expect(down.status).toBe(503); expect(down.body.error.code).toBe('verification_unavailable');
    expect(await Claim.countDocuments({ itemId: V3 })).toBe(0);
    await seedV(V1);
    expect((await send(U(CLA, 'Claimant A'), V1, ['1', '2'])).body.error.code).toBe('questions_changed');
    expect((await send(U(CLA, 'Claimant A'), V1, ['', '  ', ''])).status).toBe(400);
    const out = (await VerificationAttempt.find({})).map((x) => x.outcome).sort();
    expect(out).toEqual(['invalid', 'questions_changed', 'verification_unavailable']);
  });

  it('legacy reports (questions only) stay claimable as "unscored"; items with no questions require a written explanation', async () => {
    const legacy = await send(U(CLA, 'Claimant A'), ITEM, ['cards', 'yes']);
    expect(legacy.status).toBe(201);
    expect((await review(ITEM)).verification).toEqual({ scored: false, level: 'unscored' });
    const NOQ = '64c0000000000000000000b1';
    await bus.publish('item.created', { id: NOQ, type: 'found', owner: FIND, ownerName: 'Finder Person', title: 'Umbrella', status: 'open', questions: null, verification: null });
    expect((await request(app).get(`/questions/${NOQ}`).set(U(CLB))).body).toMatchObject({ questions: [], requiresMessage: true });
    expect((await send(U(CLB, 'Claimant B'), NOQ, null)).status).toBe(400);
    expect((await send(U(CLB, 'Claimant B'), NOQ, null, { message: 'too short' })).status).toBe(400);
    const ok = await send(U(CLB, 'Claimant B'), NOQ, null, { message: 'It is mine: green with a wooden handle and my initials.' });
    expect(ok.status).toBe(201);
    const row = (await request(app).get('/received').set(U(FIND))).body.claims.find((c) => c.itemId === NOQ);
    expect(row.message).toMatch(/wooden handle/); expect(row.verification.scored).toBe(false);
  });

  it('thresholds are configurable (not hard-coded) and exposed to the review UI', async () => {
    app = createClaimsApp({ env, logger, bus, storage, lookupUser: async () => ({ role: 'user', isActive: true }), verifyConfig: { high: 95, medium: 40, descriptiveMinSimilarity: 0.6, approxCredit: 0.5 } });
    await app.locals.wire();
    await seedV(V2, FIVE);
    await send(U(CLA, 'Claimant A'), V2, ['a1', 'b2', 'c3', 'd4', 'x']); // 80%
    const row = await review(V2);
    expect(row.verification).toMatchObject({ score: 80, level: 'medium' });
    expect(row.thresholds).toEqual({ high: 95, medium: 40 });
  });

  it('"request further verification": finder asks, claimant answers with text + photos, both are notified, limits apply', async () => {
    await seedV(V1);
    const id = (await send(U(CLA, 'Claimant A'), V1, ['2500', 'ZEBRA-4821', 'x'])).body.claim.id;
    const stranger = '64b0000000000000000000c9';
    expect((await request(app).post(`/${id}/request-info`).set(U(stranger)).send({ message: 'Please prove it' })).status).toBe(404);
    expect((await request(app).post(`/${id}/request-info`).set(U(CLA)).send({ message: 'Please prove it' })).status).toBe(404);
    expect((await request(app).post(`/${id}/request-info`).set(U(FIND)).send({ message: 'no' })).status).toBe(400);
    expect((await request(app).post(`/${id}/supplement`).set(U(CLA)).field('message', 'nothing was asked')).status).toBe(409);
    const req1 = await request(app).post(`/${id}/request-info`).set(U(FIND)).send({ message: 'Please send a photo of the receipt.' });
    expect(req1.status).toBe(200); expect(req1.body.claim.reviewState).toBe('more_info_requested');
    expect((await request(app).post(`/${id}/request-info`).set(U(FIND)).send({ message: 'Again please?' })).body.error.code).toBe('info_pending');
    expect(bus.published.some((e) => e.type === 'claim.info_requested' && e.payload.claimant === CLA)).toBe(true);
    const mine = (await request(app).get('/mine').set(U(CLA))).body.claims[0];
    expect(mine.moreInfo.message).toMatch(/receipt/);
    expect((await request(app).post(`/${id}/supplement`).set(U(CLB)).field('message', 'I am not the claimant')).status).toBe(404);
    const sup = await request(app).post(`/${id}/supplement`).set(U(CLA)).field('message', 'Here is the receipt, bought in March.').attach('proofs', png, { filename: 'r.png', contentType: 'image/png' });
    expect(sup.status).toBe(200); expect(sup.body.claim.reviewState).toBe('info_provided');
    expect(bus.published.some((e) => e.type === 'claim.info_provided' && e.payload.finder === FIND)).toBe(true);
    const fv = await review();
    expect(fv.supplement.message).toMatch(/receipt/); expect(fv.supplement.proofUrls).toHaveLength(1);
    expect(fv.reviewState).toBe('info_provided');
    for (let i = 0; i < 2; i++) { await request(app).post(`/${id}/request-info`).set(U(FIND)).send({ message: `Follow up number ${i}` }); await request(app).post(`/${id}/supplement`).set(U(CLA)).field('message', `Answer number ${i}`); }
    expect((await request(app).post(`/${id}/request-info`).set(U(FIND)).send({ message: 'One more please' })).body.error.code).toBe('info_limit');
    await request(app).post(`/${id}/decision`).set(U(FIND)).send({ decision: 'approve' });
    expect((await request(app).post(`/${id}/request-info`).set(U(FIND)).send({ message: 'Too late now' })).status).toBe(409);
  });

  it('the attempts log is admin-only', async () => {
    await seedV(V1);
    await send(U(CLA, 'Claimant A'), V1, ['1', '2', '3']);
    expect((await request(app).get('/admin/verification-attempts')).status).toBe(401);
    expect((await request(app).get('/admin/verification-attempts').set(U(CLA))).status).toBe(403);
    const r = await request(app).get('/admin/verification-attempts?outcome=scored').set(U(ADM, 'Root', 'admin'));
    expect(r.status).toBe(200); expect(r.body.attempts).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toMatch(/ZEBRA|"score"|perQuestion/);
  });
});
