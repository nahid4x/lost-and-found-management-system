const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const REDACT = /pass|secret|token|authorization|cookie|answer|email|phone|hash|proof|text/i;

function redact(v, depth = 0) {
  if (v == null || depth > 4) return v;
  if (v instanceof Error) return { name: v.name, message: v.message };
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = REDACT.test(k) ? '[redacted]' : redact(val, depth + 1);
    return out;
  }
  return v;
}

export function createLogger(service, level = 'info') {
  const min = LEVELS[level] ?? LEVELS.info;
  const emit = (lvl, msg, meta) => {
    if (LEVELS[lvl] < min) return;
    const line = JSON.stringify({ t: new Date().toISOString(), lvl, svc: service, msg, ...(meta ? { meta: redact(meta) } : {}) });
    (lvl === 'error' ? process.stderr : process.stdout).write(line + '\n');
  };
  return {
    debug: (m, x) => emit('debug', m, x),
    info: (m, x) => emit('info', m, x),
    warn: (m, x) => emit('warn', m, x),
    error: (m, x) => emit('error', m, x),
  };
}
