import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapView } from '../components/maps.jsx';
import { Glass, Button, Reveal } from '../components/ui.jsx';
import { api, qs } from '../lib/api.js';
import { CATEGORIES } from '../lib/util.js';

export default function MapPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(null);
  useEffect(() => { api.get(`/items/map${qs({ type, category })}`).then((d) => setItems(d.items)).catch(() => setItems([])); }, [type, category]);
  return (
    <div className="container">
      <Reveal>
        <div className="row" style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: '2.2rem' }}>{t('map.title')}</h1><span className="spacer" />
          <select className="select" style={{ width: 160 }} aria-label={t('map.type')} value={type} onChange={(e) => setType(e.target.value)}><option value="">{t('map.both')}</option><option value="lost">{t('status.lost')}</option><option value="found">{t('status.found')}</option></select>
          <select className="select" style={{ width: 190 }} aria-label={t('items.category')} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">{t('items.allCategories')}</option>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{t(`cat.${k}`, { defaultValue: l })}</option>)}</select>
        </div>
        <p className="muted small"><span className="chip lost">● {t('status.lost')}</span> <span className="chip found">● {t('status.found')}</span> {t('map.privacy')} {t('map.onMap', { n: items.length })}</p>
      </Reveal>
      <MapView tall items={items} onSelect={setSel} />
      {sel && <Glass pad style={{ marginTop: 14 }} className="row"><span className={`chip ${sel.type}`}>{t(`status.${sel.type}`, { defaultValue: sel.type })}</span><strong>{sel.title}</strong><span className="muted">📍 {sel.area}</span><span className="spacer" /><Button variant="primary" size="sm" onClick={() => nav(`/items/${sel.id}`)}>{t('map.viewDetails')}</Button></Glass>}
    </div>
  );
}