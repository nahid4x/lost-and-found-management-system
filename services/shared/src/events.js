import { Redis } from 'ioredis';

const CHANNEL = 'findit:events';

/** Redis pub/sub event bus. Event payloads never contain secrets or message bodies. */
export function createEventBus(redisUrl, logger) {
  const pub = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  const sub = new Redis(redisUrl);
  const handlers = new Map();
  let subscribed = false;
  const onMessage = (_ch, raw) => {
    let evt;
    try { evt = JSON.parse(raw); } catch { return; }
    for (const h of handlers.get(evt.type) ?? []) {
      Promise.resolve().then(() => h(evt.payload)).catch((err) => logger.error('event handler failed', { type: evt.type, err }));
    }
  };
  return {
    publish: (type, payload) => pub.publish(CHANNEL, JSON.stringify({ type, payload, at: Date.now() })),
    async on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
      if (!subscribed) {
        subscribed = true;
        sub.on('message', onMessage);
        await sub.subscribe(CHANNEL);
      }
    },
    async close() { await Promise.allSettled([pub.quit(), sub.quit()]); },
  };
}

/** In-process bus with the same interface, used by unit tests. */
export function createMemoryBus() {
  const handlers = new Map();
  const published = [];
  return {
    published,
    publish: async (type, payload) => {
      published.push({ type, payload });
      for (const h of handlers.get(type) ?? []) await h(structuredClone(payload));
    },
    on: async (type, h) => { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(h); },
    close: async () => {},
  };
}

export const audit = (bus, service, { action, actor, targetType, targetId, ip, meta }) =>
  bus.publish('audit.record', { service, action, actor: actor ?? null, targetType, targetId: targetId ? String(targetId) : null, ip: ip ?? null, meta: meta ?? null });
