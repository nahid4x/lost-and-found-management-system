// Fails the build when the bundle contains anything that looks like a secret or a server credential.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'dist';
const patterns = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/(?:api[_-]?secret|client[_-]?secret|jwt[_-]?secret|internal[_-]?service[_-]?token)["'\s:=]+[A-Za-z0-9_\-]{16,}/i, 'secret assignment'],
  [/mongodb(?:\+srv)?:\/\/[^\s"']+:[^\s"']+@/i, 'database URL with credentials'],
  [/redis:\/\/:[^\s"']+@/i, 'redis URL with password'],
  [/cloudinary:\/\/\d+:[^\s"']+@/i, 'cloudinary URL with secret'],
  [/xox[abprs]-[A-Za-z0-9-]{10,}/, 'slack token'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'API key (sk-)'],
];
const bad = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|css|html|json|map)$/.test(f.name)) scan(p); } };
function scan(p) { const t = fs.readFileSync(p, 'utf8'); for (const [re, label] of patterns) if (re.test(t)) bad.push(`${p}: ${label}`); if (/\.map$/.test(p)) bad.push(`${p}: source map shipped`); }
walk(dir);
if (bad.length) { console.error(`dist secret scan FAILED:\n${bad.join('\n')}`); process.exit(1); }
console.log('dist secret scan passed');
