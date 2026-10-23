import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Glass, Reveal, SkeletonGrid } from '../components/ui.jsx';
import { ItemCard } from '../components/ItemParts.jsx';
import { api } from '../lib/api.js';

function Count({ to }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !to) { setN(to ?? 0); return undefined; }
    const t0 = performance.now(); let raf;
    const tick = (t) => { const p = Math.min(1, (t - t0) / 900); setN(Math.round(to * (1 - (1 - p) ** 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n.toLocaleString()}</>;
}

export default function Home() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [stats, setStats] = useState(null);
  const [latest, setLatest] = useState(null);
  useEffect(() => {
    api.get('/items/stats').then(setStats).catch(() => setStats({}));
    api.get('/items/?limit=6').then((d) => setLatest(d.items)).catch(() => setLatest([]));
  }, []);
  return (
    <div className="container">
      <Reveal>
        <section className="hero">
          <div><h1>Lost it? <span>Found it.</span><br />Together.</h1>
            <p className="lead">Report what you lost or found. Our matching engine suggests likely pairs, and a private verification step makes sure items go back to their real owners.</p></div>
          <Glass as="form" pad className="row" role="search" onSubmit={(e) => { e.preventDefault(); nav(`/found?q=${encodeURIComponent(q)}`); }}>
            <label className="sr-only" htmlFor="home-q">Search found items</label>
            <input id="home-q" className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Search found items: “black wallet”, “keys”, “iPhone”…" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary">Search</button>
          </Glass>
          <div className="row"><Link to="/report/lost" className="btn primary"> I lost something</Link><Link to="/report/found" className="btn"> I found something</Link></div>
        </section>
      </Reveal>
      <section className="stats" aria-label="Community statistics">
        {[['Reports', stats?.reported], ['Items recovered', stats?.recovered], ['Looking for owners', stats?.openFound], ['Owners searching', stats?.openLost]].map(([l, v]) => (
          <Glass key={l} className="stat"><b><Count to={v} /></b><span>{l}</span></Glass>
        ))}
      </section>
      <h2 style={{ marginTop: 48 }}>How it works</h2>
      <section className="steps">
        <Glass className="step"><h3>Report</h3><p className="muted">Describe the item, drop a pin on the map and add photos. Only the approximate area is ever public.</p></Glass>
        <Glass className="step"><h3>Match</h3><p className="muted">We compare descriptions, categories, dates and distances, and tell both sides when something looks right.</p></Glass>
        <Glass className="step"><h3>Verify</h3><p className="muted">The finder asks private questions only the real owner can answer. Nothing sensitive is shared before approval.</p></Glass>
        <Glass className="step"><h3>Return</h3><p className="muted">Chat or call inside FindIt, arrange the handover, and close the case.</p></Glass>
      </section>
      <h2 style={{ marginTop: 48 }}>Latest reports</h2>
      {!latest ? <SkeletonGrid n={6} /> : <div className="grid cards">{latest.map((i) => <ItemCard key={i.id} item={i} />)}</div>}
    </div>
  );
}
