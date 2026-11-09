import { z } from 'zod';
import { createBaseApp } from '@findit/shared/app';
import { authenticate, internalFetch } from '@findit/shared/tokens';
import { validate, objectId, pagination } from '@findit/shared/validate';
import { notFound } from '@findit/shared/errors';
import { trusted } from '@findit/shared/db';
import { plainText } from '@findit/shared/sanitize';
import { Notification, Preference, notifView, prefView } from './models.js';
import { renderEmail } from './mailer.js';

const listQuery = pagination.extend({ unread: z.enum(['true', 'false']).optional() });
const readBody = z.union([z.object({ all: z.literal(true) }).strict(), z.object({ ids: z.array(objectId).min(1).max(100) }).strict()]);
const flag = z.object({ match: z.boolean(), claim: z.boolean(), message: z.boolean() }).strict();
const prefBody = z.object({ inApp: flag.partial().optional(), email: flag.partial().optional(), emailWhenOnline: z.boolean().optional() }).strict().refine((v) => Object.keys(v).length > 0);

export function createNotifyApp({ env, logger, bus, redis = null, mailer, isOnline, getContact, authUrl = 'http://auth:4001' }) {
  const { app, finish } = createBaseApp({ service: 'notify', env, logger, redis });
  const auth = authenticate(env);
  const contact = getContact ?? ((id) => internalFetch(env, `${authUrl}/internal/users/${id}`));
  const online = isOnline ?? (async (id) => Number(await redis?.get(`presence:${id}`)) > 0);
  const appUrl = env.APP_URL.replace(/\/$/, '');

  const prefsFor = async (user) => (await Preference.findOne({ user })) ?? new Preference({ user });

  /** Stores + pushes the in-app notification, then emails according to preferences and presence. */
  async function deliver(user, { type, title, body, payload, link }) {
    const prefs = await prefsFor(user);
    if (prefs.inApp[type] !== false) {
      const n = await Notification.create({ user, type, title: plainText(title, 140), body: plainText(body, 300), payload });
      await bus.publish('notification.push', { user, notification: notifView(n) });
    }
    if (prefs.email[type] === false) return;
    if (!prefs.emailWhenOnline && (await online(user))) return;
    try {
      const c = await contact(user);
      const mail = renderEmail({ heading: title, lines: [body], cta: { label: 'Open FindIt', url: `${appUrl}${link ?? '/notifications'}` } });
      await mailer.send({ to: c.email, subject: `FindIt: ${title}`, ...mail });
    } catch (err) { logger.error('email delivery failed', { type, err }); }
  }

  // ---------- REST ----------
  app.get('/notifications', auth, validate(listQuery, 'query'), async (req, res, next) => {
    try {
      const q = req.query; const f = { user: req.user.id };
      if (q.unread === 'true') f.readAt = null;
      const [docs, total, unread] = await Promise.all([
        Notification.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
        Notification.countDocuments(f), Notification.countDocuments({ user: req.user.id, readAt: null }),
      ]);
      res.json({ items: docs.map(notifView), total, unread, page: q.page, limit: q.limit });
    } catch (e) { next(e); }
  });
  app.get('/notifications/unread-count', auth, async (req, res, next) => {
    try { res.json({ unread: await Notification.countDocuments({ user: req.user.id, readAt: null }) }); } catch (e) { next(e); }
  });
  app.post('/notifications/read', auth, validate(readBody), async (req, res, next) => {
    try {
      const f = { user: req.user.id, readAt: null }; // scoped to the caller: other users' ids are simply ignored
      if (req.body.ids) f._id = trusted({ $in: req.body.ids });
      const r = await Notification.updateMany(f, { readAt: new Date() });
      res.json({ updated: r.modifiedCount });
    } catch (e) { next(e); }
  });
  app.get('/preferences', auth, async (req, res, next) => { try { res.json({ preferences: prefView(await prefsFor(req.user.id)) }); } catch (e) { next(e); } });
  app.put('/preferences', auth, validate(prefBody), async (req, res, next) => {
    try {
      const set = {};
      for (const g of ['inApp', 'email']) for (const [k, v] of Object.entries(req.body[g] ?? {})) set[`${g}.${k}`] = v;
      if (req.body.emailWhenOnline !== undefined) set.emailWhenOnline = req.body.emailWhenOnline;
      await Preference.updateOne({ user: req.user.id }, { $set: set, $setOnInsert: { user: req.user.id } }, { upsert: true });
      res.json({ preferences: prefView(await prefsFor(req.user.id)) });
    } catch (e) { next(e); }
  });
  app.delete('/notifications/:id', auth, validate(z.object({ id: objectId }), 'params'), async (req, res, next) => {
    try {
      const r = await Notification.deleteOne({ _id: req.params.id, user: req.user.id });
      if (!r.deletedCount) throw notFound();
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // ---------- Event consumers (Notify never decides *who* is involved; producers say so) ----------
  const wire = async () => {
    await bus.on('match.created', async (p) => {
      await deliver(p.lostOwner, { type: 'match', title: 'Possible match for your lost item', body: `"${p.foundTitle}" looks ${Math.round(p.score)}% similar to "${p.lostTitle}".`, payload: { matchId: p.matchId, itemId: p.lostItemId, otherItemId: p.foundItemId, score: p.score }, link: `/items/${p.lostItemId}` });
      await deliver(p.foundOwner, { type: 'match', title: 'Someone may be looking for this', body: `Your found item "${p.foundTitle}" may match "${p.lostTitle}" (${Math.round(p.score)}%).`, payload: { matchId: p.matchId, itemId: p.foundItemId, otherItemId: p.lostItemId, score: p.score }, link: `/items/${p.foundItemId}` });
    });
    await bus.on('claim.created', (p) => deliver(p.finder, { type: 'claim', title: 'New claim on your found item', body: `${p.claimantName} submitted a claim for "${p.itemTitle}".${p.score != null ? ` Ownership verification: ${p.score}% match (review before approving).` : ''}`, payload: { claimId: p.claimId, itemId: p.itemId }, link: '/claims' }));
    await bus.on('claim.info_requested', (p) => deliver(p.claimant, { type: 'claim', title: 'More information requested', body: `The finder of "${p.itemTitle}" asked for more information about your claim.`, payload: { claimId: p.claimId, itemId: p.itemId }, link: '/claims' }));
    await bus.on('claim.info_provided', (p) => deliver(p.finder, { type: 'claim', title: 'Claimant added information', body: `${p.claimantName} sent more information for "${p.itemTitle}".`, payload: { claimId: p.claimId, itemId: p.itemId }, link: '/claims' }));
    await bus.on('claim.approved', (p) => deliver(p.claimant, { type: 'claim', title: 'Your claim was approved', body: `${p.finderName} approved your claim for "${p.itemTitle}". You can now chat to arrange the handover.`, payload: { claimId: p.claimId, itemId: p.itemId }, link: '/messages' }));
    await bus.on('claim.rejected', (p) => deliver(p.claimant, { type: 'claim', title: 'Your claim was not approved', body: `Your claim for "${p.itemTitle}" was not approved.`, payload: { claimId: p.claimId, itemId: p.itemId }, link: '/claims' }));
    await bus.on('claim.returned', (p) => deliver(p.actor === p.finder ? p.claimant : p.finder, { type: 'claim', title: 'Item marked as returned', body: `"${p.itemTitle}" was marked as returned. Case closed.`, payload: { claimId: p.claimId, itemId: p.itemId }, link: `/items/${p.itemId}` }));
    // Messages only notify users who are offline (online users see the message live).
    await bus.on('message.created', async (p) => {
      if (await online(p.recipient)) return;
      await deliver(p.recipient, { type: 'message', title: `New message from ${p.senderName}`, body: 'Open FindIt to read and reply.', payload: { conversationId: p.conversationId }, link: '/messages' });
    });
    await bus.on('auth.email_token', async (p) => {
      const verify = p.kind === 'verify';
      const mail = renderEmail({
        heading: verify ? 'Confirm your email' : 'Reset your password',
        lines: [`Hi ${p.name},`, verify ? 'Confirm your email address to finish setting up FindIt.' : 'Use the button below to choose a new password. The link works once and expires in 30 minutes. If you did not ask for this, ignore this email.'],
        cta: { label: verify ? 'Confirm email' : 'Choose new password', url: `${appUrl}/${verify ? 'verify-email' : 'reset-password'}?token=${encodeURIComponent(p.token)}` },
      });
      try { await mailer.send({ to: p.email, subject: verify ? 'Confirm your FindIt email' : 'Reset your FindIt password', ...mail }); } catch (err) { logger.error('auth email failed', { err }); }
    });
  };
  app.locals.wire = wire;
  return finish();
}
