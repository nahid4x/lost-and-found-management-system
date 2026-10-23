import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refresh, setToken, onSessionChange } from '../lib/api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSessionChange(setUser);
    refresh().finally(() => setReady(true)); // silent session restore from the httpOnly cookie
  }, []);

  const adopt = useCallback((d) => { setToken(d.accessToken); setUser(d.user); return d.user; }, []);
  const login = useCallback(async (email, password) => adopt(await api.post('/auth/login', { email, password })), [adopt]);
  const register = useCallback(async (name, email, password) => adopt(await api.post('/auth/register', { name, email, password })), [adopt]);
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* cookie cleared server-side when possible */ }
    setToken(null); setUser(null);
  }, []);
  const updateUser = useCallback((patch) => setUser((u) => (u ? { ...u, ...patch } : u)), []);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, updateUser, isAdmin: user?.role === 'admin' }),
    [user, ready, login, register, logout, updateUser]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}