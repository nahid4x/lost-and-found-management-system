import { z } from 'zod';
import { loadEnv, secret } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { connectMongo } from '@findit/shared/db';
import { createEventBus } from '@findit/shared/events';
import { onShutdown } from '@findit/shared/cleanup';
import { Redis } from 'ioredis';
import { createAuthApp } from './app.js';

const env = loadEnv({
  PORT: z.coerce.number().default(4001),
  MONGO_URL: z.string().min(1),
  JWT_REFRESH_SECRET: secret,
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
});
const logger = createLogger('auth', env.LOG_LEVEL);
await connectMongo(env.MONGO_URL, logger, { autoIndex: env.MONGO_AUTO_INDEX });
const redis = new Redis(env.REDIS_URL);
const bus = createEventBus(env.REDIS_URL, logger);
const server = createAuthApp({ env, logger, bus, redis }).listen(env.PORT, () => logger.info('auth listening', { port: env.PORT }));
onShutdown(async () => { server.close(); await bus.close(); redis.disconnect(); });
