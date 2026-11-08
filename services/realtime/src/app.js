import { z } from 'zod';
import { createBaseApp } from '@findit/shared/app';
import { authenticate } from '@findit/shared/tokens';
import { validate, objectId } from '@findit/shared/validate';
import { notFound } from '@findit/shared/errors';
import { trusted } from '@findit/shared/db';
import { Conversation, Message, pairKey, messageView } from './models.js';
import { iceServers } from './ice.js';

const idParam = z.object({ id: objectId });
const msgQuery = z.object({ after: objectId.optional(), before: objectId.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });

export function createRealtimeApp({ env, logger, bus, redis = null, getIo = () => null }) {
  const { app, finish } = createBaseApp({ service: 'realtime', env, logger, redis });
  const auth = authenticate(env);

  const otherOf = (c, uid) => c.participants.find((p) => p !== uid);
  const view = (c, uid, unread = 0, last = null) => {
    const other = otherOf(c, uid);
    return { id: String(c._id), other: { id: other, name: c.names?.[other] ?? 'User' }, item: c.itemId ? { id: c.itemId, title: c.itemTitle } : null, lastMessageAt: c.lastMessageAt, lastMessage: last ? { text: last.text, sender: last.sender, createdAt: last.createdAt } : null, unread };
  };

  app.get('/conversations', auth, async (req, res, next) => {
    try {
      const convs = await Conversation.find({ participants: req.user.id }).sort({ lastMessageAt: -1 }).limit(100);
      const ids = convs.map((c) => String(c._id));
      const unreadDocs = await Message.find({ conversation: trusted({ $in: ids }), sender: trusted({ $ne: req.user.id }), readAt: null }).select('conversation');
      const counts = new Map();
      for (const m of unreadDocs) counts.set(m.conversation, (counts.get(m.conversation) ?? 0) + 1);
      const lasts = await Promise.all(ids.map((id) => Message.findOne({ conversation: id }).sort({ _id: -1 })));
      res.json({ conversations: convs.map((c, i) => view(c, req.user.id, counts.get(String(c._id)) ?? 0, lasts[i])) });
    } catch (e) { next(e); }
  });

  app.get('/unread-count', auth, async (req, res, next) => {
    try {
      const ids = (await Conversation.find({ participants: req.user.id }).select('_id')).map((c) => String(c._id));
      const unread = ids.length ? await Message.countDocuments({ conversation: trusted({ $in: ids }), sender: trusted({ $ne: req.user.id }), readAt: null }) : 0;
      res.json({ unread });
    } catch (e) { next(e); }
  });

  // History + reconnect catch-up: `after` returns only newer messages so nothing is duplicated or lost.
  app.get('/conversations/:id/messages', auth, validate(idParam, 'params'), validate(msgQuery, 'query'), async (req, res, next) => {
    try {
      const c = await Conversation.findOne({ _id: req.params.id, participants: req.user.id });
      if (!c) throw notFound('Conversation not found');
      const { after, before, limit } = req.query;
      const f = { conversation: String(c._id) };
      if (after) f._id = trusted({ $gt: after });
      else if (before) f._id = trusted({ $lt: before });
      const docs = await Message.find(f).sort({ _id: after ? 1 : -1 }).limit(limit);
      if (!after) docs.reverse();
      res.json({ messages: docs.map(messageView), conversation: view(c, req.user.id) });
    } catch (e) { next(e); }
  });

  app.post('/conversations/:id/read', auth, validate(idParam, 'params'), async (req, res, next) => {
    try {
      const c = await Conversation.findOne({ _id: req.params.id, participants: req.user.id });
      if (!c) throw notFound('Conversation not found');
      const readAt = new Date();
      await Message.updateMany({ conversation: String(c._id), sender: trusted({ $ne: req.user.id }), readAt: null }, { readAt });
      getIo()?.to(`user:${otherOf(c, req.user.id)}`).emit('message:read', { conversationId: String(c._id), readAt });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.get('/calls/ice', auth, (req, res) => res.json(iceServers(env, req.user.id)));

  const wire = async () => {
    await bus.on('claim.approved', async (p) => {
      const key = pairKey(p.finder, p.claimant, p.itemId);
      const res = await Conversation.updateOne({ pairKey: key }, { $setOnInsert: { participants: [p.finder, p.claimant], names: { [p.finder]: p.finderName, [p.claimant]: p.claimantName }, itemId: p.itemId, itemTitle: p.itemTitle, pairKey: key, lastMessageAt: new Date() } }, { upsert: true });
      if (res.upsertedCount) {
        const c = await Conversation.findOne({ pairKey: key });
        for (const uid of c.participants) getIo()?.to(`user:${uid}`).emit('conversation:new', view(c, uid));
      }
    });
    await bus.on('user.deactivated', (p) => getIo()?.in(`user:${p.userId}`).disconnectSockets(true));
    await bus.on('notification.push', (p) => getIo()?.to(`user:${p.user}`).emit('notification:new', p.notification));
  };
  app.locals.wire = wire;
  return finish();
}
