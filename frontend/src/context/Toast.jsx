import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const Ctx = createContext(null);
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'info', ms = 5000) => {
    const id = crypto.randomUUID();
    setItems((x) => [...x.slice(-3), { id, message, type }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), ms);
  }, []);
  const api = useMemo(() => ({ push, success: (m) => push(m, 'success'), error: (m) => push(m, 'error', 7000), info: (m) => push(m, 'info') }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast glass ${t.type}`}>
            <span aria-hidden>{t.type === 'success' ? '✅' : t.type === 'error' ? '⚠️' : '🔔'}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button className="icon-btn" style={{ width: 28, height: 28, fontSize: 14 }} aria-label="Dismiss" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}>✕</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
