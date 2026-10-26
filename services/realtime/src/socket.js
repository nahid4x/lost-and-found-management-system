import { Server } from 'socket.io';
import { z } from 'zod';
import { verifyAccess } from '@findit/shared/tokens';
import { plainText } from '@findit/shared/sanitize';
import { objectId } from '@findit/shared/validate';
import { trusted } from '@findit/shared/db';
import { Conversation, Message, ChatImage, Call, messageView } from './models.js';

const MAX_SOCKETS_PER_USER = 5;
const RING_TIMEOUT_MS = 45_000;

/** Sliding-window limiter keyed per user (per instance). */
function windowLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { hits.set(key, arr); return false; }
    arr.push(now); hits.set(key, arr);
    return true;
  };
}

const sendSchema = z.object({ conversationId: objectId, text: z.string().min(1).max(4000), clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) }).strict();
const convSchema = z.object({ conversationId: objectId }).strict();
const typingSchema = z.object({ conversationId: objectId, typing: z.boolean() }).strict();
const deleteSchema = z.object({ conversationId: objectId, messageId: objectId }).strict();
const presenceSchema = z.object({ userIds: z.array(z.string().min(1).max(64)).max(100) }).strict();
const inviteSchema = z.object({ conversationId: objectId, callType: z.enum(['audio', 'video']).default('audio') }).strict();
const callIdSchema = z.object({ callId: objectId }).strict();
const signalSchema = z.object({ callId: objectId, data: z.any().refine((d) => JSON.stringify(d ?? null).length < 16_000, 'signal too large') }).strict();

