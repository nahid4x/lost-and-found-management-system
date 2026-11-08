// Client-side helpers for private verification questions. The SERVER is the source of truth for scoring and validation;
// these rules only give instant feedback and mirror the server's schema.
export const MAX_QUESTIONS = 10;
export const WEIGHTS = [[1, 'Normal'], [2, 'Important'], [3, 'Critical']];
export const TYPES = [['text', 'Exact text'], ['number', 'Number'], ['descriptive', 'Description']];
export const emptyEntry = () => ({ question: '', answer: '', type: 'text', weight: 1, tolerance: '' });

/** Suggested questions by category (shown as one-tap chips; the user can edit everything). */
export const TEMPLATES = {
  wallet: [
    ['How much money was inside the wallet?', 'number'], ['How many ৳500 notes were there?', 'number'], ['How many ৳1,000 notes were there?', 'number'],
    ['How many ৳100 notes were there?', 'number'], ['What other items were inside the wallet?', 'descriptive'],
    ['What was the colour or design of the wallet’s interior?', 'descriptive'], ['Was there a distinctive mark, card or object inside?', 'descriptive'],
  ],
  electronics: [['What was the phone’s wallpaper?', 'descriptive'], ['What is the distinctive feature of the phone case?', 'descriptive'], ['What distinctive mark or scratch does it have?', 'descriptive']],
  keys: [['What was written on the keychain?', 'text'], ['How many keys are on the ring?', 'number']],
  bags: [['What was inside the bag?', 'descriptive'], ['What distinctive mark does the bag have?', 'descriptive']],
  other: [['What distinctive mark does the item have?', 'descriptive']],
};
export const templatesFor = (category) => TEMPLATES[category] ?? TEMPLATES.other;

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
  if (used.length > MAX_QUESTIONS) errors._form = `At most ${MAX_QUESTIONS} questions`;
  for (const [e, i] of used) {
    const err = {};
    const q = e.question.trim(); const a = e.answer.trim();
    if (q.length < 3) err.question = 'Write the question (at least 3 characters)';
    else if (seen.has(q.toLowerCase())) err.question = 'Duplicate question';
    if (!a) err.answer = 'Add the correct answer (only you can see it)';
    else if (e.type === 'number' && !looksNumeric(a)) err.answer = 'This question needs a number, e.g. 2500';
    if (e.tolerance !== '' && (Number.isNaN(Number(e.tolerance)) || Number(e.tolerance) < 0)) err.tolerance = 'Use a number ≥ 0';
    seen.add(q.toLowerCase());
    if (Object.keys(err).length) errors[i] = err;
  }
  return errors;
}

/** Payload for the API: only completed rows, trimmed. */
export const toPayload = (entries) => entries
  .filter((e) => e.question.trim() && e.answer.trim())
  .map((e) => ({ question: e.question.trim(), answer: e.answer.trim(), type: e.type, weight: Number(e.weight) || 1, ...(e.type === 'number' && e.tolerance !== '' && Number(e.tolerance) > 0 ? { tolerance: Number(e.tolerance) } : {}) }));

export const RESULT_LABEL = { match: ['✓', 'Matched'], approx: ['≈', 'Approximate match'], no_match: ['✗', 'Did not match'], unanswered: ['—', 'Not answered'], not_scored: ['·', 'Not scored'] };
export const LEVEL_TEXT = {
  high: ['High match', 'Review recommended'],
  medium: ['Medium match', 'Review carefully'],
  low: ['Low match', 'Be cautious'],
};
