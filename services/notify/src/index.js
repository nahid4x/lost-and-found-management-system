import { z } from 'zod';
import { Redis } from 'ioredis';
import { loadEnv } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { connectMongo } from '@findit/shared/db';
import { createEventBus } from '@findit/shared/events';
import { onShutdown } from '@findit/shared/cleanup';
import { createNotifyApp } from './app.js';
import { createMailer } from './mailer.js';

const env = loadEnv({
  PORT: z.coerce.number().default(4006), MONGO_URL: z.string().min(1), AUTH_URL: z.string().url().default('http://auth:4001'),
  APP_URL: z.string().url(), MAIL_FROM: z.string().min(5).default('FindIt <no-reply@findit.local>'), SMTP_URL: z.string().optional(),
});
const logger = createLogger('notify', env.LOG_LEVEL);
await connectMongo(env.MONGO_URL, logger, { autoIndex: env.MONGO_AUTO_INDEX });
const redis = new Redis(env.REDIS_URL);
const bus = createEventBus(env.REDIS_URL, logger);
const app = createNotifyApp({ env, logger, bus, redis, mailer: createMailer(env, logger), authUrl: env.AUTH_URL });
await app.locals.wire();
const server = app.listen(env.PORT, () => logger.info('notify listening', { port: env.PORT }));
onShutdown(async () => { server.close(); await bus.close(); redis.disconnect(); });
