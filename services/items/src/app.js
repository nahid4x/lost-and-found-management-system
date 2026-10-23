import { z } from 'zod';
import express from 'express';
import { createBaseApp } from '@findit/shared/app';
import { authenticate, optionalAuth, requireAdmin, internalFetch } from '@findit/shared/tokens';
import { validate, objectId } from '@findit/shared/validate';
import { makeLimiter } from '@findit/shared/ratelimit';
import { imageUpload } from '@findit/shared/upload';
import { notFound, badRequest } from '@findit/shared/errors';
import { plainText, escapeRegex } from '@findit/shared/sanitize';
import { audit } from '@findit/shared/events';
import { trusted } from '@findit/shared/db';
import { Item, CATEGORIES, STATUSES } from './models.js';
import { publicView, viewFor, eventPayload } from './views.js';
import { searchSchema, buildFilter, buildSort } from './search.js';

const text = (min, max) => z.string().transform((s) => plainText(s, max)).pipe(z.string().min(min).max(max));
const now = () => Date.now();

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
}).strict().superRefine((v, ctx) => {
  if (v.type === 'found' && !v.questions) ctx.addIssue({ code: 'custom', path: ['questions'], message: 'found items need 1-3 verification questions' });
  if (v.type === 'lost' && (v.questions || v.heldAt)) ctx.addIssue({ code: 'custom', path: ['questions'], message: 'only found items carry verification questions / heldAt' });
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
      const item = await Item.create({
        type: b.type, title: b.title, description: b.description, category: b.category, date: b.date,
        location: { type: 'Point', coordinates: [b.lng, b.lat] }, areaLabel: b.areaLabel,
        heldAt: b.heldAt, contactNote: b.contactNote, questions: b.questions,
        images: uploaded.map((u) => ({ publicId: u.publicId, url: u.url })),
        owner: req.user.id, ownerName: req.user.name, status: 'open',
        history: [{ from: null, to: 'open', actor: req.user.id, at: new Date() }],
      });
      await publish('item.created', item);
      await audit(bus, 'items', { action: 'item.create', actor: req.user.id, targetType: 'item', targetId: item._id, ip: req.ip });
      res.status(201).json({ item: viewFor(item, req.user) });
    } catch (e) {
      await Promise.all(uploaded.map((u) => storage.destroy(u.publicId)));
      next(e);
    }
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
    await bus.on('claim.created', (p) => Item.findById(p.itemId).then(async (i) => { if (i && ['open', 'matched'].includes(i.status)) { await transition(i, 'claimed', p.claimant); await i.save(); } }));
    await bus.on('claim.reopened', (p) => Item.findById(p.itemId).then(async (i) => { if (i && i.status === 'claimed') { await transition(i, 'open', 'system'); await i.save(); } }));
    await bus.on('claim.approved', (p) => apply(p.itemId, 'verified', p.finder, (i) => { i.approvedClaimant = p.claimant; }));
    await bus.on('claim.returned', async (p) => { await apply(p.itemId, 'returned', p.actor); await apply(p.itemId, 'closed', 'system'); });
  };
  app.locals.wire = wire;
  return finish();
}