export function attachSocket({ httpServer, env, logger, bus, presence, adapter, allowedOrigins }) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 32_000,
    pingInterval: 20_000, pingTimeout: 20_000,
    cors: { origin: allowedOrigins, credentials: true },
    // Block cross-site WebSocket hijacking: Origin must be on the allow-list when present.
    allowRequest: (req, cb) => { const o = req.headers.origin; cb(null, !o || allowedOrigins.includes(o)); },
  });
  if (adapter) io.adapter(adapter);

  const msgLimit = windowLimiter(20, 10_000); // 20 messages / 10 s / user
  const evtLimit = windowLimiter(200, 10_000); // all other events
  const activeCalls = new Map(); // userId -> callId

  // ----- handshake authentication -----
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error('unauthorized'));
      const p = verifyAccess(env, token);
      const existing = await io.in(`user:${p.sub}`).fetchSockets();
      if (existing.length >= MAX_SOCKETS_PER_USER) return next(new Error('too_many_connections'));
      socket.data.user = { id: p.sub, name: p.name, role: p.role };
      socket.data.exp = p.exp;
      next();
    } catch { next(new Error('unauthorized')); }
  });

  const room = (id) => `user:${id}`;
  const isOnline = async (id) => (await io.in(room(id)).fetchSockets()).length > 0;
  const member = (conversationId, uid) => Conversation.findOne({ _id: conversationId, participants: uid });
  const other = (c, uid) => c.participants.find((p) => p !== uid);

  // Only people who share a conversation with you can see whether you are online.
  const peersOf = async (uid) => {
    const convs = await Conversation.find({ participants: uid }).select('participants');
    return [...new Set(convs.flatMap((c) => c.participants).filter((p) => p !== uid))];
  };
  async function announce(uid, online) {
    try {
      const at = new Date().toISOString();
      for (const p of await peersOf(uid)) io.to(room(p)).emit('presence', { userId: uid, online, at });
    } catch (err) { logger.error('presence announce failed', { err }); }
  }

  // Saves a "call" entry in the chat (answered / missed / rejected) and pushes it to both people.
  async function logCall(call, status) {
    try {
      const answered = Boolean(call.startedAt);
      const outcome = status === 'rejected' ? 'rejected' : answered ? 'ended' : 'missed';
      const durationSec = answered ? Math.max(0, Math.round((call.endedAt - call.startedAt) / 1000)) : 0;
      const msg = await Message.create({
        conversation: call.conversation, sender: call.caller, kind: 'call',
        text: `${call.callType === 'video' ? 'Video' : 'Voice'} call`,
        clientId: `call:${call._id}`, deliveredAt: new Date(),
        call: { callId: String(call._id), callType: call.callType, outcome, durationSec },
      });
      await Conversation.updateOne({ _id: call.conversation }, { lastMessageAt: msg.createdAt, hiddenFor: [] });
      const view = messageView(msg);
      io.to(room(call.caller)).emit('conversation:new', { id: call.conversation });
      io.to(room(call.callee)).emit('conversation:new', { id: call.conversation });
      io.to(room(call.caller)).emit('message:new', view);
      io.to(room(call.callee)).emit('message:new', view);
    } catch (err) { logger.error('call log failed', { err }); }
  }

  async function endCall(call, status, byId) {
    if (!['ringing', 'active'].includes(call.status)) return;
    call.status = status; call.endedAt = new Date(); await call.save();
    activeCalls.delete(call.caller); activeCalls.delete(call.callee);
    const target = byId === call.caller ? call.callee : call.caller;
    io.to(room(target)).emit(status === 'rejected' ? 'call:rejected' : status === 'missed' ? 'call:missed' : 'call:ended', { callId: String(call._id) });
    if (status === 'missed') io.to(room(call.caller)).emit('call:missed', { callId: String(call._id) });
    await logCall(call, status);
  }

  io.on('connection', async (socket) => {
    const me = socket.data.user;
    socket.join(room(me.id));

    // Wire an event with validation, expiry check, rate limit and error-safe ack.
    const on = (event, schema, handler, limiter = evtLimit) => {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          if (Date.now() / 1000 > socket.data.exp) { reply({ error: 'token_expired' }); socket.disconnect(true); return; }
          if (!limiter(me.id)) { reply({ error: 'rate_limited' }); return; }
          const parsed = schema.safeParse(payload);
          if (!parsed.success) { reply({ error: 'invalid' }); return; }
          reply(await handler(parsed.data));
        } catch (err) { logger.error('socket handler failed', { event, err }); reply({ error: 'server_error' }); }
      });
    };

    on('message:send', sendSchema, async ({ conversationId, text, clientId }) => {
      const c = await member(conversationId, me.id);
      if (!c) return { error: 'forbidden' };
      const clean = plainText(text, 2000);
      if (!clean) return { error: 'invalid' };
      const existing = await Message.findOne({ conversation: conversationId, clientId });
      if (existing) return { ok: true, message: messageView(existing), duplicate: true }; // idempotent re-send after reconnect
      const peer = other(c, me.id);
      const online = await isOnline(peer);
      const msg = await Message.create({ conversation: conversationId, sender: me.id, text: clean, clientId, deliveredAt: online ? new Date() : undefined });
      await Conversation.updateOne({ _id: c._id }, { lastMessageAt: msg.createdAt, hiddenFor: [] });
      const view = messageView(msg);
      if (c.hiddenFor?.includes(peer)) io.to(room(peer)).emit('conversation:new', { id: conversationId }); // reappears in their list
      io.to(room(peer)).emit('message:new', view);
      socket.to(room(me.id)).emit('message:new', view); // sender's other tabs
      await bus.publish('message.created', { conversationId, sender: me.id, senderName: me.name, recipient: peer });
      return { ok: true, message: view };
    }, msgLimit);

    // Delete your own text or photo message for everyone (calls cannot be deleted).
    on('message:delete', deleteSchema, async ({ conversationId, messageId }) => {
      const c = await member(conversationId, me.id);
      if (!c) return { error: 'forbidden' };
      const m = await Message.findOne({ _id: messageId, conversation: conversationId, sender: me.id, kind: trusted({ $in: ['text', 'image'] }) });
      if (!m) return { error: 'not_found' };
      if (!m.deletedAt) {
        if (m.kind === 'image' && m.image?.id) await ChatImage.deleteOne({ _id: m.image.id, conversation: conversationId });
        await Message.updateOne({ _id: m._id }, { deletedAt: new Date(), text: 'This message was deleted', $unset: { image: 1 } });
        const payload = { conversationId, messageId: String(m._id) };
        io.to(room(other(c, me.id))).emit('message:deleted', payload);
        socket.to(room(me.id)).emit('message:deleted', payload); // sender's other tabs
      }
      return { ok: true };
    });

    on('typing', typingSchema, async ({ conversationId, typing }) => {
      const c = await member(conversationId, me.id);
      if (!c) return { error: 'forbidden' };
      io.to(room(other(c, me.id))).emit('typing', { conversationId, userId: me.id, typing });
      return { ok: true };
    });

    // Which of the people I chat with are online right now.
    on('presence:query', presenceSchema, async ({ userIds }) => {
      const allowed = new Set(await peersOf(me.id));
      const online = [];
      for (const id of userIds) if (allowed.has(id) && (await isOnline(id))) online.push(id);
      return { ok: true, online };
    });

    on('message:read', convSchema, async ({ conversationId }) => {
      const c = await member(conversationId, me.id);
      if (!c) return { error: 'forbidden' };
      const readAt = new Date();
      await Message.updateMany({ conversation: conversationId, sender: trusted({ $ne: me.id }), readAt: null }, { readAt });
      io.to(room(other(c, me.id))).emit('message:read', { conversationId, readAt });
      return { ok: true };
    });

    // ----- WebRTC signalling (media is peer-to-peer; the server only relays) -----
    on('call:invite', inviteSchema, async ({ conversationId, callType }) => {
      const c = await member(conversationId, me.id); // only the two conversation participants may call
      if (!c) return { error: 'forbidden' };
      const peer = other(c, me.id);
      if (activeCalls.has(me.id) || activeCalls.has(peer)) return { error: 'busy' };
      if (!(await isOnline(peer))) return { error: 'offline' };
      const call = await Call.create({ conversation: conversationId, caller: me.id, callee: peer, callType, status: 'ringing' });
      activeCalls.set(me.id, String(call._id)); activeCalls.set(peer, String(call._id));
      io.to(room(peer)).emit('call:incoming', { callId: String(call._id), conversationId, callType, from: { id: me.id, name: me.name } });
      setTimeout(async () => { const fresh = await Call.findById(call._id); if (fresh?.status === 'ringing') await endCall(fresh, 'missed', me.id); }, RING_TIMEOUT_MS).unref();
      return { ok: true, callId: String(call._id) };
    });

    const loadCall = async (callId) => {
      const call = await Call.findById(callId);
      if (!call || ![call.caller, call.callee].includes(me.id)) return null; // never reveal calls of others
      return call;
    };

    on('call:accept', callIdSchema, async ({ callId }) => {
      const call = await loadCall(callId);
      if (!call || call.callee !== me.id || call.status !== 'ringing') return { error: 'forbidden' };
      call.status = 'active'; call.startedAt = new Date(); await call.save();
      io.to(room(call.caller)).emit('call:accepted', { callId });
      return { ok: true };
    });
    on('call:reject', callIdSchema, async ({ callId }) => {
      const call = await loadCall(callId);
      if (!call || call.callee !== me.id || call.status !== 'ringing') return { error: 'forbidden' };
      await endCall(call, 'rejected', me.id);
      return { ok: true };
    });
    on('call:end', callIdSchema, async ({ callId }) => {
      const call = await loadCall(callId);
      if (!call) return { error: 'forbidden' };
      await endCall(call, call.status === 'ringing' && call.caller === me.id ? 'missed' : 'ended', me.id);
      return { ok: true };
    });
    for (const kind of ['offer', 'answer', 'ice']) {
      on(`call:${kind}`, signalSchema, async ({ callId, data }) => {
        const call = await loadCall(callId);
        if (!call || !['ringing', 'active'].includes(call.status)) return { error: 'forbidden' };
        io.to(room(call.caller === me.id ? call.callee : call.caller)).emit(`call:${kind}`, { callId, data });
        return { ok: true };
      });
    }

    // Handlers above are all registered synchronously, so a client that emits right after
    // `connect` can never lose an event. Presence + delivery catch-up run afterwards.
    const counted = presence.inc(me.id).catch((err) => logger.error('presence inc failed', { err }));
    socket.on('disconnect', async () => {
      await counted;
      await presence.dec(me.id);
      const callId = activeCalls.get(me.id);
      if (callId && !(await isOnline(me.id))) {
        const call = await Call.findById(callId);
        if (call) await endCall(call, 'ended', me.id);
      }
      if (!(await isOnline(me.id))) await announce(me.id, false);
    });

    // Messages that arrived while offline are now delivered: tell the senders.
    try {
      await counted;
      if ((await io.in(room(me.id)).fetchSockets()).length === 1) await announce(me.id, true); // first tab = just came online
      const convs = await Conversation.find({ participants: me.id }).select('_id participants');
      for (const c of convs) {
        const r = await Message.updateMany({ conversation: String(c._id), sender: trusted({ $ne: me.id }), deliveredAt: null }, { deliveredAt: new Date() });
        if (r.modifiedCount) io.to(room(other(c, me.id))).emit('message:delivered', { conversationId: String(c._id) });
      }
    } catch (err) { logger.error('delivery catch-up failed', { err }); }

  });
  return io;
}