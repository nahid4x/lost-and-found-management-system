import { z } from 'zod';

const WEAK = /change[_-]?me|placeholder|example|password|secret123|default/i;

/** A secret must be >= 32 chars and must not look like a template placeholder. */
export const secret = z
  .string()
  .min(32, 'must be at least 32 characters')
  .refine((v) => !WEAK.test(v), 'looks like a placeholder or weak value');

const csv = z
  .string()
  .min(1)
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean));

export const baseShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: secret,
  JWT_ISSUER: z.string().min(3).default('findit'),
  JWT_AUDIENCE: z.string().min(3).default('findit-web'),
  INTERNAL_SERVICE_TOKEN: secret,
  CORS_ORIGINS: csv,
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  // Build indexes at boot. Set to false if indexes are managed by a migration step.
  MONGO_AUTO_INDEX: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
};

/** Validate env at boot. Exits the process with a clear message when invalid. */
export function loadEnv(extraShape = {}, source = process.env, { exit = true } = {}) {
  const parsed = z.object({ ...baseShape, ...extraShape }).safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`);
    const msg = `Invalid environment configuration:\n${lines.join('\n')}`;
    if (!exit) throw new Error(msg);
    console.error(msg);
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}
