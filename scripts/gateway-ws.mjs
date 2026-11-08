// WebSocket through the gateway: unauthenticated rejected, authenticated connects. BASE=https://localhost node scripts/gateway-ws.mjs <accessToken>
import { io } from '../services/node_modules/socket.io-client/build/esm-debug/index.js';
const BASE = process.env.BASE ?? 'https://localhost';
const token = process.argv[2];
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const attempt = (auth, transports) => new Promise((res) => {
  const s = io(BASE, { auth, transports, reconnection: false, rejectUnauthorized: false });
  const t = setTimeout(() => { s.close(); res('timeout'); }, 6000);
  s.on('connect', () => { clearTimeout(t); s.close(); res('connected'); });
  s.on('connect_error', (e) => { clearTimeout(t); s.close(); res(`rejected:${e.message}`); });
});
const noAuth = await attempt({}, ['websocket']);
const ws = await attempt({ token }, ['websocket']);
const poll = await attempt({ token }, ['polling']);
console.log(`  ${noAuth === 'rejected:unauthorized' ? 'ok  ' : 'FAIL'} - websocket without token: ${noAuth}`);
console.log(`  ${ws === 'connected' ? 'ok  ' : 'FAIL'} - websocket with token through gateway: ${ws}`);
console.log(`  ${poll === 'connected' ? 'ok  ' : 'FAIL'} - long-polling fallback through gateway: ${poll}`);
process.exit(noAuth === 'rejected:unauthorized' && ws === 'connected' && poll === 'connected' ? 0 : 1);
