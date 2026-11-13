import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Glass, Tabs, Empty, SkeletonGrid, Button, Reveal, Chip } from '../components/ui.jsx';
import { Timeline } from '../components/ItemParts.jsx';
import { api } from '../lib/api.js';
import { catEmoji, fmtDate, errMsg } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

const GROUPS = { all: () => true, active: (i) => ['open', 'matched', 'claimed'].includes(i.status), verified: (i) => i.status === 'verified', done: (i) => ['returned', 'closed'].includes(i.status) };

export default function MyReports() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('all');
  const load = () => api.get('/items/mine').then((d) => setItems(d.items)).catch((e) => { toast.error(errMsg(e)); setItems([]); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = async (id) => { try { await api.post(`/items/${id}/close`); load(); } catch (e) { toast.error(errMsg(e)); } };
  const shown = items?.filter(GROUPS[tab]);
  return (
    <div className="container">
      <Reveal><div className="row"><h1 style={{ margin: 0, fontSize: '2.2rem' }}>{t('myReports.title')}</h1><span className="spacer" /><Link to="/report/lost" className="btn">{t('myReports.lost')}</Link><Link to="/report/found" className="btn primary">{t('myReports.found')}</Link></div>
        <div style={{ marginTop: 18 }}><Tabs value={tab} onChange={setTab} tabs={[['all', t('myReports.all'), items?.length], ['active', t('myReports.active')], ['verified', t('myReports.verified')], ['done', t('myReports.closed')]]} /></div></Reveal>
      {!items ? <SkeletonGrid n={3} h={200} /> : !shown.length ? <Empty icon="📭" title={t('myReports.emptyTitle')} action={<Link className="btn primary" to="/report/lost">{t('myReports.createFirst')}</Link>}>{t('myReports.emptyText')}</Empty> : (
        <div className="col">{shown.map((i) => (
          <Glass key={i.id} pad>
            <div className="row"><span style={{ fontSize: '1.8rem' }} aria-hidden>{catEmoji(i.category)}</span><div style={{ flex: 1, minWidth: 200 }}><Link to={`/items/${i.id}`}><strong>{i.title}</strong></Link><div className="muted small">{fmtDate(i.date)} · 📍 {i.area.label}</div></div>
              <Chip kind={i.type} /><Chip kind={i.status} />{!['verified', 'returned', 'closed'].includes(i.status) && <Button size="sm" onClick={() => close(i.id)}>{t('myReports.close')}</Button>}</div>
            <Timeline status={i.status} history={i.history} />
          </Glass>
        ))}</div>
      )}
    </div>
  );
}