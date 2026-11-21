import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Bell, X } from 'lucide-react';

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
            <span aria-hidden style={{ display: 'inline-flex' }}>
              {t.type === 'success' ? <CheckCircle2 size={20} strokeWidth={1.75} color="#4ade80" /> : t.type === 'error' ? <AlertTriangle size={20} strokeWidth={1.75} color="#fbbf24" /> : <Bell size={20} strokeWidth={1.75} />}
            </span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Dismiss" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}><X size={14} strokeWidth={1.75} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}