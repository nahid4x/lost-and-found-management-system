import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '../components/maps.jsx';
import { Glass, Button, Reveal } from '../components/ui.jsx';
import { api, qs } from '../lib/api.js';
import { CATEGORIES } from '../lib/util.js';

export default function MapPage() {
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
          <h1 style={{ margin: 0, fontSize: '2.2rem' }}>Map</h1><span className="spacer" />
          <select className="select" style={{ width: 160 }} aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}><option value="">Lost &amp; found</option><option value="lost">Lost</option><option value="found">Found</option></select>
          <select className="select" style={{ width: 190 }} aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <p className="muted small"><span className="chip lost">● lost</span> <span className="chip found">● found</span> Locations are approximate (about 1 km) to protect privacy. {items.length} on the map.</p>
      </Reveal>
      <MapView tall items={items} onSelect={setSel} />
      {sel && <Glass pad style={{ marginTop: 14 }} className="row"><span className={`chip ${sel.type}`}>{sel.type}</span><strong>{sel.title}</strong><span className="muted">📍 {sel.area}</span><span className="spacer" /><Button variant="primary" size="sm" onClick={() => nav(`/items/${sel.id}`)}>View details</Button></Glass>}
    </div>
  );
}
