import http from 'node:http';
import { z } from 'zod';
import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { loadEnv } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { connectMongo } from '@findit/shared/db';
import { createEventBus } from '@findit/shared/events';
import { onShutdown } from '@findit/shared/cleanup';
import { createRealtimeApp } from './app.js';
import { attachSocket } from './socket.js';
import { createPresence } from './presence.js';

export const realtimeShape = {
  PORT: z.coerce.number().default(4005), MONGO_URL: z.string().min(1),
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302').transform((v) => v.split(',')),
  TURN_URLS: z.string().optional().transform((v) => (v ? v.split(',') : undefined)),
  TURN_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(16).optional()), TURN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
};
const env = loadEnv(realtimeShape);
const logger = createLogger('realtime', env.LOG_LEVEL);
await connectMongo(env.MONGO_URL, logger, { autoIndex: env.MONGO_AUTO_INDEX });
const redis = new Redis(env.REDIS_URL);
const bus = createEventBus(env.REDIS_URL, logger);
let io = null;
const app = createRealtimeApp({ env, logger, bus, redis, getIo: () => io });
const server = http.createServer(app);
io = attachSocket({
  httpServer: server, env, logger, bus, presence: createPresence(redis), allowedOrigins: env.CORS_ORIGINS,
  adapter: createAdapter(new Redis(env.REDIS_URL), new Redis(env.REDIS_URL)), // shared rooms across instances
});
await app.locals.wire();
server.listen(env.PORT, () => logger.info('realtime listening', { port: env.PORT }));
onShutdown(async () => { io.close(); server.close(); await bus.close(); redis.disconnect(); });
