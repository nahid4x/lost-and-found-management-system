/** Remove Mongo operator keys ($...) and dotted keys from untrusted objects, in place. */
export function stripMongoKeys(value, depth = 0) {
  if (value == null || typeof value !== 'object' || depth > 8) return value;
  if (Array.isArray(value)) {
    value.forEach((v) => stripMongoKeys(v, depth + 1));
    return value;
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete value[key];
    } else {
      stripMongoKeys(value[key], depth + 1);
    }
  }
  return value;
}

export function sanitizeRequest(req, _res, next) {
  stripMongoKeys(req.body);
  stripMongoKeys(req.query);
  stripMongoKeys(req.params);
  next();
}

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Plain-text normaliser: strips control characters and angle brackets, collapses whitespace. */
export function plainText(s, max = 5000) {
  return String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Only http(s) URLs are accepted. */
export function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
