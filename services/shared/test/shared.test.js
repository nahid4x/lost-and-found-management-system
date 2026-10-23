import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { z } from 'zod';
import { loadEnv } from '../src/env.js';
import { stripMongoKeys, escapeRegex, plainText, escapeHtml, safeUrl } from '../src/sanitize.js';
import { signAccess, verifyAccess, timingSafeEqualStr } from '../src/tokens.js';
import { sanitizeImage } from '../src/cloud.js';
import { createLogger } from '../src/logger.js';

const goodEnv = { ...process.env };

describe('env validation', () => {
  it('rejects missing, short and placeholder secrets', () => {
    expect(() => loadEnv({}, { ...goodEnv, JWT_ACCESS_SECRET: 'short' }, { exit: false })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadEnv({}, { ...goodEnv, JWT_ACCESS_SECRET: 'CHANGE_ME_'.repeat(5) }, { exit: false })).toThrow(/placeholder/);
    expect(() => loadEnv({}, { ...goodEnv, CORS_ORIGINS: undefined }, { exit: false })).toThrow(/CORS_ORIGINS/);
    expect(loadEnv({ X: z.string().default('y') }, goodEnv, { exit: false }).CORS_ORIGINS).toEqual(['https://findit.test']);
  });
});

describe('sanitizers', () => {
  it('strips mongo operators and dotted keys, deeply', () => {
    const o = { a: { $ne: 1, ok: 2, 'x.y': 3 }, $where: 'x', list: [{ $gt: 1, k: 1 }], __proto__: { polluted: 1 } };
    stripMongoKeys(o);
    expect(o).toEqual({ a: { ok: 2 }, list: [{ k: 1 }] });
  });
  it('escapes regex and html, strips angle brackets from plain text', () => {
    expect(new RegExp(escapeRegex('a.b*(c)')).test('a.b*(c)')).toBe(true);
    expect(new RegExp(escapeRegex('a.b')).test('axb')).toBe(false);
    expect(escapeHtml('<img src=x onerror=alert(1)>"')).toBe('&lt;img src=x onerror=alert(1)&gt;&quot;');
    expect(plainText('<script>alert(1)</script>hi\u0000')).toBe('scriptalert(1)/scripthi');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('https://example.com/x')).toMatch(/^https:/);
  });
});

describe('tokens', () => {
  const env = { JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET, JWT_ISSUER: 'findit', JWT_AUDIENCE: 'findit-web' };
  it('round-trips and pins HS256', () => {
    const t = signAccess(env, { sub: 'u1', role: 'user', name: 'A B' });
    expect(verifyAccess(env, t).sub).toBe('u1');
    const hs512 = jwt.sign({}, env.JWT_ACCESS_SECRET, { algorithm: 'HS512', subject: 'u1', issuer: 'findit', audience: 'findit-web' });
    expect(() => verifyAccess(env, hs512)).toThrow();
    expect(() => verifyAccess({ ...env, JWT_ISSUER: 'evil' }, t)).toThrow();
  });
  it('compares secrets in constant time and handles length mismatch', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualStr(undefined, 'x')).toBe(false);
  });
});

describe('image sanitising', () => {
  it('rejects non-images and fake extensions (magic bytes), strips EXIF/GPS from real images', async () => {
    await expect(sanitizeImage(Buffer.from('<?php echo 1; ?>'))).rejects.toThrow(/Only JPEG/);
    await expect(sanitizeImage(Buffer.from('GIF89a......'))).rejects.toThrow();
    const jpg = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#f00' } }).jpeg().withExif({ IFD0: { Copyright: 'secret-gps-owner' } }).toBuffer();
    expect((await sharp(jpg).metadata()).exif).toBeTruthy();
    const clean = await sanitizeImage(jpg);
    const meta = await sharp(clean).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });
});

describe('logger', () => {
  it('redacts sensitive keys', () => {
    const chunks = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (c) => { chunks.push(String(c)); return true; };
    try { createLogger('t', 'info').info('x', { password: 'p', nested: { token: 'abc', ok: 1 } }); } finally { process.stdout.write = orig; }
    expect(chunks.join('')).not.toMatch(/"p"|abc/);
    expect(chunks.join('')).toMatch(/redacted/);
  });
});
