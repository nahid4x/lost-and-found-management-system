import { z } from 'zod';
import { Redis } from 'ioredis';
import { loadEnv } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { connectMongo } from '@findit/shared/db';
import { createEventBus } from '@findit/shared/events';
import { createCloudStorage } from '@findit/shared/cloud';
import { onShutdown } from '@findit/shared/cleanup';
import { createClaimsApp } from './app.js';

const env = loadEnv({
  PORT: z.coerce.number().default(4004), MONGO_URL: z.string().min(1), AUTH_URL: z.string().url().default('http://auth:4001'),
  CLOUDINARY_CLOUD_NAME: z.string().min(1), CLOUDINARY_API_KEY: z.string().min(1), CLOUDINARY_API_SECRET: z.string().min(8),
});
const logger = createLogger('claims', env.LOG_LEVEL);
await connectMongo(env.MONGO_URL, logger, { autoIndex: env.MONGO_AUTO_INDEX });
const redis = new Redis(env.REDIS_URL);
const bus = createEventBus(env.REDIS_URL, logger);
const app = createClaimsApp({ env, logger, bus, redis, storage: createCloudStorage(env), authUrl: env.AUTH_URL });
await app.locals.wire();
const server = app.listen(env.PORT, () => logger.info('claims listening', { port: env.PORT }));
onShutdown(async () => { server.close(); await bus.close(); redis.disconnect(); });
