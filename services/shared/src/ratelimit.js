import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

/** Redis-backed limiter (memory store when no redis client, for tests). */
export function makeLimiter({ redis, windowMs, limit, prefix, keyGenerator, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests,
    store: redis ? new RedisStore({ sendCommand: (...args) => redis.call(...args), prefix: `rl:${prefix}:` }) : undefined,
    keyGenerator,
    handler: (req, res) => {
      res.status(429).json({ error: { message: 'Too many requests, slow down', code: 'rate_limited' } });
    },
  });
}
