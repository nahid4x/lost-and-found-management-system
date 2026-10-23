import { useEffect, useId, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Glass({ as: T = 'div', pad, hover, className, children, ...p }) {
  return <T className={cx('glass', pad && 'pad', hover && 'hover', className)} {...p}>{children}</T>;
}

export function Button({ variant, size, loading, children, className, ...p }) {
  return (
    <button className={cx('btn', variant, size, className)} aria-busy={loading || undefined} disabled={loading || p.disabled} {...p}>
      {loading && <span className="spinner" aria-hidden />}{children}
    </button>
  );
}

/** Label + control + inline validation message, wired with aria attributes. */
export function Field({ label, error, hint, as = 'input', children, className, ...p }) {
  const id = useId();
  const Tag = as;
  const cls = as === 'select' ? 'select' : as === 'textarea' ? 'textarea' : 'input';
  return (
    <div className={cx('field', error && 'invalid', className)}>
      {label && <label htmlFor={id}>{label}</label>}
      <Tag id={id} className={cls} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} {...p}>{children}</Tag>
      {error ? <span id={`${id}-e`} className="err" role="alert">{error}</span> : hint ? <span id={`${id}-h`} className="hint">{hint}</span> : null}
    </div>
  );
}

export function Modal({ open, onClose, title, wide, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const first = ref.current?.querySelector('input,textarea,select,button');
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') { // keep focus inside the dialog
        const els = ref.current.querySelectorAll('a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const [f, l] = [els[0], els[els.length - 1]];
        if (e.shiftKey && document.activeElement === f) { e.preventDefault(); l.focus(); } else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={cx('glass modal', wide && 'wide')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{title}</h2><span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Skeleton = ({ h = 120, className }) => <div className={cx('skeleton', className)} style={{ minHeight: h }} aria-hidden />;
export const SkeletonGrid = ({ n = 6, h = 280 }) => <div className="grid cards" aria-busy="true" aria-label="Loading">{Array.from({ length: n }, (_, i) => <Skeleton key={i} h={h} />)}</div>;

export function Empty({ icon = '🔍', title, children, action }) {
  return <Glass className="empty"><div className="big" aria-hidden>{icon}</div><h3>{title}</h3><p className="muted">{children}</p>{action}</Glass>;
}

export const Chip = ({ kind, children }) => <span className={cx('chip', kind)}>{children ?? kind}</span>;

/** Fades/slides children in; disabled for users who prefer reduced motion. */
export function Reveal({ children, delay = 0, className }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div className={className} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label, count]) => (
        <button key={k} role="tab" className="tab" aria-selected={value === k} onClick={() => onChange(k)}>{label}{count != null && <span className="badge" style={{ marginLeft: 8 }}>{count}</span>}</button>
      ))}
    </div>
  );
}

export function BarChart({ data, height = 140 }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height / 2}`} width="100%" role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height / 2 - 14);
        return (
          <g key={d.label}>
            <rect x={i * w + w * 0.18} y={height / 2 - 12 - h} width={w * 0.64} height={h} rx="1.5" fill="url(#bg)" />
            <text x={i * w + w / 2} y={height / 2 - 3} textAnchor="middle" fontSize="3.2" fill="#b4bbe0">{d.label}</text>
            <text x={i * w + w / 2} y={height / 2 - 14 - h} textAnchor="middle" fontSize="3.4" fill="#f5f7ff">{d.value}</text>
          </g>
        );
      })}
      <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2dd4bf" /><stop offset="1" stopColor="#8b6dff" /></linearGradient></defs>
    </svg>
  );
}
