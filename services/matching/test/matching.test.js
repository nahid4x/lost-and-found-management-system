import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { loadEnv } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { createMemoryBus } from '@findit/shared/events';
import { mongoose, connectMongo } from '@findit/shared/db';
import { score, tokenize, buildIdf, haversineKm, matchingService } from '../src/scoring.js';
import { createMatchingApp } from '../src/app.js';
import { Match } from '../src/models.js';

const env = loadEnv({ MONGO_URL: z.string().default('mongodb://127.0.0.1:27017/findit_test_matching'), MATCH_THRESHOLD: z.coerce.number().default(45), MATCH_RADIUS_KM: z.coerce.number().default(2) });
const logger = createLogger('t', 'silent');
const T = { 'x-internal-token': env.INTERNAL_SERVICE_TOKEN };
const day = (n) => new Date(Date.UTC(2026, 5, 10 + n)).toISOString();
const lost = { type: 'lost', title: 'Black Samsung phone', description: 'Black Samsung phone with a cracked screen and red case', category: 'electronics', date: day(0), location: { lat: 23.8761, lng: 90.3203 } };
const foundSame = { type: 'found', title: 'Samsung phone found', description: 'Black phone, cracked screen, red cover, Samsung logo', category: 'electronics', date: day(1), location: { lat: 23.8770, lng: 90.3210 } };
const foundOther = { type: 'found', title: 'Green umbrella', description: 'Large green umbrella with wooden handle', category: 'other', date: day(1), location: { lat: 24.5, lng: 91.0 } };

describe('scoring (unit)', () => {
  it('tokenises, stems and drops stop words', () => { expect(tokenize('The Keys, and a wallets!')).toEqual(['key', 'wallet']); });
  it('similar items score high with explainable reasons; unrelated score low', () => {
    const hi = score(lost, foundSame);
    const lo = score(lost, foundOther);
    expect(hi.score).toBeGreaterThan(70);
    expect(lo.score).toBeLessThan(25);
    expect(hi.reasons.map((r) => r.factor)).toEqual(['text', 'category', 'keywords', 'date', 'distance']);
    expect(hi.reasons.every((r) => r.detail && r.points <= r.max)).toBe(true);
    expect(hi.reasons.find((r) => r.factor === 'keywords').detail).toMatch(/colour: black.*brand: samsung/);
    expect(Math.abs(hi.reasons.reduce((s, r) => s + r.points, 0) - hi.score)).toBeLessThan(0.2);
  });
  it('is symmetric in argument order and stays within 0..100', () => {
    expect(score(foundSame, lost).score).toBe(score(lost, foundSame).score);
    for (const f of [foundSame, foundOther]) { const s = score(lost, f).score; expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(100); }
  });
  it('date: found before lost scores 0; decays with time', () => {
    const before = score(lost, { ...foundSame, date: day(-5) }).reasons.find((r) => r.factor === 'date');
    expect(before.points).toBe(0);
    const d1 = score(lost, { ...foundSame, date: day(1) }).reasons.find((r) => r.factor === 'date').points;
    const d60 = score(lost, { ...foundSame, date: day(60) }).reasons.find((r) => r.factor === 'date').points;
    expect(d1).toBeGreaterThan(d60);
  });
  it('distance: full within radius, decays beyond', () => {
    const near = score(lost, foundSame, { radiusKm: 2 }).reasons.find((r) => r.factor === 'distance').points;
    const far = score(lost, { ...foundSame, location: { lat: 24.9, lng: 91.0 } }, { radiusKm: 2 }).reasons.find((r) => r.factor === 'distance').points;
    expect(near).toBe(20);
    expect(far).toBeLessThan(2);
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
  });
  it('IDF down-weights common words; matchingService is the swap-in seam', () => {
    const idf = buildIdf([lost, foundSame, foundOther, { title: 'phone', description: 'phone phone' }]);
    expect(idf('phone')).toBeLessThan(idf('cracked'));
    expect(matchingService.score).toBe(score);
  });
});

describe('matching service (events + internal API)', () => {
  let app; let bus;
  const ev = (id, o, x) => ({ id, ownerName: 'N', status: 'open', areaLabel: 'Dhaka', description: x.description, ...x, owner: o, location: { lat: x.location.lat, lng: x.location.lng } });
  const A = '64b000000000000000000001'; const B = '64b000000000000000000002'; const C = '64b000000000000000000003';
  const L = '64c000000000000000000001'; const F1 = '64c000000000000000000002'; const F2 = '64c000000000000000000003'; const F3 = '64c000000000000000000004';
  beforeAll(async () => { await connectMongo(env.MONGO_URL, logger, { autoIndex: false }); });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    bus = createMemoryBus();
    app = createMatchingApp({ env, logger, bus });
    await app.locals.wire();
  });

  it('creates one match above threshold, notifies once, ignores same owner, dedupes on re-save', async () => {
    await bus.publish('item.created', ev(F1, B, foundSame));
    await bus.publish('item.created', ev(F2, C, foundOther));
    await bus.publish('item.created', ev(F3, A, foundSame)); // same owner as the lost item => excluded
    await bus.publish('item.created', ev(L, A, lost));
    const matches = await Match.find({});
    expect(matches).toHaveLength(1);
    expect(matches[0].foundItemId).toBe(F1);
    expect(matches[0].reasons.length).toBe(5);
    expect(bus.published.filter((e) => e.type === 'match.created')).toHaveLength(1);
    await bus.publish('item.created', ev(L, A, lost));
    expect(await Match.countDocuments({})).toBe(1);
    expect(bus.published.filter((e) => e.type === 'match.created')).toHaveLength(1);
  });

  it('internal API requires the service token and is owner-scoped; dismissal is party-only', async () => {
    await bus.publish('item.created', ev(F1, B, foundSame));
    await bus.publish('item.created', ev(L, A, lost));
    expect((await request(app).get(`/internal/matches?itemId=${L}&owner=${A}`)).status).toBe(403);
    expect((await request(app).get(`/internal/matches?itemId=${L}&owner=${C}`).set(T)).status).toBe(403);
    const r = await request(app).get(`/internal/matches?itemId=${L}&owner=${A}`).set(T);
    expect(r.status).toBe(200);
    expect(r.body.matches).toHaveLength(1);
    expect(r.body.matches[0].item.title).toBe('Samsung phone found');
    expect(JSON.stringify(r.body)).not.toMatch(/Owner|owner/); // counterpart identity is not leaked
    const id = r.body.matches[0].id;
    expect((await request(app).post(`/internal/matches/${id}/dismiss`).set(T).send({ owner: C })).status).toBe(403);
    expect((await request(app).post(`/internal/matches/${id}/dismiss`).set(T).send({ owner: A })).status).toBe(200);
    const after = await request(app).get(`/internal/matches?itemId=${L}&owner=${A}`).set(T);
    expect(after.body.matches).toHaveLength(0);
  });

  it('removes projection and matches when an item is deleted; exposes no public routes', async () => {
    await bus.publish('item.created', ev(F1, B, foundSame));
    await bus.publish('item.created', ev(L, A, lost));
    await bus.publish('item.deleted', { id: F1 });
    expect(await Match.countDocuments({})).toBe(0);
    expect((await request(app).get('/matches')).status).toBe(404);
    expect((await request(app).get('/')).status).toBe(404);
  });
});
