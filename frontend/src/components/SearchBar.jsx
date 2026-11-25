import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, MapPin, Tag, CalendarDays, ChevronDown } from 'lucide-react';
import { CATEGORIES } from '../lib/util.js';
import '../styles/searchbar.css';

const RADII = [1, 2, 5, 10, 25, 50];

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

/** Search box for the item lists, with category, date and "near me" filters that open as small panels. */
export default function SearchBar({ q, setQ, f, set, locate, clearLocation, clearAll }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState('');
  const close = useCallback(() => setOpen(''), []);
  const toggle = (k) => setOpen((o) => (o === k ? '' : k));
  const radius = String(f.radiusKm || '10');
  const active = [f.category, f.from, f.to, f.lat].some(Boolean);
  const catName = (k) => t(`cat.${k}`, { defaultValue: CATEGORIES.find((c) => c[0] === k)?.[1] ?? k });
  const dateLabel = f.from && f.to ? `${f.from} – ${f.to}` : f.from ? `${t('items.fromDate')}: ${f.from}` : f.to ? `${t('items.toDate')}: ${f.to}` : t('items.anyDate');

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

        <Filter icon={<CalendarDays size={16} />} label={dateLabel} active={Boolean(f.from || f.to)} open={open === 'date'} onToggle={() => toggle('date')} onClose={close}>
          {[['from', 'items.fromDate'], ['to', 'items.toDate']].map(([k, label]) => (
            <label key={k} className="sbar-date"><span>{t(label)}</span>
              <input type="date" value={f[k]} onChange={(e) => set(k, e.target.value)} />
              {f[k] && <button type="button" className="sbar-round small" aria-label={`${t('items.clear')} ${t(label)}`} onClick={() => set(k, '')}><X size={14} /></button>}
            </label>
          ))}
        </Filter>

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

        {active && <button type="button" className="sbar-clear" onClick={() => { clearAll(); close(); }}><X size={14} /> {t('items.clear')}</button>}
      </div>
    </form>
  );
}
