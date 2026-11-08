// Cross-service smoke test: boots all six services as real processes against local MongoDB-compatible DB + Redis,
// then drives the full flow over HTTP and Socket.IO. Run: node scripts/e2e-local.mjs
import { spawn } from 'node:child_process';
import { io as client } from '../services/node_modules/socket.io-client/build/esm-debug/index.js';
import crypto from 'node:crypto';

const MONGO = process.env.E2E_MONGO ?? 'mongodb://127.0.0.1:27017';
const base = {
  NODE_ENV: 'production', LOG_LEVEL: 'error', REDIS_URL: process.env.E2E_REDIS ?? 'redis://127.0.0.1:6379', MONGO_AUTO_INDEX: 'false',
  JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
  INTERNAL_SERVICE_TOKEN: crypto.randomBytes(32).toString('hex'), CORS_ORIGINS: 'https://findit.local', BCRYPT_COST: '12', TRUST_PROXY_HOPS: '0',
  CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 'unused-secret-for-e2e-no-uploads', APP_URL: 'https://findit.local',
  AUTH_URL: 'http://127.0.0.1:4001', MATCHING_URL: 'http://127.0.0.1:4003', ITEMS_URL: 'http://127.0.0.1:4002',
};
const SVC = { auth: 4001, items: 4002, matching: 4003, claims: 4004, realtime: 4005, notify: 4006 };
const dbSuffix = Date.now();
const procs = [];
const fail = (m) => { console.error(`FAIL: ${m}`); procs.forEach((p) => p.kill('SIGTERM')); process.exit(1); };
let passed = 0;
const ok = (cond, label) => { if (!cond) fail(label); passed++; console.log(`  ok - ${label}`); };
function cleanup(code = 0) { procs.forEach((p) => p.kill('SIGTERM')); setTimeout(() => process.exit(code), 300); }

for (const [name, port] of Object.entries(SVC)) {
  const p = spawn('node', ['src/index.js'], { cwd: new URL(`../services/${name}/`, import.meta.url).pathname, env: { ...process.env, ...base, PORT: String(port), MONGO_URL: `${MONGO}/e2e_${name}_${dbSuffix}` }, stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('exit', (c) => { if (c && c !== 0 && c !== null) fail(`${name} exited with ${c}`); });
  procs.push(p);
}
const url = (svc, path) => `http://127.0.0.1:${SVC[svc]}${path}`;
const waitHealthy = async () => {
  for (const [n, port] of Object.entries(SVC)) {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch { /* retry */ }
      if (i > 80) fail(`${n} did not become healthy`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
};
const J = async (svc, path, { method = 'GET', token, body, form } = {}) => {
  const r = await fetch(url(svc, path), { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), 'x-requested-with': 'findit' }, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null, headers: r.headers };
};
const waitFor = async (fn, label, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 150)); } fail(`timeout: ${label}`); };
const itemForm = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const sock = (token) => new Promise((res, rej) => { const s = client('http://127.0.0.1:4005', { auth: { token }, transports: ['websocket'], reconnection: false }); s.on('connect', () => res(s)); s.on('connect_error', rej); });
const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));

