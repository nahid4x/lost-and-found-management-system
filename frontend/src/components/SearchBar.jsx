import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, MapPin, Tag, CalendarDays, ChevronDown } from 'lucide-react';
import { CATEGORIES } from '../lib/util.js';
import '../styles/searchbar.css';

const RADII = [1, 2, 5, 10, 25, 50];

const pad = (n) => String(n).padStart(2, '0');
/** Local yyyy-mm-dd (toISOString would shift the day for users ahead of UTC, e.g. Dhaka). */
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Default range: the same day last month (clamped to month end) up to today. */
export function defaultRange(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const lastDayPrev = new Date(y, m, 0).getDate();
  const from = new Date(y, m - 1, Math.min(today.getDate(), lastDayPrev));
  return { from: iso(from), to: iso(today) };
}

/** A filter button that opens a small panel under it. Closes on an outside click or Escape. */
function Filter({ icon, label, active, open, onToggle, onClose, wide, children }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [open, onClose]);
  return (
    <div className="sbar-pop" ref={ref}>
      <button type="button" className={`sbar-filter${active ? ' on' : ''}`} aria-haspopup="true" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {icon}<span className="sbar-filter-t">{label}</span><ChevronDown size={15} className="sbar-caret" aria-hidden />
      </button>
      {open && <div id={id} className={`sbar-panel${wide ? ' wide' : ''}`}>{children}</div>}
    </div>
  );
}

/** Search box for the item lists, with category, From/To date and "near me" filters. */
export default function SearchBar({ q, setQ, f, set, locate, clearLocation, clearAll }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState('');
  const close = useCallback(() => setOpen(''), []);
  const toggle = (k) => setOpen((o) => (o === k ? '' : k));
  const def = useMemo(() => defaultRange(), []);

  // Fill last month -> today whenever BOTH dates are empty: first load, after "Clear", and when
  // the parent empties them again (e.g. switching from Lost to Found items).
  // - One set() per pass: if the parent builds the next state from the current one, two calls in
  //   the same pass overwrite each other. The effect runs again after each update and fills "To".
  // - Runs after every render (no deps) so it still notices a parent reset that leaves the
  //   dates "empty -> empty". `tries` stops it if the parent keeps rejecting the value.
  // - Clearing just one field by hand is left alone, so the user can still edit freely.
  const refill = useRef(true);
  const tries = useRef(0);
  useEffect(() => {
    if (f.from && f.to) { refill.current = false; tries.current = 0; return; }
    if (!f.from && !f.to) refill.current = true;
    if (!refill.current || tries.current >= 4) return;
    tries.current += 1;
    if (f.from) set('to', def.to);
    else set('from', def.from);
  });

  const radius = String(f.radiusKm || '10');
  const dateChanged = Boolean((f.from && f.from !== def.from) || (f.to && f.to !== def.to));
  const active = Boolean(f.category || f.lat || dateChanged);
  const catName = (k) => t(`cat.${k}`, { defaultValue: CATEGORIES.find((c) => c[0] === k)?.[1] ?? k });

  return (
    <form className="sbar" role="search" aria-label={t('items.filters')} onSubmit={(e) => e.preventDefault()}>
      <div className="sbar-main">
        <Search size={20} className="sbar-ic" aria-hidden />
        <input className="sbar-input" type="search" aria-label={t('items.search')} value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" className="sbar-round" aria-label={t('items.clear')} onClick={() => setQ('')}><X size={16} /></button>}
      </div>

      <div className="sbar-filters">
        <Filter icon={<Tag size={16} />} label={f.category ? catName(f.category) : t('items.allCategories')} active={Boolean(f.category)} open={open === 'cat'} onToggle={() => toggle('cat')} onClose={close} wide>
          <div className="sbar-grid">
            <button type="button" className="sbar-chip" aria-pressed={!f.category} onClick={() => { set('category', ''); close(); }}>{t('items.allCategories')}</button>
            {CATEGORIES.map(([k]) => (
              <button key={k} type="button" className="sbar-chip" aria-pressed={f.category === k} onClick={() => { set('category', k); close(); }}>{catName(k)}</button>
            ))}
          </div>
        </Filter>

        {[['from', 'items.fromDate'], ['to', 'items.toDate']].map(([k, label]) => (
          <label key={k} className="sbar-filter sbar-datef">
            <CalendarDays size={16} aria-hidden />
            <span className="sbar-filter-t">{t(label)}</span>
            <input
              type="date"
              value={f[k]}
              min={k === 'to' ? f.from || undefined : undefined}
              max={k === 'from' ? f.to || def.to : def.to}
              onChange={(e) => set(k, e.target.value)}
            />
          </label>
        ))}

        <Filter icon={<MapPin size={16} />} label={f.lat ? `${t('items.nearMe')} · ${t('items.km', { value: radius })}` : t('items.nearMe')} active={Boolean(f.lat)} open={open === 'near'} onToggle={() => toggle('near')} onClose={close}>
          <p className="sbar-hint">{t('items.radius')}</p>
          <div className="sbar-grid">
            {RADII.map((r) => <button key={r} type="button" className="sbar-chip" aria-pressed={radius === String(r)} onClick={() => set('radiusKm', String(r))}>{t('items.km', { value: r })}</button>)}
          </div>
          {f.lat ? (
            <button type="button" className="sbar-link" onClick={() => { clearLocation(); close(); }}>{t('items.clear')}</button>
          ) : (
            <button type="button" className="sbar-use" onClick={locate}><MapPin size={16} /> {t('items.useLocation')}</button>
          )}
        </Filter>

        {active && <button type="button" className="sbar-clear" onClick={() => { refill.current = true; clearAll(); close(); }}><X size={14} /> {t('items.clear')}</button>}
      </div>
    </form>
  );
}