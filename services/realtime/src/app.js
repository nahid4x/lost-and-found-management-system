import { z } from 'zod';
import express from 'express';
import { createBaseApp } from '@findit/shared/app';
import { authenticate } from '@findit/shared/tokens';
import { validate, objectId } from '@findit/shared/validate';
import { makeLimiter } from '@findit/shared/ratelimit';
import { notFound, badRequest } from '@findit/shared/errors';
import { trusted } from '@findit/shared/db';
import { Conversation, Message, ChatImage, pairKey, messageView } from './models.js';
import { iceServers } from './ice.js';

const idParam = z.object({ id: objectId });
const imgParams = z.object({ id: objectId, imgId: objectId });
const sidQuery = z.object({ sid: z.string().regex(/^[\w-]{10,40}$/).optional() });
const msgQuery = z.object({ after: objectId.optional(), before: objectId.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
const IMG_MAX = 900_000; // bytes; the browser shrinks photos to about this size before upload

export function createRealtimeApp({ env, logger, bus, redis = null, getIo = () => null }) {
  const { app, finish } = createBaseApp({ service: 'realtime', env, logger, redis });
  const auth = authenticate(env);
  const imgLimit = makeLimiter({ redis, windowMs: 60_000, limit: 15, prefix: 'rt:img', keyGenerator: (req) => `u:${req.user.id}` });

  const otherOf = (c, uid) => c.participants.find((p) => p !== uid);
  // Messages from before the user deleted the chat stay hidden for them.
  const sinceCleared = (c, uid, f) => { const at = c.clearedAt?.[uid]; if (at) f.createdAt = trusted({ $gt: new Date(at) }); return f; };
  const view = (c, uid, unread = 0, last = null) => {
    const other = otherOf(c, uid);
    return { id: String(c._id), other: { id: other, name: c.names?.[other] ?? 'User' }, item: c.itemId ? { id: c.itemId, title: c.itemTitle } : null, lastMessageAt: c.lastMessageAt, lastMessage: last ? { text: last.text, sender: last.sender, createdAt: last.createdAt } : null, unread };
  };

  app.get('/conversations', auth, async (req, res, next) => {
    try {
      const convs = await Conversation.find({ participants: req.user.id, hiddenFor: trusted({ $ne: req.user.id }) }).sort({ lastMessageAt: -1 }).limit(100);
      const ids = convs.map((c) => String(c._id));
      const unreadDocs = await Message.find({ conversation: trusted({ $in: ids }), sender: trusted({ $ne: req.user.id }), readAt: null }).select('conversation');
      const counts = new Map();
      for (const m of unreadDocs) counts.set(m.conversation, (counts.get(m.conversation) ?? 0) + 1);
      const lasts = await Promise.all(convs.map((c) => Message.findOne(sinceCleared(c, req.user.id, { conversation: String(c._id) })).sort({ _id: -1 })));
      res.json({ conversations: convs.map((c, i) => view(c, req.user.id, counts.get(String(c._id)) ?? 0, lasts[i])) });
    } catch (e) { next(e); }
  });

  app.get('/unread-count', auth, async (req, res, next) => {
    try {
      const ids = (await Conversation.find({ participants: req.user.id, hiddenFor: trusted({ $ne: req.user.id }) }).select('_id')).map((c) => String(c._id));
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
      const f = sinceCleared(c, req.user.id, { conversation: String(c._id) });
      if (after) f._id = trusted({ $gt: after });
      else if (before) f._id = trusted({ $lt: before });
      const docs = await Message.find(f).sort({ _id: after ? 1 : -1 }).limit(limit);
      if (!after) docs.reverse();
      res.json({ messages: docs.map(messageView), conversation: view(c, req.user.id) });
    } catch (e) { next(e); }
  });

  // Photo upload: raw JPEG bytes (the browser re-encodes the picture, which also strips location/EXIF data).
  app.post('/conversations/:id/images', auth, imgLimit, validate(idParam, 'params'), validate(sidQuery, 'query'), express.raw({ type: 'image/jpeg', limit: IMG_MAX }), async (req, res, next) => {
    try {
      const c = await Conversation.findOne({ _id: req.params.id, participants: req.user.id });
      if (!c) throw notFound('Conversation not found');
      const buf = req.body;
      const jpeg = Buffer.isBuffer(buf) && buf.length >= 200 && buf.length <= IMG_MAX && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      if (!jpeg) throw badRequest('Send a JPEG photo');
      const img = await ChatImage.create({ conversation: String(c._id), uploader: req.user.id, size: buf.length, data: buf });
      const peer = otherOf(c, req.user.id);
      const io = getIo();
      const online = io ? (await io.in(`user:${peer}`).fetchSockets()).length > 0 : false;
      const msg = await Message.create({ conversation: String(c._id), sender: req.user.id, kind: 'image', text: '📷 Photo', image: { id: String(img._id) }, clientId: `img:${img._id}`, deliveredAt: online ? new Date() : undefined });
      await Conversation.updateOne({ _id: c._id }, { lastMessageAt: msg.createdAt, hiddenFor: [] });
      const mv = messageView(msg);
      if (c.hiddenFor?.includes(peer)) io?.to(`user:${peer}`).emit('conversation:new', view(c, peer)); // reappears in their list
      io?.to(`user:${peer}`).emit('message:new', mv);
      // the sender's other tabs get it too; the tab that uploaded (sid) already has it from this response
      const mine = io?.to(`user:${req.user.id}`);
      (req.query.sid ? mine?.except(req.query.sid) : mine)?.emit('message:new', mv);
      await bus.publish('message.created', { conversationId: String(c._id), sender: req.user.id, senderName: req.user.name ?? 'Someone', recipient: peer });
      res.status(201).json({ message: mv });
    } catch (e) { next(e); }
  });

  // Photos are only readable by the two people in the conversation.
  app.get('/conversations/:id/images/:imgId', auth, validate(imgParams, 'params'), async (req, res, next) => {
    try {
      const c = await Conversation.findOne({ _id: req.params.id, participants: req.user.id });
      if (!c) throw notFound('Conversation not found');
      const img = await ChatImage.findOne({ _id: req.params.imgId, conversation: String(c._id) }).select('+data');
      if (!img) throw notFound('Photo not found');
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
      res.send(img.data);
    } catch (e) { next(e); }
  });

  // "Delete chat" = remove it from MY list only. The other person keeps their copy; a new message brings it back (empty of old history).
  app.post('/conversations/:id/hide', auth, validate(idParam, 'params'), async (req, res, next) => {
    try {
      const c = await Conversation.findOne({ _id: req.params.id, participants: req.user.id });
      if (!c) throw notFound('Conversation not found');
      await Conversation.updateOne({ _id: c._id }, { $addToSet: { hiddenFor: req.user.id }, $set: { [`clearedAt.${req.user.id}`]: new Date() } });
      await Message.updateMany({ conversation: String(c._id), sender: trusted({ $ne: req.user.id }), readAt: null }, { readAt: new Date() });
      getIo()?.to(`user:${req.user.id}`).emit('conversation:removed', { conversationId: String(c._id) }); // my other tabs
      res.json({ ok: true });
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