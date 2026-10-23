import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Glass, Field, Button, Empty, SkeletonGrid, Reveal } from '../components/ui.jsx';
import { ItemCard } from '../components/ItemParts.jsx';
import { MapView } from '../components/maps.jsx';
import { api, qs } from '../lib/api.js';
import { CATEGORIES, errMsg } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

export default function ItemsPage({ type }) {
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
  useEffect(() => { const t = setTimeout(() => q !== f.q && set('q', q.trim()), 350); return () => clearTimeout(t); }, [q]); // debounce search typing
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

  const locate = () => navigator.geolocation?.getCurrentPosition((p) => { const n = new URLSearchParams(sp); n.set('lat', p.coords.latitude.toFixed(4)); n.set('lng', p.coords.longitude.toFixed(4)); if (!n.get('radiusKm')) n.set('radiusKm', '10'); setSp(n, { replace: true }); }, () => toast.error('Location permission denied'));

  return (
    <div className="container">
      <Reveal>
        <div className="row" style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: '2.2rem' }}>{type === 'lost' ? 'Lost items' : 'Found items'}</h1><span className="spacer" />
          <Button size="sm" aria-pressed={view === 'list'} onClick={() => setView('list')}>▦ List</Button>
          <Button size="sm" aria-pressed={view === 'map'} onClick={() => setView('map')}>🗺️ Map</Button>
          <Button variant="primary" size="sm" onClick={() => nav(`/report/${type}`)}>+ Report {type}</Button>
        </div>
        <Glass as="form" pad onSubmit={(e) => e.preventDefault()} className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 20 }} role="search" aria-label="Filters">
          <Field label="Search" placeholder="wallet, phone, keys…" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
          <Field label="Category" as="select" value={f.category} onChange={(e) => set('category', e.target.value)}><option value="">All categories</option>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Field>
          <Field label="From date" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />
          <Field label="To date" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />
          <Field label="Radius (km)" as="select" value={f.lat ? f.radiusKm || '10' : ''} disabled={!f.lat} onChange={(e) => set('radiusKm', e.target.value)}>{[1, 2, 5, 10, 25, 50].map((r) => <option key={r} value={r}>{r} km</option>)}<option value="">—</option></Field>
          <div className="field"><label>Near me</label><div className="row"><Button type="button" size="sm" onClick={locate}>📍 Use location</Button>{f.lat && <Button type="button" size="sm" onClick={() => { const n = new URLSearchParams(sp); ['lat', 'lng', 'radiusKm'].forEach((k) => n.delete(k)); setSp(n, { replace: true }); }}>Clear</Button>}</div></div>
        </Glass>
      </Reveal>
      {view === 'map' ? <MapView tall items={mapItems} onSelect={(i) => nav(`/items/${i.id}`)} /> : !items ? <SkeletonGrid /> : !items.length ? (
        <Empty icon="🕵️" title="Nothing here yet" action={<Button variant="primary" onClick={() => nav(`/report/${type}`)}>Create a report</Button>}>No {type} items match these filters. Try widening your search.</Empty>
      ) : (
        <>
          <p className="muted" aria-live="polite">{total} result{total === 1 ? '' : 's'}</p>
          <div className="grid cards">{items.map((i) => <ItemCard key={i.id} item={i} />)}</div>
          {items.length < total && <div className="center" style={{ marginTop: 24 }}><Button loading={loading} onClick={() => load(page + 1, true)}>Load more</Button></div>}
        </>
      )}
    </div>
  );
}
