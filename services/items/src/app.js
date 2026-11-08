import { z } from 'zod';
import express from 'express';
import { createBaseApp } from '@findit/shared/app';
import { authenticate, optionalAuth, requireAdmin, internalFetch, internalOnly } from '@findit/shared/tokens';
import { validate, objectId } from '@findit/shared/validate';
import { makeLimiter } from '@findit/shared/ratelimit';
import { imageUpload } from '@findit/shared/upload';
import { notFound, badRequest, conflict } from '@findit/shared/errors';
import { plainText, escapeRegex } from '@findit/shared/sanitize';
import { audit } from '@findit/shared/events';
import { trusted } from '@findit/shared/db';
import crypto from 'node:crypto';
import { parseNumber } from '@findit/shared/verification';
import { Item, ItemSecret, CATEGORIES, STATUSES } from './models.js';
import { publicView, viewFor, eventPayload } from './views.js';
import { searchSchema, buildFilter, buildSort } from './search.js';

const text = (min, max) => z.string().transform((s) => plainText(s, max)).pipe(z.string().min(min).max(max));
const now = () => Date.now();

const jsonArray = (schema, max) => z.preprocess((v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } }, z.array(schema).min(1).max(max));
const entrySchema = z.object({
  question: text(3, 200), answer: text(1, 200),
  type: z.enum(['text', 'number', 'descriptive']).default('text'),
  weight: z.coerce.number().int().min(1).max(5).default(1),
  tolerance: z.coerce.number().min(0).max(1e9).optional(),
}).strict().superRefine((e, ctx) => {
  if (e.type === 'number' && Number.isNaN(parseNumber(e.answer))) ctx.addIssue({ code: 'custom', path: ['answer'], message: 'number questions need a numeric answer' });
  if (e.tolerance && e.type !== 'number') ctx.addIssue({ code: 'custom', path: ['tolerance'], message: 'a tolerance only applies to number questions' });
});
const noDuplicates = (list, ctx) => {
  const seen = new Set();
  for (const e of list) { const k = e.question.toLowerCase(); if (seen.has(k)) ctx.addIssue({ code: 'custom', message: 'duplicate question' }); seen.add(k); }
};
const entriesSchema = jsonArray(entrySchema, 10).superRefine(noDuplicates);
const verificationBody = z.object({ verification: z.array(entrySchema).max(10).superRefine(noDuplicates) }).strict();

const createSchema = z.object({
  type: z.enum(['lost', 'found']),
  title: text(3, 100),
  description: text(10, 2000),
  category: z.enum(CATEGORIES),
  date: z.coerce.date().refine((d) => d.getTime() <= now() + 86_400_000 && d.getTime() >= now() - 2 * 365 * 86_400_000, 'date out of range'),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  areaLabel: text(2, 80),
  heldAt: text(2, 200).optional(),
  contactNote: text(2, 200).optional(),
  questions: z.preprocess((v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } }, z.array(text(3, 200)).min(1).max(3)).optional(),
  verification: entriesSchema.optional(), // private questions + answers (optional); answers are stored separately
}).strict().superRefine((v, ctx) => {
  if (v.type === 'lost' && (v.questions || v.verification || v.heldAt)) ctx.addIssue({ code: 'custom', path: ['verification'], message: 'only found items carry verification questions / heldAt' });
  if (v.questions && v.verification) ctx.addIssue({ code: 'custom', path: ['verification'], message: 'send either questions or verification, not both' });
});
const patchSchema = z.object({ title: text(3, 100).optional(), description: text(10, 2000).optional(), contactNote: text(2, 200).optional(), heldAt: text(2, 200).optional() }).strict().refine((v) => Object.keys(v).length > 0);
const idParam = z.object({ id: objectId });
// eslint-disable-next-line security/detect-unsafe-regex -- fixed repetition ({3}) on input capped at 80 chars: no catastrophic backtracking
const mapQuery = z.object({ type: z.enum(['lost', 'found']).optional(), category: z.enum(CATEGORIES).optional(), bbox: z.string().max(80).regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/).optional() });
const adminList = z.object({ q: z.string().trim().max(80).optional(), status: z.enum(STATUSES).optional(), page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });
const adminPatch = z.object({ hidden: z.boolean().optional(), status: z.enum(STATUSES).optional() }).strict().refine((v) => Object.keys(v).length > 0);

