export function onShutdown(fn) {
  let done = false;
  const handler = async () => { if (done) return; done = true; try { await fn(); } finally { process.exit(0); } };
  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
}
