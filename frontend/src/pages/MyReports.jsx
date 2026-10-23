import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glass, Tabs, Empty, SkeletonGrid, Button, Reveal, Chip } from '../components/ui.jsx';
import { Timeline } from '../components/ItemParts.jsx';
import { api } from '../lib/api.js';
import { catEmoji, fmtDate, errMsg } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

const GROUPS = { all: () => true, active: (i) => ['open', 'matched', 'claimed'].includes(i.status), verified: (i) => i.status === 'verified', done: (i) => ['returned', 'closed'].includes(i.status) };

export default function MyReports() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('all');
  const load = () => api.get('/items/mine').then((d) => setItems(d.items)).catch((e) => { toast.error(errMsg(e)); setItems([]); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = async (id) => { try { await api.post(`/items/${id}/close`); load(); } catch (e) { toast.error(errMsg(e)); } };
  const shown = items?.filter(GROUPS[tab]);
  return (
    <div className="container">
      <Reveal><div className="row"><h1 style={{ margin: 0, fontSize: '2.2rem' }}>My reports</h1><span className="spacer" /><Link to="/report/lost" className="btn">+ Lost</Link><Link to="/report/found" className="btn primary">+ Found</Link></div>
        <div style={{ marginTop: 18 }}><Tabs value={tab} onChange={setTab} tabs={[['all', 'All', items?.length], ['active', 'Active'], ['verified', 'Verified'], ['done', 'Closed']]} /></div></Reveal>
      {!items ? <SkeletonGrid n={3} h={200} /> : !shown.length ? <Empty icon="📭" title="No reports here" action={<Link className="btn primary" to="/report/lost">Create your first report</Link>}>Your lost and found reports will show up here.</Empty> : (
        <div className="col">{shown.map((i) => (
          <Glass key={i.id} pad>
            <div className="row"><span style={{ fontSize: '1.8rem' }} aria-hidden>{catEmoji(i.category)}</span><div style={{ flex: 1, minWidth: 200 }}><Link to={`/items/${i.id}`}><strong>{i.title}</strong></Link><div className="muted small">{fmtDate(i.date)} · 📍 {i.area.label}</div></div>
              <Chip kind={i.type} /><Chip kind={i.status} />{!['verified', 'returned', 'closed'].includes(i.status) && <Button size="sm" onClick={() => close(i.id)}>Close</Button>}</div>
            <Timeline status={i.status} history={i.history} />
          </Glass>
        ))}</div>
      )}
    </div>
  );
}
