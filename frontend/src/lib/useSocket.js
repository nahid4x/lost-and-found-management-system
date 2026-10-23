import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getToken, refresh } from './api.js';

/** One authenticated Socket.IO connection per session with exponential back-off and token refresh on rejection. */
export function useSocket(enabled) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const s = io({
      path: '/socket.io', transports: ['websocket', 'polling'], reconnection: true,
      reconnectionDelay: 1000, reconnectionDelayMax: 15000, randomizationFactor: 0.5,
      auth: (cb) => cb({ token: getToken() }),
    });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', (reason) => {
      setConnected(false);
      // Server-initiated disconnects (expired token) do not auto-reconnect: refresh, then reconnect.
      if (reason === 'io server disconnect') refresh().then((ok) => ok && s.connect());
    });
    s.on('connect_error', async (err) => { if (err.message === 'unauthorized') { if (await refresh()) s.connect(); } });
    setSocket(s);
    return () => { s.close(); setSocket(null); setConnected(false); };
  }, [enabled]);

  return { socket, connected };
}
