import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './Auth.jsx';
import { useToast } from './Toast.jsx';
import { useSocket } from '../lib/useSocket.js';
import { api } from '../lib/api.js';

const Ctx = createContext(null);
export const useLive = () => useContext(Ctx);

/** Live layer: socket, unread counters for the navbar, and toasts for incoming notifications. */
export function LiveProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const { socket, connected } = useSocket(Boolean(user));
  const [unreadNotifs, setNotifs] = useState(0);
  const [unreadMsgs, setMsgs] = useState(0);

  const refreshCounts = useCallback(async () => {
    if (!user) return;
    try {
      const [n, m] = await Promise.all([api.get('/notify/notifications/unread-count'), api.get('/realtime/unread-count')]);
      setNotifs(n.unread); setMsgs(m.unread);
    } catch { /* counters are best-effort */ }
  }, [user]);

  useEffect(() => { if (user) refreshCounts(); else { setNotifs(0); setMsgs(0); } }, [user, refreshCounts]);
  useEffect(() => { if (connected) refreshCounts(); }, [connected, refreshCounts]); // re-sync after a reconnect

  useEffect(() => {
    if (!socket) return undefined;
    const onNotif = (n) => { setNotifs((c) => c + 1); toast.info(n.title ?? 'New notification'); };
    const onMsg = () => setMsgs((c) => c + 1);
    socket.on('notification:new', onNotif);
    socket.on('message:new', onMsg);
    return () => { socket.off('notification:new', onNotif); socket.off('message:new', onMsg); };
  }, [socket, toast]);

  const value = useMemo(() => ({ socket, connected, unreadNotifs, unreadMsgs, refreshCounts }), [socket, connected, unreadNotifs, unreadMsgs, refreshCounts]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
