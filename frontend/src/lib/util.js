export const CATEGORIES = [
  ['electronics', 'Electronics', '📱'], ['wallet', 'Wallet & cards', '👛'], ['keys', 'Keys', '🔑'], ['bags', 'Bags', '🎒'], ['clothing', 'Clothing', '🧥'],
  ['documents', 'Documents & ID', '📄'], ['jewelry', 'Jewelry', '💍'], ['pets', 'Pets', '🐾'], ['toys', 'Toys', '🧸'], ['sports', 'Sports', '⚽'], ['other', 'Other', '📦'],
];
export const catEmoji = (c) => CATEGORIES.find((x) => x[0] === c)?.[2] ?? '📦';
export const catLabel = (c) => CATEGORIES.find((x) => x[0] === c)?.[1] ?? c;
export const STATUS_FLOW = ['open', 'matched', 'claimed', 'verified', 'returned', 'closed'];

export function timeAgo(d, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000));
  if (s < 45) return 'just now';
  const units = [[60, 'min'], [3600, 'h'], [86400, 'd'], [604800, 'w']];
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 604800) return `${Math.round(s / 86400)} d ago`;
  void units;
  return new Date(d).toLocaleDateString();
}
export const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const initials = (n = '?') => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const errMsg = (e) => (e?.details?.length ? e.details.map((d) => `${d.path || 'input'}: ${d.message}`).join('; ') : e?.message ?? 'Something went wrong');

export function validatePassword(pw) {
  const issues = [];
  if (pw.length < 10) issues.push('at least 10 characters');
  if (new Set(pw).size <= 3) issues.push('too repetitive');
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
    if (!IMG_TYPES.includes(f.type)) errors.push(`${f.name}: only JPEG, PNG or WebP`);
    else if (f.size > MAX_IMG_MB * 1024 * 1024) errors.push(`${f.name}: larger than ${MAX_IMG_MB} MB`);
    else out.push(f);
  }
  if (out.length > max) { errors.push(`Maximum ${max} images`); out.length = max; }
  return { files: out, errors };
}
