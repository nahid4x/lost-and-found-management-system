import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glass, Tabs, Empty, Skeleton, Button, Chip, Modal, Reveal } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { errMsg, timeAgo } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

const isEnded = (c) => ['rejected', 'withdrawn'].includes(c.status) || Boolean(c.returnedAt);

export default function Claims() {
  const toast = useToast();
  const [tab, setTab] = useState('received');
  const [data, setData] = useState({ received: null, mine: null });
  const [confirm, setConfirm] = useState(null); // {claim, decision}
  const [remove, setRemove] = useState(null); // claim to delete from my list
  const [busy, setBusy] = useState(false);
  const load = () => {
    api.get('/claims/received').then((d) => setData((x) => ({ ...x, received: d.claims }))).catch((e) => toast.error(errMsg(e)));
    api.get('/claims/mine').then((d) => setData((x) => ({ ...x, mine: d.claims }))).catch((e) => toast.error(errMsg(e)));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (path, body, okMsg) => {
    setBusy(true);
    try { await api.post(path, body); toast.success(okMsg); setConfirm(null); setRemove(null); load(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const list = data[tab];
  const pendingCount = data.received?.filter((c) => c.status === 'pending').length;

  return (
    <div className="container">
      <Reveal><h1 style={{ fontSize: '2.2rem' }}>Claims</h1>
        <Tabs value={tab} onChange={setTab} tabs={[['received', 'Received (my found items)', pendingCount || null], ['mine', 'My claims']]} /></Reveal>
      {!list ? <Skeleton h={220} /> : !list.length ? <Empty icon="🗂️" title="No claims yet">{tab === 'received' ? 'When someone claims an item you found, their answers appear here.' : 'Find your item in the found list and tap “This is mine”.'}</Empty> : (
        <div className="col">{list.map((c) => (
          <Glass key={c.id} pad>
            <div className="row"><Link to={`/items/${c.itemId}`}><strong>{c.itemTitle}</strong></Link><Chip kind={c.status} />{c.returnedAt && <Chip kind="returned" />}<span className="spacer" /><span className="faint small">{timeAgo(c.createdAt)}</span></div>
            {tab === 'received' && <p className="muted small" style={{ margin: '6px 0' }}>Claimed by <strong>{c.claimantName}</strong></p>}
            {c.answers?.length > 0 && <div className="col" style={{ margin: '10px 0' }}>{c.answers.map((a, i) => <div key={i} className="glass pad" style={{ borderRadius: 14, padding: 12 }}><div className="faint small">Q: {a.question}</div><div style={{ whiteSpace: 'pre-wrap' }}>{a.answer}</div></div>)}</div>}
            {tab === 'received' && c.proofUrls?.length > 0 && <div className="previews" aria-label="Proof photos">{c.proofUrls.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" aria-label={`Open proof photo ${i + 1}`}><img src={u} alt={`Proof ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" /></a>)}</div>}
            {tab === 'mine' && <p className="faint small">{c.proofCount} proof photo(s) attached{c.status === 'approved' && c.finderName ? ` · approved by ${c.finderName}` : ''}</p>}
            <div className="row" style={{ marginTop: 8 }}>
              {tab === 'received' && c.status === 'pending' && <><Button variant="ok" onClick={() => setConfirm({ c, decision: 'approve' })}>✓ Approve</Button><Button variant="danger" onClick={() => setConfirm({ c, decision: 'reject' })}>✕ Reject</Button></>}
              {tab === 'mine' && c.status === 'pending' && <Button onClick={() => act(`/claims/${c.id}/withdraw`, undefined, 'Claim withdrawn')}>Withdraw</Button>}
              {c.status === 'approved' && !c.returnedAt && <><Link to="/messages" className="btn primary">💬 Chat to arrange handover</Link><Button onClick={() => act(`/claims/${c.id}/returned`, undefined, 'Marked as returned. Case closed.')}>Mark as returned</Button></>}
              {isEnded(c) && <><span className="spacer" /><Button variant="danger" onClick={() => setRemove(c)}>🗑 Delete</Button></>}
            </div>
          </Glass>
        ))}</div>
      )}
      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.decision === 'approve' ? 'Approve this claim?' : 'Reject this claim?'}>
        <p className="muted">{confirm?.decision === 'approve' ? `${confirm?.c.claimantName} will get the exact location and contact note, and a private chat opens. Other pending claims on this item are rejected automatically.` : 'The claimant is told the claim was not approved. We never reveal the correct answers.'}</p>
        <div className="row"><span className="spacer" /><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant={confirm?.decision === 'approve' ? 'ok' : 'danger'} loading={busy} onClick={() => act(`/claims/${confirm.c.id}/decision`, { decision: confirm.decision }, confirm.decision === 'approve' ? 'Claim approved. Chat is open.' : 'Claim rejected')}>{confirm?.decision === 'approve' ? 'Approve' : 'Reject'}</Button></div>
      </Modal>
      <Modal open={Boolean(remove)} onClose={() => setRemove(null)} title="Delete this claim?">
        <p className="muted">This removes “{remove?.itemTitle}” from your list only. The other person still sees it, and the record stays in the audit log.</p>
        <div className="row"><span className="spacer" /><Button onClick={() => setRemove(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={() => act(`/claims/${remove.id}/hide`, undefined, 'Removed from your list')}>Delete</Button></div>
      </Modal>
    </div>
  );
}