try {
  await waitHealthy();
  console.log('all services healthy');
  const pw = 'Correct-Horse-Battery-9';
  const reg = async (name, email) => (await J('auth', '/register', { method: 'POST', body: { name, email, password: pw } })).body;
  const alice = await reg('Alice Finder', `alice${dbSuffix}@example.com`);
  const bob = await reg('Bob Loser', `bob${dbSuffix}@example.com`);
  ok(alice.accessToken && bob.accessToken, 'register two users (bcrypt cost 12) and receive access tokens');
  ok((await J('items', '/', { method: 'POST', body: {} })).status === 401, 'items: anonymous create rejected');

  // Alice found a phone, Bob lost one
  const found = await J('items', '/', { method: 'POST', token: alice.accessToken, form: itemForm({ type: 'found', title: 'Black Samsung phone', description: 'Black Samsung phone with cracked screen and red case, found near library.', category: 'electronics', date: new Date(Date.now() - 86400000).toISOString(), lat: '23.8762', lng: '90.3205', areaLabel: 'Ashulia, Dhaka', verification: JSON.stringify([{ question: 'What is the lock-screen wallpaper?', answer: 'A blue mountain', type: 'text', weight: 2 }, { question: 'How much cash was inside?', answer: '2500', type: 'number' }]), heldAt: 'Library desk', contactNote: '01700-000000' }) });
  ok(found.status === 201, 'items: found report created');
  const lost = await J('items', '/', { method: 'POST', token: bob.accessToken, form: itemForm({ type: 'lost', title: 'Lost black Samsung phone', description: 'Black Samsung phone, red case and a cracked screen. Lost around the library.', category: 'electronics', date: new Date(Date.now() - 2 * 86400000).toISOString(), lat: '23.8760', lng: '90.3201', areaLabel: 'Ashulia, Dhaka' }) });
  ok(lost.status === 201, 'items: lost report created');
  const foundId = found.body.item.id; const lostId = lost.body.item.id;

  const bobMatches = await waitFor(async () => { const r = await J('items', `/${lostId}/matches`, { token: bob.accessToken }); return r.body?.matches?.length ? r.body.matches : null; }, 'AI match to appear (events: items -> matching -> items)');
  ok(bobMatches[0].score >= 45 && bobMatches[0].reasons.length === 5, `matching: score ${bobMatches[0].score} with explainable reasons`);
  ok((await J('items', `/${lostId}/matches`, { token: alice.accessToken })).status === 404, 'items: other user cannot read match suggestions (IDOR)');
  ok((await fetch('http://127.0.0.1:4003/internal/matches')).status === 403, 'matching: internal API rejects calls without service token');

  const bobNotifs = await waitFor(async () => { const r = await J('notify', '/notifications', { token: bob.accessToken }); return r.body?.items?.length ? r.body : null; }, 'match notification for Bob');
  ok(bobNotifs.items[0].type === 'match' && bobNotifs.unread === 1, 'notify: match notification stored for the lost-item owner');
  ok((await waitFor(async () => (await J('notify', '/notifications', { token: alice.accessToken })).body?.items?.length, 'notification for Alice')) > 0, 'notify: match notification stored for the finder');
  const st = await waitFor(async () => { const r = await J('items', `/${foundId}`); return r.body.item.status === 'matched' ? r.body.item : null; }, 'item status -> matched');
  ok(st.location === undefined && st.heldAt === undefined, 'items: public view hides exact location, held-at and contact');

  // claim flow
  const qs = await J('claims', `/questions/${foundId}`, { token: bob.accessToken });
  ok(qs.status === 200 && qs.body.questions.length === 2 && qs.body.verification[1].type === 'number', 'claims: claimant receives the private questions (no answers)');
  ok(!JSON.stringify(qs.body).match(/mountain|2500/i), 'claims: question payload contains no answers');
  const anon = await J('items', `/${foundId}`);
  ok(!JSON.stringify(anon.body).match(/mountain|2500/i) && !JSON.stringify(bobMatches).match(/mountain|2500/i), 'items: public report never contains the private answers');
  ok((await J('items', `/${foundId}/verification`, { token: bob.accessToken })).status === 404 && (await J('items', `/${foundId}/verification`)).status === 401, 'items: other users and anonymous cannot read the answers');
  const own = await J('items', `/${foundId}/verification`, { token: alice.accessToken });
  ok(own.status === 200 && own.body.verification.some((v) => v.answer === 'A blue mountain'), 'items: the owner can read back her own answers');
  ok((await fetch('http://127.0.0.1:4002/internal/items/' + foundId + '/verification')).status === 403, 'items: internal scoring endpoint rejects calls without the service token');
  ok((await J('claims', `/questions/${foundId}`, { token: alice.accessToken })).status === 404, 'claims: finder cannot claim own item');
  const cf = new FormData(); cf.append('itemId', foundId); cf.append('answers', JSON.stringify(['a  BLUE mountain!', '৳ 2,500']));
  const claim = await J('claims', '/', { method: 'POST', token: bob.accessToken, form: cf });
  ok(claim.status === 201, 'claims: claim submitted');
  ok((await waitFor(async () => (await J('items', `/${foundId}`)).body.item.status === 'claimed', 'status -> claimed')), 'items: status moved to claimed via event');
  const recv = await J('claims', '/received', { token: alice.accessToken });
  ok(recv.body.claims[0].answers[0].answer === 'a  BLUE mountain!', 'claims: finder sees the claimant answers');
  const vv = recv.body.claims[0].verification;
  ok(vv.scored && vv.score === 100 && vv.matched === 2 && vv.total === 2 && vv.level === 'high', `claims: server-side score ${vv.score}% (${vv.matched}/${vv.total}) computed across services with formatting normalised`);
  ok(!JSON.stringify(recv.body).includes('A blue mountain'), 'claims: the correct answers are not exposed in the review payload');
  const bobClaims = await J('claims', '/mine', { token: bob.accessToken });
  ok(!JSON.stringify(bobClaims.body).match(/"score"|perQuestion|"level"|matched/), 'claims: the claimant sees no score or per-answer result');
  const mal = await reg('Mallory Two', `mal2${dbSuffix}@example.com`);
  const mf = new FormData(); mf.append('itemId', foundId); mf.append('answers', JSON.stringify(['green hills', '10']));
  const malClaim = await J('claims', '/', { method: 'POST', token: mal.accessToken, form: mf });
  ok(malClaim.status === 201, 'claims: a second claimant submits wrong answers');
  const recv2 = await J('claims', '/received', { token: alice.accessToken });
  ok(recv2.body.claims.find((c) => c.claimantName === 'Mallory Two').verification.score === 0, 'claims: the wrong claimant scores 0%');
  ok((await J('claims', `/${claim.body.claim.id}`, { token: mal.accessToken })).status === 404, 'claims: a claimant cannot open another claimant’s claim');
  const dup = new FormData(); dup.append('itemId', foundId); dup.append('answers', JSON.stringify(['a blue mountain', '2500']));
  ok((await J('claims', '/', { method: 'POST', token: mal.accessToken, form: dup })).status === 409, 'claims: re-submitting answers for the same item is refused (no brute force)');
  const ri = await J('claims', `/${malClaim.body.claim.id}/request-info`, { method: 'POST', token: alice.accessToken, body: { message: 'Please describe the case.' } });
  ok(ri.status === 200 && ri.body.claim.reviewState === 'more_info_requested', 'claims: finder can request more information');
  ok((await J('claims', `/${claim.body.claim.id}`, { token: (await reg('Mallory', `mal${dbSuffix}@example.com`)).accessToken })).status === 404, 'claims: stranger cannot read a claim (IDOR)');

  const bobSock = await sock(bob.accessToken);
  const aliceSock = await sock(alice.accessToken);
  const convNew = new Promise((r) => bobSock.once('conversation:new', r));
  const dec = await J('claims', `/${claim.body.claim.id}/decision`, { method: 'POST', token: alice.accessToken, body: { decision: 'approve' } });
  ok(dec.status === 200 && dec.body.claim.status === 'approved', 'claims: finder approves');
  const conv = await Promise.race([convNew, new Promise((r) => setTimeout(() => r(null), 5000))]);
  ok(conv && conv.other.name === 'Alice Finder', 'realtime: private conversation created and pushed live on approval');
  const ver = await waitFor(async () => { const r = await J('items', `/${foundId}`, { token: bob.accessToken }); return r.body.item.status === 'verified' ? r.body.item : null; }, 'status -> verified');
  ok(ver.location && ver.heldAt === 'Library desk' && ver.contactNote, 'items: approved claimant now sees exact location, held-at and contact');
  ok((await J('items', `/${foundId}`)).body.item.location === undefined, 'items: anonymous still sees nothing private');

  // live chat
  const incoming = new Promise((r) => aliceSock.once('message:new', r));
  const t0 = Date.now();
  const ack = await emit(bobSock, 'message:send', { conversationId: conv.id, text: 'Hi Alice, thanks for finding my phone!', clientId: crypto.randomUUID() });
  const got = await Promise.race([incoming, new Promise((r) => setTimeout(() => r(null), 3000))]);
  ok(ack.ok && got?.text.startsWith('Hi Alice') && Date.now() - t0 < 1000, `realtime: message delivered live in ${Date.now() - t0} ms`);
  ok((await J('realtime', `/conversations/${conv.id}/messages`, { token: alice.accessToken })).body.messages.length === 1, 'realtime: history persisted');
  const unreadA = await J('realtime', '/unread-count', { token: alice.accessToken });
  ok(unreadA.body.unread === 1, 'realtime: unread counter');

  // return + close
  const ret = await J('claims', `/${claim.body.claim.id}/returned`, { method: 'POST', token: bob.accessToken });
  ok(ret.status === 200, 'claims: marked returned');
  const closed = await waitFor(async () => { const r = await J('items', `/${foundId}`, { token: alice.accessToken }); return r.body.item.status === 'closed' ? r.body.item : null; }, 'status -> closed');
  ok(closed.history.map((h) => h.to).join('>') === 'open>matched>claimed>verified>returned>closed', 'items: full status history open>matched>claimed>verified>returned>closed with actors');
  ok((await J('items', '/stats')).body.recovered === 1, 'items: recovered counter incremented');

  // admin
  ok((await J('auth', '/admin/users', { token: alice.accessToken })).status === 403, 'auth: normal user denied on /admin/users');
  const { spawnSync } = await import('node:child_process');
  const adminPw = `Adm1n-${crypto.randomBytes(9).toString('hex')}`;
  const seed = spawnSync('node', ['src/seed-admin.js'], { cwd: new URL('../services/auth/', import.meta.url).pathname, env: { ...process.env, ...base, MONGO_URL: `${MONGO}/e2e_auth_${dbSuffix}`, ADMIN_EMAIL: `root${dbSuffix}@example.com`, ADMIN_PASSWORD: adminPw }, encoding: 'utf8' });
  ok(seed.status === 0, 'seed-admin script creates the admin from a runtime-supplied password');
  const adm = (await J('auth', '/login', { method: 'POST', body: { email: `root${dbSuffix}@example.com`, password: adminPw } })).body;
  ok(adm.user.role === 'admin', 'admin can log in');
  ok((await J('auth', '/admin/users', { token: adm.accessToken })).body.total >= 4, 'auth: admin lists users');
  ok((await J('items', '/admin/items', { token: adm.accessToken })).status === 200, 'items: admin route works (role verified via Auth service)');
  const audit = await waitFor(async () => { const r = await J('claims', '/admin/audit?limit=50', { token: adm.accessToken }); return r.body?.total > 5 ? r.body : null; }, 'audit log entries');
  const actions = new Set(audit.entries.map((e) => e.action));
  ok(['claim.create', 'claim.approve', 'claim.returned', 'item.create', 'user.register'].every((a) => actions.has(a)), `claims: audit log aggregates events from all services (${audit.total} entries)`);
  ok((await J('claims', '/admin/audit', { token: alice.accessToken })).status === 403, 'claims: audit log is admin-only');

  bobSock.close(); aliceSock.close();
  console.log(`\nE2E PASSED: ${passed} checks`);
  cleanup(0);
} catch (e) { fail(e?.stack ?? String(e)); }
