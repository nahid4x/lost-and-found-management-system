import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { COMMON } from './common-passwords.js';

export function passwordSchema(minLen = 10) {
  return z.string().min(minLen, `at least ${minLen} characters`).max(128)
    .refine((v) => !COMMON.has(v.toLowerCase()), 'too common')
    .refine((v) => new Set(v).size > 3, 'too repetitive');
}

export const costFor = (env) => (env.NODE_ENV === 'production' ? Math.max(12, env.BCRYPT_COST) : env.BCRYPT_COST);
export const hashPassword = (env, pw) => bcrypt.hash(pw, costFor(env));
let dummy;
/** Constant-time-ish: when the user does not exist we still run a bcrypt compare. */
export async function verifyPassword(env, pw, hash) {
  dummy ??= bcrypt.hashSync('dummy-password-for-timing', costFor(env));
  const ok = await bcrypt.compare(pw, hash || dummy);
  return Boolean(hash) && ok;
}
