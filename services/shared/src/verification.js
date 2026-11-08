// Server-side ownership-verification scoring. Pure functions: no I/O, no secrets kept.
// A high score is a *signal for manual review*, never proof of ownership.

const BN = '০১২৩৪৫৬৭৮৯';
const AR = '٠١٢٣٤٥٦٧٨٩';
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'with', 'in', 'on', 'is', 'was', 'it', 'its', 'to', 'for', 'at']);
const CURRENCY = /(৳|\$|€|£|₹|\b(?:tk|taka|bdt|usd|rs|inr)\b\.?)/giu;

export const DEFAULTS = Object.freeze({ high: 80, medium: 50, descriptiveMinSimilarity: 0.6, approxCredit: 0.5 });

/** Bangla/Arabic-Indic digits -> ASCII, so "৫০০" equals "500". */
export const asciiDigits = (s) => String(s ?? '').replace(/[০-৯]/g, (d) => BN.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));

/** Harmless-formatting normaliser: NFKC, lower-case, punctuation/symbols -> space, whitespace collapsed. */
export function normalizeText(s) {
  return asciiDigits(String(s ?? '').normalize('NFKC')).toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Strict number parser: currency marks and thousands separators are formatting; anything else is not a number. */
export function parseNumber(s) {
  let t = asciiDigits(String(s ?? '').normalize('NFKC')).toLowerCase().replace(CURRENCY, '').replace(/[,\s_]/g, '');
  if (t.length > 40) return NaN; // numbers here are short; bounding the input keeps the regex linear
  // eslint-disable-next-line security/detect-unsafe-regex -- input is capped at 40 chars above
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return NaN;
  t = t.replace(/^\+/, '');
  return Number(t);
}

const tokens = (s) => normalizeText(s).split(' ').filter((t) => t && !STOP.has(t)).map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));

/** Dice coefficient over token sets (0..1). */
export function tokenSimilarity(a, b) {
  const A = new Set(tokens(a)); const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** Compare one answer. Returns { result: match|approx|no_match|unanswered, credit: 0..1 }. */
export function compareAnswer(entry, given, cfg = DEFAULTS) {
  const raw = String(given ?? '').trim();
  if (!raw) return { result: 'unanswered', credit: 0 };
  if (entry.type === 'number') {
    const want = parseNumber(entry.answer); const got = parseNumber(raw);
    if (Number.isNaN(want) || Number.isNaN(got)) return { result: 'no_match', credit: 0 };
    const tol = Math.max(0, Number(entry.tolerance) || 0); // a range only when the finder explicitly allowed it
    return Math.abs(want - got) <= (tol || 1e-9) ? { result: 'match', credit: 1 } : { result: 'no_match', credit: 0 };
  }
  if (normalizeText(raw) === normalizeText(entry.answer)) return { result: 'match', credit: 1 };
  if (entry.type === 'descriptive') {
    const sim = tokenSimilarity(entry.answer, raw);
    if (sim >= cfg.descriptiveMinSimilarity) return { result: 'approx', credit: cfg.approxCredit, similarity: Math.round(sim * 100) / 100 };
  }
  return { result: 'no_match', credit: 0 };
}

export const levelFor = (score, cfg = DEFAULTS) => (score == null ? 'unscored' : score >= cfg.high ? 'high' : score >= cfg.medium ? 'medium' : 'low');

/**
 * entries: [{ id, question, type, weight, answer, tolerance }]  (the finder's private answers; never stored here)
 * given:   claimant answers aligned by index. Unanswered questions stay in the denominator, so skipping can never raise the score.
 */
export function scoreVerification(entries, given, cfg = DEFAULTS) {
  const eligible = entries.filter((e) => String(e.answer ?? '').trim());
  if (!eligible.length) return { scored: false, score: null, level: 'unscored', matched: 0, approximate: 0, total: 0, answered: 0, perQuestion: [] };
  let weightSum = 0; let gained = 0; let matched = 0; let approximate = 0; let answered = 0;
  const perQuestion = entries.map((e, i) => {
    const claimed = String(given?.[i] ?? '').trim();
    if (!String(e.answer ?? '').trim()) return { id: e.id, question: e.question, claimed, result: 'not_scored' };
    const w = Math.min(5, Math.max(1, Number(e.weight) || 1));
    const c = compareAnswer(e, claimed, cfg);
    weightSum += w; gained += w * c.credit;
    if (claimed) answered++;
    if (c.result === 'match') matched++;
    if (c.result === 'approx') approximate++;
    return { id: e.id, question: e.question, claimed, result: c.result, weight: w };
  });
  const score = Math.round((gained / weightSum) * 100);
  return { scored: true, score, level: levelFor(score, cfg), matched, approximate, total: eligible.length, answered, perQuestion };
}
