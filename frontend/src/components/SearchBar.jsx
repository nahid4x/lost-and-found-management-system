import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, SlidersHorizontal, X, MapPin } from 'lucide-react';
import { CATEGORIES } from '../lib/util.js';
import '../styles/searchbar.css';

const RADII = [1, 2, 5, 10, 25, 50];

/** Search box with category chips, date range and "near me" filters for the item lists. */
export default function SearchBar({ q, setQ, f, set, locate, clearLocation, clearAll }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panel = useId();
  const active = [f.category, f.from, f.to, f.lat].filter(Boolean).length;
  const radius = String(f.radiusKm || '10');

  return (
    <form className="sbar" role="search" aria-label={t('items.filters')} onSubmit={(e) => e.preventDefault()}>
      <div className="sbar-main">
        <Search size={20} className="sbar-ic" aria-hidden />
        <input className="sbar-input" type="search" aria-label={t('items.search')} value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" className="sbar-round" aria-label={t('items.clear')} onClick={() => setQ('')}><X size={16} /></button>}
        <button type="button" className="sbar-toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal size={16} /> {t('items.filters')}{active > 0 && <span className="sbar-count">{active}</span>}
        </button>
      </div>

      <div id={panel} className={`sbar-panel${open ? ' open' : ''}`}>
        <div className="sbar-cats" role="group" aria-label={t('items.category')}>
          <button type="button" className="sbar-chip" aria-pressed={!f.category} onClick={() => set('category', '')}>{t('items.allCategories')}</button>
          {CATEGORIES.map(([k, l]) => (
            <button key={k} type="button" className="sbar-chip" aria-pressed={f.category === k} onClick={() => set('category', f.category === k ? '' : k)}>
              {t(`cat.${k}`, { defaultValue: l })}
            </button>
          ))}
        </div>

        <div className="sbar-row">
          <label className="sbar-date"><span>{t('items.fromDate')}</span><input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
          <label className="sbar-date"><span>{t('items.toDate')}</span><input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
          <div className="sbar-near">
            <button type="button" className="sbar-chip" aria-pressed={Boolean(f.lat)} onClick={f.lat ? clearLocation : locate}>
              <MapPin size={15} /> {f.lat ? t('items.nearMe') : t('items.useLocation')}
            </button>
            {f.lat && (
              <div className="sbar-radii" role="group" aria-label={t('items.radius')}>
                {RADII.map((r) => <button key={r} type="button" className="sbar-chip small" aria-pressed={radius === String(r)} onClick={() => set('radiusKm', String(r))}>{t('items.km', { value: r })}</button>)}
              </div>
            )}
          </div>
          {active > 0 && <button type="button" className="sbar-clear" onClick={clearAll}><X size={14} /> {t('items.clear')}</button>}
        </div>
      </div>
    </form>
  );
}
