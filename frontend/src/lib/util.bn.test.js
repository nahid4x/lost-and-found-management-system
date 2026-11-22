import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../i18n/index.js';
import { num, timeAgo } from './util.js';

afterEach(async () => { await i18n.changeLanguage('en'); });

describe('Bangla digits', () => {
  it('num() changes digits only in Bangla', async () => {
    expect(num(15)).toBe('15');
    await i18n.changeLanguage('bn');
    expect(num(15)).toBe('১৫');
  });

  it('timeAgo shows Bangla digits when the language is Bangla', async () => {
    await i18n.changeLanguage('bn');
    const now = Date.now();
    const text = timeAgo(now - 3 * 86_400_000, now);
    expect(text).toContain('৩');
    expect(text).not.toMatch(/\d/);
  });
});