const FORWARD = { open: ['matched', 'claimed', 'closed'], matched: ['claimed', 'closed', 'open'], claimed: ['open', 'matched', 'verified', 'closed'], verified: ['returned', 'closed'], returned: ['closed'], closed: [] };

export async function transition(item, to, actor, { force = false } = {}) {
  if (item.status === to) return false;
  if (!force && !FORWARD[item.status]?.includes(to)) return false;
  item.history.push({ from: item.status, to, actor: String(actor), at: new Date() });
  item.status = to;
  return true;
}

export function createItemsApp({ env, logger, bus, redis = null, storage, matchingUrl = 'http://matching:4003', authUrl = 'http://auth:4001', lookupUser }) {
  const { app, finish } = createBaseApp({ service: 'items', env, logger, redis });
  const auth = authenticate(env);
  const maybeAuth = optionalAuth(env);
  const adminOnly = requireAdmin(lookupUser ?? (async (id) => internalFetch(env, `${authUrl}/internal/users/${id}`)));
  const L = (windowMin, limit, prefix, keyGenerator) => makeLimiter({ redis, windowMs: windowMin * 60_000, limit, prefix: `items:${prefix}`, keyGenerator });
  const searchLimit = L(1, 90, 'search');
  const createLimit = L(60 * 24, 10, 'create', (req) => `u:${req.user?.id}`);
  const upload = imageUpload({ maxFiles: 5, maxSizeMb: 5 });

  const publish = (type, item) => bus.publish(type, eventPayload(item));
  const load = async (id) => { const i = await Item.findById(id); if (!i) throw notFound('Item not found'); return i; };
  const canSee = (i, u) => !i.hidden || u?.role === 'admin' || u?.id === i.owner;

  // ---------- Public ----------
  app.get('/stats', async (_req, res, next) => {
    try {
      const [reported, recovered, openLost, openFound] = await Promise.all([
        Item.countDocuments({ hidden: false }),
        Item.countDocuments({ hidden: false, 'history.to': 'returned' }),
        Item.countDocuments({ hidden: false, type: 'lost', status: trusted({ $in: ['open', 'matched', 'claimed'] }) }),
        Item.countDocuments({ hidden: false, type: 'found', status: trusted({ $in: ['open', 'matched', 'claimed'] }) }),
      ]);
      res.json({ reported, recovered, openLost, openFound });
    } catch (e) { next(e); }
  });

  app.get('/map', searchLimit, validate(mapQuery, 'query'), async (req, res, next) => {
    try {
      const f = { hidden: false, status: trusted({ $in: ['open', 'matched', 'claimed'] }) };
      if (req.query.type) f.type = req.query.type;
      if (req.query.category) f.category = req.query.category;
      if (req.query.bbox) {
        const [w, s, e, n] = req.query.bbox.split(',').map(Number);
        f.location = trusted({ $geoWithin: { $box: [[w, s], [e, n]] } });
      }
      const docs = await Item.find(f).select('type title category status location areaLabel').sort({ createdAt: -1 }).limit(500);
      res.json({ items: docs.map((d) => ({ id: String(d._id), type: d.type, title: d.title, category: d.category, status: d.status, area: d.areaLabel, lat: Math.round(d.location.coordinates[1] * 100) / 100, lng: Math.round(d.location.coordinates[0] * 100) / 100 })) });
    } catch (e) { next(e); }
  });

  app.get('/', searchLimit, validate(searchSchema, 'query'), async (req, res, next) => {
    try {
      const q = req.query;
      const filter = buildFilter(q);
      const [docs, total] = await Promise.all([
        Item.find(filter).sort(buildSort(q)).skip((q.page - 1) * q.limit).limit(q.limit),
        Item.countDocuments(filter),
      ]);
      res.json({ items: docs.map(publicView), total, page: q.page, limit: q.limit });
    } catch (e) { next(e); }
  });

  // ---------- Authenticated ----------
  app.get('/mine', auth, async (req, res, next) => {
    try {
      const docs = await Item.find({ owner: req.user.id }).sort({ createdAt: -1 }).limit(100);
      res.json({ items: docs.map((d) => viewFor(d, req.user)) });
    } catch (e) { next(e); }
  });

  app.post('/', auth, createLimit, upload.array('images', 5), validate(createSchema), async (req, res, next) => {
    const uploaded = [];
    try {
      const b = req.body;
      for (const f of req.files ?? []) uploaded.push(await storage.uploadPublic(f.buffer));
      const withIds = (b.verification ?? []).map((e) => ({ ...e, id: crypto.randomUUID().slice(0, 8) }));
      const item = await Item.create({
        type: b.type, title: b.title, description: b.description, category: b.category, date: b.date,
        location: { type: 'Point', coordinates: [b.lng, b.lat] }, areaLabel: b.areaLabel,
        heldAt: b.heldAt, contactNote: b.contactNote, questions: withIds.length ? withIds.map((e) => e.question) : b.questions,
        verificationMeta: withIds.length ? withIds.map(({ id, question, type, weight }) => ({ id, question, type, weight })) : undefined,
        images: uploaded.map((u) => ({ publicId: u.publicId, url: u.url })),
        owner: req.user.id, ownerName: req.user.name, status: 'open',
        history: [{ from: null, to: 'open', actor: req.user.id, at: new Date() }],
      });
      if (withIds.length) {
        try { await ItemSecret.create({ itemId: String(item._id), owner: req.user.id, entries: withIds.map((e) => ({ id: e.id, answer: e.answer, tolerance: e.tolerance })) }); }
        catch (err) { await item.deleteOne(); throw err; } // never leave a question without its protected answer record
      }
      await publish('item.created', item);
      await audit(bus, 'items', { action: 'item.create', actor: req.user.id, targetType: 'item', targetId: item._id, ip: req.ip });
      res.status(201).json({ item: viewFor(item, req.user) });
    } catch (e) {
      await Promise.all(uploaded.map((u) => storage.destroy(u.publicId)));
      next(e);
    }
  });

  // ---- private verification: owner-only (admins deliberately get 404 too), plus a service-token-only endpoint for scoring ----
  const ownerFoundItem = async (id, user) => {
    const i = await load(id);
    if (i.owner !== user.id || i.type !== 'found') throw notFound('Item not found');
    return i;
  };
  const merge = (meta, secret) => {
    const byId = new Map((secret?.entries ?? []).map((e) => [e.id, e]));
    return (meta ?? []).map((m) => ({ id: m.id, question: m.question, type: m.type, weight: m.weight, answer: byId.get(m.id)?.answer ?? '', tolerance: byId.get(m.id)?.tolerance ?? null }));
  };
  app.get('/:id/verification', auth, validate(idParam, 'params'), async (req, res, next) => {
    try {
      const i = await ownerFoundItem(req.params.id, req.user);
      res.json({ verification: merge(i.verificationMeta, await ItemSecret.findOne({ itemId: String(i._id) })), locked: (i.claimsCount ?? 0) > 0 });
    } catch (e) { next(e); }
  });
  app.put('/:id/verification', auth, validate(idParam, 'params'), validate(verificationBody), async (req, res, next) => {
    try {
      const i = await ownerFoundItem(req.params.id, req.user);
      // Locked once anyone has claimed: the owner must not be able to tailor answers to a particular claimant.
      if ((i.claimsCount ?? 0) > 0) throw conflict('Verification questions are locked once a claim exists', 'verification_locked');
      if (['verified', 'returned', 'closed'].includes(i.status)) throw badRequest('This report is closed');
      const withIds = req.body.verification.map((e) => ({ ...e, id: crypto.randomUUID().slice(0, 8) }));
      i.verificationMeta = withIds.length ? withIds.map(({ id, question, type, weight }) => ({ id, question, type, weight })) : undefined;
      i.questions = withIds.length ? withIds.map((e) => e.question) : undefined;
      await i.save();
      if (withIds.length) await ItemSecret.updateOne({ itemId: String(i._id) }, { $set: { owner: i.owner, entries: withIds.map((e) => ({ id: e.id, answer: e.answer, tolerance: e.tolerance })) } }, { upsert: true });
      else await ItemSecret.deleteOne({ itemId: String(i._id) });
      await publish('item.updated', i);
      await audit(bus, 'items', { action: 'item.verification_update', actor: req.user.id, targetType: 'item', targetId: i._id, ip: req.ip, meta: { questions: withIds.length } });
      res.json({ verification: withIds, locked: false });
    } catch (e) { next(e); }
  });
  app.get('/internal/items/:id/verification', internalOnly(env), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const i = await load(req.params.id);
      res.json({ itemId: String(i._id), owner: i.owner, entries: merge(i.verificationMeta, await ItemSecret.findOne({ itemId: String(i._id) })) });
    } catch (e) { next(e); }
  });

  app.get('/:id', maybeAuth, validate(idParam, 'params'), async (req, res, next) => {
    try {
      const i = await load(req.params.id);
      if (!canSee(i, req.user)) throw notFound('Item not found');
      res.json({ item: viewFor(i, req.user) });
    } catch (e) { next(e); }
  });

  app.patch('/:id', auth, validate(idParam, 'params'), validate(patchSchema), async (req, res, next) => {
    try {
      const i = await load(req.params.id);
      if (i.owner !== req.user.id) throw notFound('Item not found'); // 404, never confirm others' resources
      if (['returned', 'closed'].includes(i.status)) throw badRequest('Item is closed');
      if (req.body.heldAt && i.type !== 'found') throw badRequest('heldAt is only for found items');
      Object.assign(i, req.body); // whitelist enforced by strict zod schema
      await i.save();
      await publish('item.updated', i);
      res.json({ item: viewFor(i, req.user) });
    } catch (e) { next(e); }
  });

  app.post('/:id/close', auth, validate(idParam, 'params'), async (req, res, next) => {
    try {
      const i = await load(req.params.id);
      if (i.owner !== req.user.id) throw notFound('Item not found');
      if (i.status === 'verified') throw badRequest('Complete or return the claim first');
      if (await transition(i, 'closed', req.user.id)) await i.save();
      await publish('item.updated', i);
      await audit(bus, 'items', { action: 'item.close', actor: req.user.id, targetType: 'item', targetId: i._id, ip: req.ip });
      res.json({ item: viewFor(i, req.user) });
    } catch (e) { next(e); }
  });

  // AI match suggestions come from the Matching service (internal only), filtered to the owner.
  app.get('/:id/matches', auth, validate(idParam, 'params'), async (req, res, next) => {
    try {
      const i = await load(req.params.id);
      if (i.owner !== req.user.id) throw notFound('Item not found');
      const data = await internalFetch(env, `${matchingUrl}/internal/matches?itemId=${i._id}&owner=${req.user.id}`);
      res.json(data);
    } catch (e) { next(e); }
  });
  app.post('/:id/matches/:matchId/dismiss', auth, validate(z.object({ id: objectId, matchId: objectId }), 'params'), async (req, res, next) => {
    try {
      const i = await load(req.params.id);
      if (i.owner !== req.user.id) throw notFound('Item not found');
      res.json(await internalFetch(env, `${matchingUrl}/internal/matches/${req.params.matchId}/dismiss`, { method: 'POST', body: { owner: req.user.id } }));
    } catch (e) { next(e); }
  });

  // ---------- Admin ----------
  const admin = express.Router();
  admin.use(auth, adminOnly);
  admin.get('/items', validate(adminList, 'query'), async (req, res, next) => {
    try {
      const q = req.query;
      const f = {};
      if (q.status) f.status = q.status;
      // eslint-disable-next-line security/detect-non-literal-regexp -- user input is passed through escapeRegex()
      if (q.q) f.$or = [{ title: new RegExp(escapeRegex(q.q), 'i') }, { areaLabel: new RegExp(escapeRegex(q.q), 'i') }];
      const [docs, total] = await Promise.all([Item.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit), Item.countDocuments(f)]);
      res.json({ items: docs.map((d) => viewFor(d, { id: 'admin', role: 'admin' })), total, page: q.page, limit: q.limit });
    } catch (e) { next(e); }
  });
  admin.patch('/items/:id', validate(idParam, 'params'), validate(adminPatch), async (req, res, next) => {
    try {
      const i = await load(req.params.id);
      if (req.body.hidden !== undefined) i.hidden = req.body.hidden;
      if (req.body.status) await transition(i, req.body.status, req.user.id, { force: true });
      await i.save();
      await publish('item.updated', i);
      await audit(bus, 'items', { action: 'admin.item_update', actor: req.user.id, targetType: 'item', targetId: i._id, ip: req.ip, meta: req.body });
      res.json({ item: viewFor(i, { id: 'admin', role: 'admin' }) });
    } catch (e) { next(e); }
  });
  admin.delete('/items/:id', validate(idParam, 'params'), async (req, res, next) => {
    try {
      const i = await load(req.params.id);
      await Promise.all((i.images ?? []).map((x) => storage.destroy(x.publicId)));
      await i.deleteOne();
      await ItemSecret.deleteOne({ itemId: String(i._id) });
      await bus.publish('item.deleted', { id: String(i._id) });
      await audit(bus, 'items', { action: 'admin.item_delete', actor: req.user.id, targetType: 'item', targetId: i._id, ip: req.ip });
      res.status(204).end();
    } catch (e) { next(e); }
  });
  admin.get('/stats', async (_req, res, next) => {
    try {
      const by = await Item.aggregate([{ $group: { _id: { type: '$type', status: '$status' }, n: { $sum: 1 } } }]);
      const total = by.reduce((a, b) => a + b.n, 0);
      res.json({ total, breakdown: by.map((b) => ({ type: b._id.type, status: b._id.status, count: b.n })) });
    } catch (e) { next(e); }
  });
  app.use('/admin', admin);

  // ---------- Event consumers: item status is owned here ----------
  const apply = async (id, to, actor, mutate) => {
    const i = await Item.findById(id);
    if (!i) return;
    const changed = await transition(i, to, actor, { force: true });
    mutate?.(i);
    if (changed || mutate) { await i.save(); await publish('item.updated', i); }
  };
  const wire = async () => {
    await bus.on('match.created', async (p) => {
      for (const id of [p.lostItemId, p.foundItemId]) { const i = await Item.findById(id); if (i?.status === 'open') { await transition(i, 'matched', 'system'); await i.save(); } }
    });
    await bus.on('claim.created', async (p) => {
      await Item.updateOne({ _id: p.itemId }, { $inc: { claimsCount: 1 } }); // freezes the verification questions
      const i = await Item.findById(p.itemId);
      if (i && ['open', 'matched'].includes(i.status)) { await transition(i, 'claimed', p.claimant); await i.save(); }
    });
    await bus.on('claim.reopened', (p) => Item.findById(p.itemId).then(async (i) => { if (i && i.status === 'claimed') { await transition(i, 'open', 'system'); await i.save(); } }));
    await bus.on('claim.approved', (p) => apply(p.itemId, 'verified', p.finder, (i) => { i.approvedClaimant = p.claimant; }));
    await bus.on('claim.returned', async (p) => { await apply(p.itemId, 'returned', p.actor); await apply(p.itemId, 'closed', 'system'); });
  };
  app.locals.wire = wire;
  return finish();
}
