import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListChecks, MapPinned, SearchX } from 'lucide-react';
import { Button, Empty, SkeletonGrid, Reveal } from '../components/ui.jsx';
import SearchBar from '../components/SearchBar.jsx';
import { ItemCard } from '../components/ItemParts.jsx';
import { MapView } from '../components/maps.jsx';
import { api, qs } from '../lib/api.js';
import { errMsg } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

export default function ItemsPage({ type }) {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const f = { q: sp.get('q') ?? '', category: sp.get('category') ?? '', from: sp.get('from') ?? '', to: sp.get('to') ?? '', radiusKm: sp.get('radiusKm') ?? '', lat: sp.get('lat') ?? '', lng: sp.get('lng') ?? '' };
  const [view, setView] = useState('list');
  const [items, setItems] = useState(null);
  const [mapItems, setMapItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(f.q);
  const reqId = useRef(0);

  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  useEffect(() => { const timer = setTimeout(() => q !== f.q && set('q', q.trim()), 350); return () => clearTimeout(timer); }, [q]); // debounce search typing
  useEffect(() => { setQ(sp.get('q') ?? ''); }, [type]);

  const key = JSON.stringify([type, f]);
  const load = useCallback(async (p, append) => {
    const id = ++reqId.current; setLoading(true);
    try {
      const d = await api.get(`/items/${qs({ type, q: f.q, category: f.category, from: f.from, to: f.to, lat: f.lat, lng: f.lng, radiusKm: f.lat ? f.radiusKm || 10 : '', page: p, limit: 12 })}`);
      if (id !== reqId.current) return; // ignore stale responses
      setItems((cur) => (append ? [...(cur ?? []), ...d.items] : d.items)); setTotal(d.total); setPage(p);
    } catch (e) { if (id === reqId.current) { toast.error(errMsg(e)); setItems((c) => c ?? []); } } finally { if (id === reqId.current) setLoading(false); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setItems(null); load(1, false); }, [load]);
  useEffect(() => { if (view === 'map') api.get(`/items/map${qs({ type, category: f.category })}`).then((d) => setMapItems(d.items)).catch(() => {}); }, [view, type, f.category]); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => navigator.geolocation?.getCurrentPosition((p) => { const n = new URLSearchParams(sp); n.set('lat', p.coords.latitude.toFixed(4)); n.set('lng', p.coords.longitude.toFixed(4)); if (!n.get('radiusKm')) n.set('radiusKm', '10'); setSp(n, { replace: true }); }, () => toast.error(t('items.locationDenied')));

  const clearLocation = () => { const n = new URLSearchParams(sp); ['lat', 'lng', 'radiusKm'].forEach((k) => n.delete(k)); setSp(n, { replace: true }); };
  const clearAll = () => { setQ(''); setSp(new URLSearchParams(), { replace: true }); };

  return (
    <div className="container">
      <Reveal>
        <div className="row" style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: '2.2rem' }}>{type === 'lost' ? t('items.lostTitle') : t('items.foundTitle')}</h1><span className="spacer" />
          <Button size="sm" aria-pressed={view === 'list'} onClick={() => setView('list')}><ListChecks size={14} /> {t('items.list')}</Button>
          <Button size="sm" aria-pressed={view === 'map'} onClick={() => setView('map')}><MapPinned size={14} /> {t('items.map')}</Button>
          <Button variant="primary" size="sm" onClick={() => nav(`/report/${type}`)}>{type === 'lost' ? t('items.reportLost') : t('items.reportFound')}</Button>
        </div>
        <SearchBar q={q} setQ={setQ} f={f} set={set} locate={locate} clearLocation={clearLocation} clearAll={clearAll} />
      </Reveal>
      {view === 'map' ? <MapView tall items={mapItems} onSelect={(i) => nav(`/items/${i.id}`)} /> : !items ? <SkeletonGrid /> : !items.length ? (
        <Empty icon={<SearchX size={40} strokeWidth={1.5} />} title={t('items.emptyTitle')} action={<Button variant="primary" onClick={() => nav(`/report/${type}`)}>{t('items.createReport')}</Button>}>{type === 'lost' ? t('items.emptyLost') : t('items.emptyFound')}</Empty>
      ) : (
        <>
          <p className="muted" aria-live="polite">{t('items.results', { count: total })}</p>
          <div className="grid cards">{items.map((i) => <ItemCard key={i.id} item={i} />)}</div>
          {items.length < total && <div className="center" style={{ marginTop: 24 }}><Button loading={loading} onClick={() => load(page + 1, true)}>{t('items.loadMore')}</Button></div>}
        </>
      )}
    </div>
  );
}