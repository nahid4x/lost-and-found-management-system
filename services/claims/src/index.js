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
  PORT: z.coerce.number().default(4004), MONGO_URL: z.string().min(1), AUTH_URL: z.string().url().default('http://auth:4001'), ITEMS_URL: z.string().url().default('http://items:4002'),
  VERIFY_HIGH_THRESHOLD: z.coerce.number().min(1).max(100).default(80), VERIFY_MEDIUM_THRESHOLD: z.coerce.number().min(0).max(99).default(50),
  VERIFY_DESCRIPTIVE_MIN_SIMILARITY: z.coerce.number().min(0.3).max(1).default(0.6),
  CLOUDINARY_CLOUD_NAME: z.string().min(1), CLOUDINARY_API_KEY: z.string().min(1), CLOUDINARY_API_SECRET: z.string().min(8),
});
if (env.VERIFY_MEDIUM_THRESHOLD >= env.VERIFY_HIGH_THRESHOLD) { console.error('VERIFY_MEDIUM_THRESHOLD must be lower than VERIFY_HIGH_THRESHOLD'); process.exit(1); }
const logger = createLogger('claims', env.LOG_LEVEL);
await connectMongo(env.MONGO_URL, logger, { autoIndex: env.MONGO_AUTO_INDEX });
const redis = new Redis(env.REDIS_URL);
const bus = createEventBus(env.REDIS_URL, logger);
const app = createClaimsApp({ env, logger, bus, redis, storage: createCloudStorage(env), authUrl: env.AUTH_URL, itemsUrl: env.ITEMS_URL, verifyConfig: { high: env.VERIFY_HIGH_THRESHOLD, medium: env.VERIFY_MEDIUM_THRESHOLD, descriptiveMinSimilarity: env.VERIFY_DESCRIPTIVE_MIN_SIMILARITY, approxCredit: 0.5 } });
await app.locals.wire();
const server = app.listen(env.PORT, () => logger.info('claims listening', { port: env.PORT }));
onShutdown(async () => { server.close(); await bus.close(); redis.disconnect(); });
