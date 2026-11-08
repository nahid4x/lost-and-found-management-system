import { describe, it, expect } from 'vitest';
import { normalizeText, parseNumber, tokenSimilarity, compareAnswer, scoreVerification, levelFor, DEFAULTS } from '../src/verification.js';

const q = (id, answer, extra = {}) => ({ id, question: `Q${id}`, type: 'text', weight: 1, answer, ...extra });

describe('normalisation', () => {
  it('ignores case, spacing and punctuation but not content', () => {
    expect(normalizeText('  Red   LEATHER, wallet!! ')).toBe('red leather wallet');
    expect(normalizeText('Samsung S24+')).toBe('samsung s24');
    expect(normalizeText('ক্যাফে ১২৩')).toBe('ক্যাফে 123');
  });
  it('parses numbers strictly; formatting is not content', () => {
    expect(parseNumber('৳ 1,500')).toBe(1500);
    expect(parseNumber('১২৫০ taka')).toBe(1250);
    expect(parseNumber('Tk. 2 000')).toBe(2000);
    expect(parseNumber('12.5')).toBe(12.5);
    for (const bad of ['', 'abc', '5 notes', '1..2', '1e3', '--4']) expect(parseNumber(bad)).toBeNaN();
  });
});

describe('answer comparison', () => {
  it('text: exact after normalisation, never fuzzy', () => {
    expect(compareAnswer(q(1, 'Blue Mountain'), 'blue  mountain!').result).toBe('match');
    expect(compareAnswer(q(1, 'Blue Mountain'), 'blue mountains').result).toBe('no_match');
    expect(compareAnswer(q(1, 'Blue Mountain'), '   ').result).toBe('unanswered');
  });
  it('number: strict equality (Bangla digits and currency marks allowed), range only when explicitly set', () => {
    const n = q(1, '2500', { type: 'number' });
    expect(compareAnswer(n, '২৫০০').result).toBe('match');
    expect(compareAnswer(n, '৳2,500').result).toBe('match');
    expect(compareAnswer(n, '2499').result).toBe('no_match');
    expect(compareAnswer(n, '2500.5').result).toBe('no_match');
    expect(compareAnswer(n, 'about 2500').result).toBe('no_match');
    expect(compareAnswer(q(1, '2500', { type: 'number', tolerance: 100 }), '2450').result).toBe('match');
    expect(compareAnswer(q(1, '2500', { type: 'number', tolerance: 100 }), '2350').result).toBe('no_match');
  });
  it('descriptive: normalised equality is a match; strong overlap is only an approximate (half credit); weak overlap is nothing', () => {
    const d = q(1, 'black leather case with a red sticker on the back', { type: 'descriptive' });
    expect(compareAnswer(d, 'Black leather case, with a RED sticker on the back.').result).toBe('match');
    const a = compareAnswer(d, 'black case red sticker back leather');
    expect(a.result).toBe('approx'); expect(a.credit).toBe(DEFAULTS.approxCredit);
    expect(compareAnswer(d, 'a white plastic case').result).toBe('no_match');
    expect(tokenSimilarity('red sticker', 'red sticker')).toBe(1);
  });
});

describe('scoring', () => {
  it('5 equal questions with 4 matches = 80%', () => {
    const entries = ['a', 'b', 'c', 'd', 'e'].map((x, i) => q(i, x));
    const r = scoreVerification(entries, ['a', 'b', 'c', 'd', 'wrong']);
    expect(r).toMatchObject({ scored: true, score: 80, matched: 4, total: 5, answered: 5, level: 'high' });
    expect(r.perQuestion.map((p) => p.result)).toEqual(['match', 'match', 'match', 'match', 'no_match']);
  });
  it('unanswered questions stay in the denominator, so skipping can never inflate the score', () => {
    const entries = ['a', 'b', 'c', 'd', 'e'].map((x, i) => q(i, x));
    const r = scoreVerification(entries, ['a', 'b', '', '', '']);
    expect(r.score).toBe(40); expect(r.answered).toBe(2); expect(r.total).toBe(5);
    expect(scoreVerification(entries, ['', '', '', '', '']).score).toBe(0);
    expect(scoreVerification(entries, []).score).toBe(0);
  });
  it('weights are honoured and clamped to 1..5', () => {
    const entries = [q(1, 'x', { weight: 3 }), q(2, 'y', { weight: 1 })];
    expect(scoreVerification(entries, ['x', 'nope']).score).toBe(75);
    expect(scoreVerification(entries, ['nope', 'y']).score).toBe(25);
    expect(scoreVerification([q(1, 'x', { weight: 999 }), q(2, 'y', { weight: -4 })], ['x', 'nope']).score).toBe(83); // 5 vs 1
  });
  it('approximate matches earn half credit and are reported separately from matches', () => {
    const entries = [q(1, 'black leather case with red sticker', { type: 'descriptive' }), q(2, 'k')];
    const r = scoreVerification(entries, ['leather black case red sticker', 'k']);
    expect(r).toMatchObject({ matched: 1, approximate: 1, total: 2, score: 75 });
  });
  it('questions without a stored answer are not scorable; nothing scorable means no score (not 0, not 100)', () => {
    expect(scoreVerification([q(1, ''), q(2, '  ')], ['a', 'b'])).toMatchObject({ scored: false, score: null, level: 'unscored' });
    expect(scoreVerification([], [])).toMatchObject({ scored: false });
    const r = scoreVerification([q(1, 'a'), q(2, '')], ['a', 'zzz']);
    expect(r).toMatchObject({ score: 100, total: 1 });
    expect(r.perQuestion[1].result).toBe('not_scored');
  });
  it('thresholds are configurable', () => {
    expect(levelFor(80)).toBe('high'); expect(levelFor(79)).toBe('medium'); expect(levelFor(50)).toBe('medium'); expect(levelFor(49)).toBe('low'); expect(levelFor(null)).toBe('unscored');
    expect(levelFor(70, { high: 90, medium: 60 })).toBe('medium');
    expect(levelFor(95, { high: 99, medium: 60 })).toBe('medium');
  });
  it('is robust to hostile input (huge strings, prototype keys, non-strings)', () => {
    const e = [q(1, 'a')];
    expect(() => scoreVerification(e, ['x'.repeat(100000)])).not.toThrow();
    expect(scoreVerification(e, [{ toString: () => 'a' }]).score).toBe(100); // coerced to text, still compared strictly
    expect(scoreVerification(e, [null]).score).toBe(0);
    expect(scoreVerification(e, ['__proto__']).score).toBe(0);
  });
});
