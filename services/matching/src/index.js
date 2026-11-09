import { z } from 'zod';
import { Redis } from 'ioredis';
import { loadEnv } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { connectMongo } from '@findit/shared/db';
import { createEventBus } from '@findit/shared/events';
import { onShutdown } from '@findit/shared/cleanup';
import { createMatchingApp } from './app.js';

const env = loadEnv({
  PORT: z.coerce.number().default(4003), MONGO_URL: z.string().min(1),
  MATCH_THRESHOLD: z.coerce.number().min(0).max(100).default(45), MATCH_RADIUS_KM: z.coerce.number().min(0.1).default(2),
});
const logger = createLogger('matching', env.LOG_LEVEL);
await connectMongo(env.MONGO_URL, logger, { autoIndex: env.MONGO_AUTO_INDEX });
const redis = new Redis(env.REDIS_URL);
const bus = createEventBus(env.REDIS_URL, logger);
const app = createMatchingApp({ env, logger, bus, redis });
await app.locals.wire();
const server = app.listen(env.PORT, () => logger.info('matching listening (internal only)', { port: env.PORT }));
onShutdown(async () => { server.close(); await bus.close(); redis.disconnect(); });
