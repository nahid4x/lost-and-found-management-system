import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          <div><h1>{t('home.heroA')} <span>{t('home.heroB')}</span><br />{t('home.heroC')}</h1>
            <p className="lead">{t('home.lead')}</p></div>
          <Glass as="form" pad className="row" role="search" onSubmit={(e) => { e.preventDefault(); nav(`/found?q=${encodeURIComponent(q)}`); }}>
            <label className="sr-only" htmlFor="home-q">{t('home.searchLabel')}</label>
            <input id="home-q" className="input" style={{ flex: 1, minWidth: 220 }} placeholder={t('home.searchPlaceholder')} value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary">{t('home.searchBtn')}</button>
          </Glass>
          <div className="row"><Link to="/report/lost" className="btn primary">{t('home.iLost')}</Link><Link to="/report/found" className="btn">{t('home.iFound')}</Link></div>
        </section>
      </Reveal>
      <section className="stats" aria-label={t('home.statsLabel')}>
        {[['home.statReports', stats?.reported], ['home.statRecovered', stats?.recovered], ['home.statOpenFound', stats?.openFound], ['home.statOpenLost', stats?.openLost]].map(([l, v]) => (
          <Glass key={l} className="stat"><b><Count to={v} /></b><span>{t(l)}</span></Glass>
        ))}
      </section>
      <h2 style={{ marginTop: 48 }}>{t('home.how')}</h2>
      <section className="steps">
        <Glass className="step"><h3>{t('home.step1Title')}</h3><p className="muted">{t('home.step1')}</p></Glass>
        <Glass className="step"><h3>{t('home.step2Title')}</h3><p className="muted">{t('home.step2')}</p></Glass>
        <Glass className="step"><h3>{t('home.step3Title')}</h3><p className="muted">{t('home.step3')}</p></Glass>
        <Glass className="step"><h3>{t('home.step4Title')}</h3><p className="muted">{t('home.step4')}</p></Glass>
      </section>
      <h2 style={{ marginTop: 48 }}>{t('home.latest')}</h2>
      {!latest ? <SkeletonGrid n={6} /> : <div className="grid cards">{latest.map((i) => <ItemCard key={i.id} item={i} />)}</div>}
    </div>
  );
}