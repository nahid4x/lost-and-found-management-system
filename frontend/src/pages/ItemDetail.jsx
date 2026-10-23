import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Glass, Button, Chip, Modal, Field, Skeleton, Empty, Reveal } from '../components/ui.jsx';
import { Gallery } from '../components/Gallery.jsx';
import { Dropzone } from '../components/Dropzone.jsx';
import { MatchRing, Timeline } from '../components/ItemParts.jsx';
import { ApproxMap } from '../components/maps.jsx';
import { useAuth } from '../context/Auth.jsx';
import { useToast } from '../context/Toast.jsx';
import { api } from '../lib/api.js';
import { catLabel, catEmoji, fmtDate, timeAgo, errMsg } from '../lib/util.js';

function ClaimModal({ item, open, onClose }) {
  const toast = useToast();
  const nav = useNavigate();
  const [qs, setQs] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [proofs, setProofs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setQs(null); setError('');
    api.get(`/claims/questions/${item.id}`).then((d) => { setQs(d.questions); setAnswers(d.questions.map(() => '')); }).catch((e) => setError(errMsg(e)));
  }, [open, item.id]);
  const valid = qs && answers.every((a) => a.trim().length > 0);
  const submit = async (e) => {
    e.preventDefault(); if (!valid) return;
    setBusy(true); setError('');
    try {
      const f = new FormData(); f.append('itemId', item.id); f.append('answers', JSON.stringify(answers.map((a) => a.trim())));
      proofs.forEach((p) => f.append('proofs', p));
      await api.upload('/claims/', f);
      toast.success('Claim sent. The finder will review your answers.'); onClose(); nav('/claims');
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Claim this item" wide>
      {!qs && !error && <Skeleton h={160} />}
      {error && <p className="err" role="alert">{error}</p>}
      {qs && (
        <form className="col" onSubmit={submit}>
          <p className="muted">Answer the finder’s private questions. Only they will see your answers. A wrong answer is not revealed, so please answer carefully.</p>
          {qs.map((q, i) => <Field key={i} as="textarea" label={q} value={answers[i]} maxLength={500} required onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))} />)}
          <div><strong>Proof photos (optional)</strong><p className="hint">Receipts, serial numbers, an older photo of the item. Visible only to the finder and stored privately.</p><Dropzone files={proofs} onChange={setProofs} max={3} label="Add proof photos" /></div>
          <div className="row"><span className="spacer" /><Button type="button" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!valid}>Submit claim</Button></div>
        </form>
      )}
    </Modal>
  );
}

function Matches({ item, onChange }) {
  const toast = useToast();
  const [matches, setMatches] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { api.get(`/items/${item.id}/matches`).then((d) => setMatches(d.matches)).catch(() => setMatches([])); }, [item.id, item.status]);
  const dismiss = async (m) => {
    try { await api.post(`/items/${item.id}/matches/${m.id}/dismiss`); setMatches((x) => x.filter((y) => y.id !== m.id)); onChange?.(); } catch (e) { toast.error(errMsg(e)); }
  };
  if (!matches) return <Skeleton h={100} />;
  return (
    <Glass pad>
      <h3>✨ AI match suggestions</h3>
      {!matches.length ? <p className="muted">No likely matches yet. We will notify you the moment one appears.</p> : (
        <div className="col">{matches.map((m) => (
          <div key={m.id} className="glass pad" style={{ borderRadius: 16 }}>
            <div className="row"><MatchRing score={m.score} />
              <div style={{ flex: 1, minWidth: 180 }}><Link to={`/items/${m.item.id}`}><strong>{m.item.title}</strong></Link><div className="muted small">{catEmoji(m.item.category)} {catLabel(m.item.category)} · 📍 {m.item.area}</div></div>
              <Button size="sm" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>Why?</Button>
              <Button size="sm" onClick={() => dismiss(m)} aria-label={`Dismiss match ${m.item.title}`}>Dismiss</Button>
            </div>
            {open === m.id && <div className="col" style={{ marginTop: 12 }}>{m.reasons.map((r) => (
              <div key={r.factor}><div className="row small"><span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{r.factor}</span><span className="spacer" /><span>{r.points}/{r.max}</span></div><div className="bar" role="presentation"><i style={{ width: `${(r.points / r.max) * 100}%` }} /></div><div className="faint small">{r.detail}</div></div>
            ))}</div>}
          </div>
        ))}</div>
      )}
    </Glass>
  );
}

