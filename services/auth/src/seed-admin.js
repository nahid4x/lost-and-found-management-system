// Usage: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... node src/seed-admin.js
// The password is supplied at runtime only, never stored in the repo or .env.example.
import { z } from 'zod';
import { mongoose, connectMongo } from '@findit/shared/db';
import { createLogger } from '@findit/shared/logger';
import { User } from './models.js';
import { passwordSchema, hashPassword } from './passwords.js';

const env = z.object({
  MONGO_URL: z.string().min(1), ADMIN_EMAIL: z.string().email(), ADMIN_NAME: z.string().min(2).default('Administrator'),
  ADMIN_PASSWORD: passwordSchema(14), BCRYPT_COST: z.coerce.number().default(12), NODE_ENV: z.string().default('production'),
}).parse(process.env);
const logger = createLogger('seed', 'info');
await connectMongo(env.MONGO_URL, logger);
const passwordHash = await hashPassword(env, env.ADMIN_PASSWORD);
await User.updateOne(
  { email: env.ADMIN_EMAIL.toLowerCase() },
  { $set: { name: env.ADMIN_NAME, passwordHash, role: 'admin', isActive: true, emailVerified: true }, $setOnInsert: { tokenVersion: 0 } },
  { upsert: true },
);
logger.info('admin ready');
await mongoose.disconnect();
