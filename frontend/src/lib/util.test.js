import { describe, it, expect } from 'vitest';
import { validatePassword, strength, checkImages, timeAgo, initials, errMsg } from './util.js';

const file = (name, type, size = 1000) => ({ name, type, size });

describe('util', () => {
  it('password validation + strength', () => {
    expect(validatePassword('short')).toContain('at least 10 characters');
    expect(validatePassword('aaaaaaaaaaaa')).toContain('too repetitive');
    expect(validatePassword('Correct-Horse-Battery-9')).toEqual([]);
    expect(strength('abc')).toBe(0); expect(strength('Correct-Horse-Battery-9')).toBe(4);
  });
  it('image checks reject wrong type, oversize and too many files', () => {
    const r = checkImages([file('a.png', 'image/png'), file('b.gif', 'image/gif'), file('c.jpg', 'image/jpeg', 6 * 1024 * 1024)], 5);
    expect(r.files.map((f) => f.name)).toEqual(['a.png']);
    expect(r.errors).toHaveLength(2);
    const many = checkImages(Array.from({ length: 7 }, (_, i) => file(`${i}.webp`, 'image/webp')), 5);
    expect(many.files).toHaveLength(5); expect(many.errors.join()).toMatch(/Maximum 5/);
  });
  it('formats time and names', () => {
    const now = Date.now();
    expect(timeAgo(now - 10_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(now - 3 * 3600_000, now)).toBe('3 h ago');
    expect(initials('Nahid Hasan Rafi')).toBe('NH');
    expect(errMsg({ message: 'x', details: [{ path: 'title', message: 'too short' }] })).toBe('title: too short');
  });
});
