import i18n from '../i18n/index.js';

const T = (k, o) => i18n.t(k, o);

// Client-side helpers for private verification questions. The SERVER is the source of truth for scoring and validation;
// these rules only give instant feedback and mirror the server's schema.
export const MAX_QUESTIONS = 10;
export const WEIGHTS = [[1, 'Normal'], [2, 'Important'], [3, 'Critical']];
export const TYPES = [['text', 'Exact text'], ['number', 'Number'], ['descriptive', 'Description']];
export const emptyEntry = () => ({ question: '', answer: '', type: 'text', weight: 1, tolerance: '' });

/** Suggested questions by category (shown as one-tap chips; the user can edit everything). Text comes from the i18n file (tpl.*). */
const TEMPLATE_IDS = {
  wallet: [
    ['walletMoney', 'number'], ['wallet500', 'number'], ['wallet1000', 'number'],
    ['wallet100', 'number'], ['walletOther', 'descriptive'],
    ['walletInterior', 'descriptive'], ['walletMark', 'descriptive'],
  ],
  electronics: [['elecWallpaper', 'descriptive'], ['elecCase', 'descriptive'], ['elecMark', 'descriptive']],
  keys: [['keysWritten', 'text'], ['keysCount', 'number']],
  bags: [['bagsInside', 'descriptive'], ['bagsMark', 'descriptive']],
  other: [['otherMark', 'descriptive']],
};
export const templatesFor = (category) => (TEMPLATE_IDS[category] ?? TEMPLATE_IDS.other).map(([id, type]) => [T(`tpl.${id}`), type]);

const BN = '০১২৩৪৫৬৭৮৯';
/** Lenient numeric check for instant feedback only (the server parses strictly). */
export function looksNumeric(s) {
  const t = String(s).replace(/[০-৯]/g, (d) => BN.indexOf(d)).replace(/৳|\$|€|£|₹|\b(tk|taka|bdt|usd)\b\.?/gi, '').replace(/[,\s_]/g, '');
  return /^[+-]?\d+(\.\d+)?$/.test(t);
}

/** Returns { [index]: { question?, answer? }, _form?: string } — empty object means valid. Fully blank rows are ignored. */
export function validateEntries(entries) {
  const errors = {}; const seen = new Set();
  const used = entries.map((e, i) => [e, i]).filter(([e]) => e.question.trim() || e.answer.trim());
  if (used.length > MAX_QUESTIONS) errors._form = T('vErr.maxQ', { n: MAX_QUESTIONS });
  for (const [e, i] of used) {
    const err = {};
    const q = e.question.trim(); const a = e.answer.trim();
    if (q.length < 3) err.question = T('vErr.qShort');
    else if (seen.has(q.toLowerCase())) err.question = T('vErr.qDup');
    if (!a) err.answer = T('vErr.aMissing');
    else if (e.type === 'number' && !looksNumeric(a)) err.answer = T('vErr.aNumber');
    if (e.tolerance !== '' && (Number.isNaN(Number(e.tolerance)) || Number(e.tolerance) < 0)) err.tolerance = T('vErr.tolerance');
    seen.add(q.toLowerCase());
    if (Object.keys(err).length) errors[i] = err;
  }
  return errors;
}

/** Payload for the API: only completed rows, trimmed. */
export const toPayload = (entries) => entries
  .filter((e) => e.question.trim() && e.answer.trim())
  .map((e) => ({ question: e.question.trim(), answer: e.answer.trim(), type: e.type, weight: Number(e.weight) || 1, ...(e.type === 'number' && e.tolerance !== '' && Number(e.tolerance) > 0 ? { tolerance: Number(e.tolerance) } : {}) }));

// English fallbacks; the UI shows verif.res_* / verif.level_* / verif.advice_* from the i18n files.
export const RESULT_LABEL = { match: ['✓', 'Matched'], approx: ['≈', 'Approximate match'], no_match: ['✗', 'Did not match'], unanswered: ['—', 'Not answered'], not_scored: ['·', 'Not scored'] };
export const LEVEL_TEXT = {
  high: ['High match', 'Review recommended'],
  medium: ['Medium match', 'Review carefully'],
  low: ['Low match', 'Be cautious'],
};