export default function ItemDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [item, setItem] = useState(undefined);
  const [claiming, setClaiming] = useState(false);
  const load = useCallback(() => api.get(`/items/${id}`).then((d) => setItem(d.item)).catch(() => setItem(null)), [id]);
  useEffect(() => { setItem(undefined); load(); }, [load, user?.id]);

  if (item === undefined) return <div className="container"><Skeleton h={420} /></div>;
  if (item === null) return <div className="container"><Empty icon="🫥" title="Report not found" action={<Link to="/" className="btn primary">Back home</Link>}>It may have been removed or is no longer public.</Empty></div>;

  const canClaim = user && item.type === 'found' && !item.mine && ['open', 'matched', 'claimed'].includes(item.status);
  const close = async () => { try { await api.post(`/items/${item.id}/close`); toast.success('Report closed'); load(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div className="container">
      <Reveal>
        <div className="row" style={{ marginBottom: 12 }}><Chip kind={item.type} /><Chip kind={item.status} /><span className="muted">{catEmoji(item.category)} {catLabel(item.category)}</span><span className="faint">· posted {timeAgo(item.createdAt)} by {item.ownerName}</span></div>
        <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>{item.title}</h1>
        <div className="grid two" style={{ alignItems: 'start' }}>
          <div className="col"><Gallery images={item.images} category={item.category} /></div>
          <div className="col">
            <Glass pad><h3>Details</h3><p style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p>
              <div className="muted small">📅 {item.type === 'lost' ? 'Lost' : 'Found'} on {fmtDate(item.date)} · 📍 {item.area.label}</div></Glass>
            <Glass pad><h3>Status</h3><Timeline status={item.status} history={item.history} /></Glass>
            {item.location ? (
              <Glass pad><h3>🔓 Exact location &amp; handover</h3>
                {item.heldAt && <p>📦 Held at: <strong>{item.heldAt}</strong></p>}
                {item.contactNote && <p>☎️ Contact: <strong>{item.contactNote}</strong></p>}
                <ApproxMap lat={item.location.lat} lng={item.location.lng} exact />
                {!item.mine && <div className="row" style={{ marginTop: 12 }}><Link to="/messages" className="btn primary">💬 Open chat</Link><Link to="/claims" className="btn">Mark as returned</Link></div>}
              </Glass>
            ) : (
              <Glass pad><h3>Approximate area</h3><ApproxMap lat={item.area.lat} lng={item.area.lng} />
                <p className="hint" style={{ marginTop: 8 }}>The exact spot{item.type === 'found' ? ', where the item is held and the finder’s contact' : ''} is only shared with the verified owner.</p></Glass>
            )}
            <div className="row">
              {canClaim && <Button variant="primary" onClick={() => setClaiming(true)}>🙋 This is mine: claim it</Button>}
              {!user && item.type === 'found' && <Button variant="primary" onClick={() => nav(`/login?next=/items/${item.id}`)}>Sign in to claim</Button>}
              {item.mine && !['verified', 'returned', 'closed'].includes(item.status) && <Button onClick={close}>Close report</Button>}
              {item.mine && item.type === 'found' && <Link to="/claims" className="btn">Review claims</Link>}
            </div>
          </div>
        </div>
        {item.mine && <div style={{ marginTop: 20 }}><Matches item={item} onChange={load} /></div>}
      </Reveal>
      {canClaim && <ClaimModal item={item} open={claiming} onClose={() => setClaiming(false)} />}
    </div>
  );
}
