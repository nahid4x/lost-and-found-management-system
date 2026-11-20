// Strip control chars and angle brackets. React escapes on render; this is defence in depth.
exports.clean = (s = '', max = 1000) =>
  String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[<>]/g, '').trim().slice(0, max);
exports.escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
