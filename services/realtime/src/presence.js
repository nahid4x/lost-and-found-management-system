/** Presence counter per user (number of live sockets). Redis-backed when available so Notify can read it. */
export function createPresence(redis) {
  const mem = new Map();
  const key = (id) => `presence:${id}`;
  return {
    async inc(id) {
      if (!redis) { mem.set(id, (mem.get(id) ?? 0) + 1); return; }
      await redis.multi().incr(key(id)).expire(key(id), 6 * 3600).exec();
    },
    async dec(id) {
      if (!redis) { const n = (mem.get(id) ?? 1) - 1; if (n <= 0) mem.delete(id); else mem.set(id, n); return; }
      const n = await redis.decr(key(id));
      if (n <= 0) await redis.del(key(id));
    },
    async isOnline(id) { return redis ? Number(await redis.get(key(id))) > 0 : (mem.get(id) ?? 0) > 0; },
  };
}
