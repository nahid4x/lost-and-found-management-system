import { z } from 'zod';
import express from 'express';
import { createBaseApp } from '@findit/shared/app';
import { authenticate, requireAdmin, internalFetch } from '@findit/shared/tokens';
import { validate, objectId, pagination } from '@findit/shared/validate';
import { makeLimiter } from '@findit/shared/ratelimit';
import { imageUpload } from '@findit/shared/upload';
import { forbidden, notFound, badRequest, conflict, tooMany } from '@findit/shared/errors';
import { plainText } from '@findit/shared/sanitize';
import { trusted } from '@findit/shared/db';
import { Claim, FoundItem, AuditLog } from './models.js';

const idParam = z.object({ id: objectId });
const answer = z.string().transform((s) => plainText(s, 500)).pipe(z.string().min(1).max(500));
const createSchema = z.object({
  itemId: objectId,
  answers: z.preprocess((v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } }, z.array(answer).min(1).max(3)),
}).strict();
const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']) }).strict();
const adminList = pagination.extend({ status: z.enum(['pending', 'approved', 'rejected', 'withdrawn']).optional() });
const auditList = pagination.extend({ action: z.string().trim().max(60).optional(), actor: z.string().trim().max(40).optional() });

export const LIMITS = { activePerUser: 5, pendingPerItem: 10, rejectedWindowHours: 24, rejectedMax: 3 };

const push = (c, to, actor, ip, note) => { c.history.push({ from: c.status, to, actor: String(actor), at: new Date(), ip, note }); c.status = to; };

