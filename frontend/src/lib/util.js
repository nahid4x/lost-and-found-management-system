import i18n from '../i18n/index.js';

// React-er baire (plain JS) translate korar jonno
const T = (k, o) => i18n.t(k, o);
const loc = () => (i18n.language === 'bn' ? 'bn-BD' : undefined);

export const CATEGORIES = [
  ['electronics', 'Electronics', '📱'], ['wallet', 'Wallet & cards', '👛'], ['keys', 'Keys', '🔑'], ['bags', 'Bags', '🎒'], ['clothing', 'Clothing', '🧥'],
  ['documents', 'Documents & ID', '📄'], ['jewelry', 'Jewelry', '💍'], ['pets', 'Pets', '🐾'], ['toys', 'Toys', '🧸'], ['sports', 'Sports', '⚽'], ['other', 'Other', '📦'],
];
export const catEmoji = (c) => CATEGORIES.find((x) => x[0] === c)?.[2] ?? '📦';
export const catLabel = (c) => T(`cat.${c}`, { defaultValue: CATEGORIES.find((x) => x[0] === c)?.[1] ?? c });
export const STATUS_FLOW = ['open', 'matched', 'claimed', 'verified', 'returned', 'closed'];

export function timeAgo(d, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000));
  if (s < 45) return T('time.justNow');
  if (s < 3600) return T('time.min', { n: Math.round(s / 60) });
  if (s < 86400) return T('time.hour', { n: Math.round(s / 3600) });
  if (s < 604800) return T('time.day', { n: Math.round(s / 86400) });
  return new Date(d).toLocaleDateString(loc());
}
export const fmtDate = (d) => new Date(d).toLocaleDateString(loc(), { year: 'numeric', month: 'short', day: 'numeric' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
export const initials = (n = '?') => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const errMsg = (e) => (e?.details?.length ? e.details.map((d) => `${d.path || 'input'}: ${d.message}`).join('; ') : e?.message ?? T('common.somethingWrong'));

export function validatePassword(pw) {
  const issues = [];
  if (pw.length < 10) issues.push(T('pw.min10'));
  if (new Set(pw).size <= 3) issues.push(T('pw.repetitive'));
  return issues;
}
export function strength(pw) {
  let s = 0;
  if (pw.length >= 10) s++; if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
export const MAX_IMG_MB = 5;
export const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export function checkImages(files, max) {
  const out = []; const errors = [];
  for (const f of files) {
    if (!IMG_TYPES.includes(f.type)) errors.push(T('img.type', { name: f.name }));
    else if (f.size > MAX_IMG_MB * 1024 * 1024) errors.push(T('img.size', { name: f.name, mb: MAX_IMG_MB }));
    else out.push(f);
  }
  if (out.length > max) { errors.push(T('img.max', { n: max })); out.length = max; }
  return { files: out, errors };
}