export function createClaimsApp({ env, logger, bus, redis = null, storage, authUrl = 'http://auth:4001', lookupUser }) {
  const { app, finish } = createBaseApp({ service: 'claims', env, logger, redis });
  const auth = authenticate(env);
  const adminOnly = requireAdmin(lookupUser ?? (async (id) => internalFetch(env, `${authUrl}/internal/users/${id}`)));
  const L = (windowMin, limit, prefix) => makeLimiter({ redis, windowMs: windowMin * 60_000, limit, prefix: `claims:${prefix}`, keyGenerator: (req) => `u:${req.user?.id ?? req.ip}` });
  const createLimit = L(60, 10, 'create');
  const actLimit = L(60, 60, 'act');
  const upload = imageUpload({ maxFiles: 3, maxSizeMb: 5 });

  const record = (entry) => AuditLog.create({ service: 'claims', ...entry, at: new Date() });
  const load = async (id) => { const c = await Claim.findById(id); if (!c) throw notFound('Claim not found'); return c; };
  const party = (c, u) => c.claimant === u.id || c.finder === u.id;

  const claimantView = (c) => ({
    id: String(c._id), itemId: c.itemId, itemTitle: c.itemTitle, status: c.status, createdAt: c.createdAt, decidedAt: c.decidedAt, returnedAt: c.returnedAt,
    finderName: c.status === 'approved' ? c.finderName : undefined, answers: c.answers, proofCount: c.proofImages.length, history: c.history.map(({ from, to, at }) => ({ from, to, at })),
  });
  const finderView = (c) => ({
    id: String(c._id), itemId: c.itemId, itemTitle: c.itemTitle, status: c.status, createdAt: c.createdAt, decidedAt: c.decidedAt, returnedAt: c.returnedAt,
    claimantName: c.claimantName, answers: c.answers, proofUrls: c.proofImages.map((p) => storage.signedPrivateUrl(p.publicId, 300)), history: c.history.map(({ from, to, at }) => ({ from, to, at })),
  });

  // Questions are shown only to a signed-in, non-owner claimant who is about to claim.
  app.get('/questions/:itemId', auth, validate(z.object({ itemId: objectId }), 'params'), async (req, res, next) => {
    try {
      const f = await FoundItem.findOne({ itemId: req.params.itemId });
      if (!f || f.owner === req.user.id || !['open', 'matched', 'claimed'].includes(f.status)) throw notFound('Item not available for claims');
      res.json({ itemId: f.itemId, title: f.title, questions: f.questions });
    } catch (e) { next(e); }
  });

  app.post('/', auth, createLimit, upload.array('proofs', 3), validate(createSchema), async (req, res, next) => {
    const uploaded = [];
    try {
      const { itemId, answers } = req.body;
      const f = await FoundItem.findOne({ itemId });
      if (!f || !['open', 'matched', 'claimed'].includes(f.status)) throw notFound('Item not available for claims');
      if (f.owner === req.user.id) throw forbidden('You cannot claim your own item');
      if (answers.length !== f.questions.length) throw badRequest('Answer every verification question');
      // abuse limits
      const since = new Date(Date.now() - LIMITS.rejectedWindowHours * 3600_000);
      const [active, rejectedRecently, pendingOnItem] = await Promise.all([
        Claim.countDocuments({ claimant: req.user.id, status: 'pending' }),
        Claim.countDocuments({ claimant: req.user.id, status: 'rejected', decidedAt: trusted({ $gte: since }) }),
        Claim.countDocuments({ itemId, status: 'pending' }),
      ]);
      if (rejectedRecently >= LIMITS.rejectedMax) throw tooMany('Too many rejected claims recently. Try again later.');
      if (active >= LIMITS.activePerUser) throw tooMany('You have too many open claims');
      if (pendingOnItem >= LIMITS.pendingPerItem) throw tooMany('This item has too many pending claims');
      if (await Claim.exists({ itemId, claimant: req.user.id })) throw conflict('You already submitted a claim for this item', 'already_claimed');
      for (const file of req.files ?? []) uploaded.push(await storage.uploadPrivate(file.buffer));
      const c = await Claim.create({
        itemId, itemTitle: f.title, finder: f.owner, finderName: f.ownerName, claimant: req.user.id, claimantName: req.user.name,
        questions: f.questions, answers: answers.map((a, i) => ({ question: f.questions[i], answer: a })),
        proofImages: uploaded.map((u) => ({ publicId: u.publicId })), status: 'pending',
        history: [{ from: null, to: 'pending', actor: req.user.id, at: new Date(), ip: req.ip }],
      });
      await record({ action: 'claim.create', actor: req.user.id, targetType: 'claim', targetId: String(c._id), ip: req.ip });
      await bus.publish('claim.created', { claimId: String(c._id), itemId, itemTitle: f.title, claimant: req.user.id, claimantName: req.user.name, finder: f.owner });
      res.status(201).json({ claim: claimantView(c) });
    } catch (e) { await Promise.all(uploaded.map((u) => storage.destroy(u.publicId, 'authenticated'))); next(e); }
  });

  // NEW: claims the user removed from their own list (hiddenBy) are skipped.
  app.get('/mine', auth, async (req, res, next) => {
    try { res.json({ claims: (await Claim.find({ claimant: req.user.id, hiddenBy: trusted({ $ne: req.user.id }) }).sort({ createdAt: -1 }).limit(100)).map(claimantView) }); } catch (e) { next(e); }
  });
  // NEW: same filter for the finder's list.
  app.get('/received', auth, async (req, res, next) => {
    try { res.json({ claims: (await Claim.find({ finder: req.user.id, hiddenBy: trusted({ $ne: req.user.id }) }).sort({ createdAt: -1 }).limit(100)).map(finderView) }); } catch (e) { next(e); }
  });
  app.get('/:id', auth, validate(idParam, 'params'), async (req, res, next) => {
    try {
      const c = await load(req.params.id);
      if (!party(c, req.user)) throw notFound('Claim not found'); // no confirmation that it exists
      res.json({ claim: c.finder === req.user.id ? finderView(c) : claimantView(c) });
    } catch (e) { next(e); }
  });

  app.post('/:id/decision', auth, actLimit, validate(idParam, 'params'), validate(decisionSchema), async (req, res, next) => {
    try {
      const c = await load(req.params.id);
      if (c.finder !== req.user.id) throw notFound('Claim not found');
      if (c.status !== 'pending') throw conflict('Claim already decided', 'already_decided');
      const base = { claimId: String(c._id), itemId: c.itemId, itemTitle: c.itemTitle, finder: c.finder, finderName: c.finderName, claimant: c.claimant, claimantName: c.claimantName };
      if (req.body.decision === 'approve') {
        push(c, 'approved', req.user.id, req.ip); c.decisionBy = req.user.id; c.decidedAt = new Date();
        await c.save();
        await record({ action: 'claim.approve', actor: req.user.id, targetType: 'claim', targetId: String(c._id), ip: req.ip });
        await bus.publish('claim.approved', base);
        for (const o of await Claim.find({ itemId: c.itemId, status: 'pending', claimant: trusted({ $ne: c.claimant }) })) {
          push(o, 'rejected', req.user.id, req.ip, 'another claim approved'); o.decisionBy = req.user.id; o.decidedAt = new Date(); await o.save();
          await bus.publish('claim.rejected', { claimId: String(o._id), itemId: o.itemId, itemTitle: o.itemTitle, finder: o.finder, claimant: o.claimant, claimantName: o.claimantName });
        }
      } else {
        push(c, 'rejected', req.user.id, req.ip); c.decisionBy = req.user.id; c.decidedAt = new Date();
        await c.save();
        await record({ action: 'claim.reject', actor: req.user.id, targetType: 'claim', targetId: String(c._id), ip: req.ip });
        await bus.publish('claim.rejected', base);
        if (!(await Claim.exists({ itemId: c.itemId, status: trusted({ $in: ['pending', 'approved'] }) }))) await bus.publish('claim.reopened', { itemId: c.itemId });
      }
      res.json({ claim: finderView(c) });
    } catch (e) { next(e); }
  });

  app.post('/:id/withdraw', auth, actLimit, validate(idParam, 'params'), async (req, res, next) => {
    try {
      const c = await load(req.params.id);
      if (c.claimant !== req.user.id) throw notFound('Claim not found');
      if (c.status !== 'pending') throw conflict('Only pending claims can be withdrawn');
      push(c, 'withdrawn', req.user.id, req.ip); await c.save();
      await record({ action: 'claim.withdraw', actor: req.user.id, targetType: 'claim', targetId: String(c._id), ip: req.ip });
      if (!(await Claim.exists({ itemId: c.itemId, status: trusted({ $in: ['pending', 'approved'] }) }))) await bus.publish('claim.reopened', { itemId: c.itemId });
      res.json({ claim: claimantView(c) });
    } catch (e) { next(e); }
  });

  // After the physical handover, either party marks the item returned; the item then closes.
  app.post('/:id/returned', auth, actLimit, validate(idParam, 'params'), async (req, res, next) => {
    try {
      const c = await load(req.params.id);
      if (!party(c, req.user)) throw notFound('Claim not found');
      if (c.status !== 'approved' || c.returnedAt) throw conflict('Claim is not awaiting return');
      c.returnedAt = new Date(); c.returnedBy = req.user.id;
      c.history.push({ from: 'approved', to: 'returned', actor: req.user.id, at: c.returnedAt, ip: req.ip });
      await c.save();
      await record({ action: 'claim.returned', actor: req.user.id, targetType: 'claim', targetId: String(c._id), ip: req.ip });
      await bus.publish('claim.returned', { claimId: String(c._id), itemId: c.itemId, itemTitle: c.itemTitle, actor: req.user.id, finder: c.finder, claimant: c.claimant });
      res.json({ claim: c.finder === req.user.id ? finderView(c) : claimantView(c) });
    } catch (e) { next(e); }
  });

  // NEW: remove a FINISHED claim from the caller's own list (soft delete).
  // The other party and the audit trail keep it.
  app.post('/:id/hide', auth, actLimit, validate(idParam, 'params'), async (req, res, next) => {
    try {
      const c = await load(req.params.id);
      if (!party(c, req.user)) throw notFound('Claim not found');
      const ended = ['rejected', 'withdrawn'].includes(c.status) || Boolean(c.returnedAt);
      if (!ended) throw conflict('Only finished claims can be removed from your list');
      c.hiddenBy.addToSet(req.user.id);
      await c.save();
      await record({ action: 'claim.hide', actor: req.user.id, targetType: 'claim', targetId: String(c._id), ip: req.ip });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---------- Admin ----------
  const admin = express.Router();
  admin.use(auth, adminOnly);
  admin.get('/claims', validate(adminList, 'query'), async (req, res, next) => {
    try {
      const q = req.query; const f = q.status ? { status: q.status } : {};
      const [docs, total] = await Promise.all([Claim.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit), Claim.countDocuments(f)]);
      res.json({ claims: docs.map((c) => ({ ...finderView(c), finderName: c.finderName, claimant: c.claimant, finder: c.finder })), total, page: q.page, limit: q.limit });
    } catch (e) { next(e); }
  });
  admin.patch('/claims/:id', validate(idParam, 'params'), validate(z.object({ status: z.literal('rejected') }).strict()), async (req, res, next) => {
    try {
      const c = await load(req.params.id);
      if (c.status !== 'pending') throw conflict('Only pending claims can be rejected by an admin');
      push(c, 'rejected', req.user.id, req.ip, 'admin'); c.decisionBy = req.user.id; c.decidedAt = new Date(); await c.save();
      await record({ action: 'admin.claim_reject', actor: req.user.id, targetType: 'claim', targetId: String(c._id), ip: req.ip });
      await bus.publish('claim.rejected', { claimId: String(c._id), itemId: c.itemId, itemTitle: c.itemTitle, finder: c.finder, claimant: c.claimant, claimantName: c.claimantName });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  admin.get('/audit', validate(auditList, 'query'), async (req, res, next) => {
    try {
      const q = req.query; const f = {};
      if (q.action) f.action = q.action;
      if (q.actor) f.actor = q.actor;
      const [rows, total] = await Promise.all([AuditLog.find(f).sort({ at: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), AuditLog.countDocuments(f)]);
      res.json({ entries: rows.map((r) => ({ id: String(r._id), service: r.service, action: r.action, actor: r.actor, targetType: r.targetType, targetId: r.targetId, ip: r.ip, at: r.at })), total, page: q.page, limit: q.limit });
    } catch (e) { next(e); }
  });
  admin.get('/stats', async (_req, res, next) => {
    try {
      const [pending, approved, rejected, withdrawn] = await Promise.all(['pending', 'approved', 'rejected', 'withdrawn'].map((s) => Claim.countDocuments({ status: s })));
      res.json({ pending, approved, rejected, withdrawn, total: pending + approved + rejected + withdrawn });
    } catch (e) { next(e); }
  });
  app.use('/admin', admin);

  // ---------- Event consumers ----------
  const wire = async () => {
    const upsert = (p) => (p.type === 'found' && p.questions?.length
      ? FoundItem.updateOne({ itemId: p.id }, { $set: { owner: p.owner, ownerName: p.ownerName, title: p.title, status: p.status, questions: p.questions } }, { upsert: true })
      : null);
    await bus.on('item.created', upsert);
    await bus.on('item.updated', upsert);
    await bus.on('item.deleted', async (p) => {
      await FoundItem.deleteOne({ itemId: p.id });
      for (const c of await Claim.find({ itemId: p.id, status: 'pending' })) { push(c, 'withdrawn', 'system', null, 'item removed'); await c.save(); }
    });
    await bus.on('audit.record', (p) => AuditLog.create({ ...p, at: new Date() }));
  };
  app.locals.wire = wire;
  return finish();
}