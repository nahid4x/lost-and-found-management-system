import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Glass, Button, Chip, Modal, Field, Skeleton, Empty, Reveal } from '../components/ui.jsx';
import { Gallery } from '../components/Gallery.jsx';
import { Dropzone } from '../components/Dropzone.jsx';
import { Timeline } from '../components/ItemParts.jsx';
import { VerificationEditor } from '../components/VerificationEditor.jsx';
import { validateEntries, toPayload, emptyEntry } from '../lib/verification.js';
import { ApproxMap } from '../components/maps.jsx';
import { useAuth } from '../context/Auth.jsx';
import { useToast } from '../context/Toast.jsx';
import { api } from '../lib/api.js';
import { catLabel, catEmoji, fmtDate, timeAgo, errMsg } from '../lib/util.js';

function ClaimModal({ item, open, onClose }) {
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState(null); // { questions, verification:[{id,type}], requiresMessage }
  const [answers, setAnswers] = useState([]);
  const [message, setMessage] = useState('');
  const [proofs, setProofs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setForm(null); setError('');
    api.get(`/claims/questions/${item.id}`).then((d) => { setForm(d); setAnswers(d.questions.map(() => '')); }).catch((e) => setError(errMsg(e)));
  }, [open, item.id]);
  const hasQuestions = form?.questions?.length > 0;
  const valid = form && (hasQuestions ? answers.some((a) => a.trim()) : message.trim().length >= 10);
  const submit = async (e) => {
    e.preventDefault(); if (!valid) return;
    setBusy(true); setError('');
    try {
      const f = new FormData(); f.append('itemId', item.id);
      if (hasQuestions) f.append('answers', JSON.stringify(answers.map((a) => a.trim())));
      if (message.trim()) f.append('message', message.trim());
      proofs.forEach((p) => f.append('proofs', p));
      await api.upload('/claims/', f);
      toast.success('Submitted. The finder will review your answers.'); onClose(); nav('/claims');
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Verify ownership" wide>
      {!form && !error && <Skeleton h={160} />}
      {error && <p className="err" role="alert">{error}</p>}
      {form && (
        <form className="col" onSubmit={submit}>
          <p className="muted">{hasQuestions ? 'Answer the finder’s private questions. Only the finder sees your answers, and you submit them once, so answer carefully. You will not be shown whether they were right.' : 'The finder did not set private questions. Explain why this item is yours, with details only the owner would know.'}</p>
          {hasQuestions && <p className="hint">Leave a question blank if you do not know it: blank answers count as unanswered and can never raise your match.</p>}
          {form.questions.map((q, i) => (
            <Field key={i} as={form.verification?.[i]?.type === 'number' ? 'input' : 'textarea'} label={q} value={answers[i] ?? ''} maxLength={500} autoComplete="off"
              inputMode={form.verification?.[i]?.type === 'number' ? 'decimal' : undefined} hint={form.verification?.[i]?.type === 'number' ? 'Enter a number, e.g. 2500' : undefined}
              onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))} />
          ))}
          <Field as="textarea" label={hasQuestions ? 'Anything else that shows it is yours? (optional)' : 'Why is this yours?'} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} hint={hasQuestions ? undefined : `${message.trim().length}/10 characters minimum`} />
          <div><strong>Proof photos (optional)</strong><p className="hint">Receipts, serial numbers, an older photo of the item. Visible only to the finder and stored privately.</p><Dropzone files={proofs} onChange={setProofs} max={3} label="Add proof photos" /></div>
          <div className="row"><span className="spacer" /><Button type="button" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!valid}>Submit for review</Button></div>
        </form>
      )}
    </Modal>
  );
}

/** Owner-only: manage the private questions + answers of a found report. Answers load only when asked for. */
function VerificationPanel({ item, onChanged }) {
  const toast = useToast();
  const [shown, setShown] = useState(null); // answers, loaded on demand
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const list = item.verification ?? [];
  const legacy = !list.length;
  const locked = item.verificationLocked;
  const load = () => api.get(`/items/${item.id}/verification`);
  const reveal = async () => { try { setShown((await load()).verification); } catch (e) { toast.error(errMsg(e)); } };
  const edit = async () => {
    try {
      const d = await load();
      setEditing(d.verification.length ? d.verification.map((v) => ({ question: v.question, answer: v.answer, type: v.type, weight: v.weight, tolerance: v.tolerance ?? '' })) : [emptyEntry()]);
      setErrors({});
    } catch (e) { toast.error(errMsg(e)); }
  };
  const save = async () => {
    const errs = validateEntries(editing);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try { await api.put(`/items/${item.id}/verification`, { verification: toPayload(editing) }); toast.success('Verification questions saved'); setEditing(null); setShown(null); onChanged?.(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Glass pad>
      <div className="row"><h3 style={{ margin: 0 }}>🔒 Private verification</h3><span className="spacer" />
        {!legacy && !shown && <Button size="sm" onClick={reveal}>Show answers</Button>}{shown && <Button size="sm" onClick={() => setShown(null)}>Hide answers</Button>}
        <Button size="sm" onClick={edit} disabled={locked}>{legacy ? 'Add questions' : 'Edit'}</Button></div>
      {locked && <p className="hint">Locked: a claim has been submitted, so the questions can no longer change.</p>}
      {legacy ? <p className="muted small">{item.questions?.length ? 'This report has questions but no stored answers, so claims need manual review. Add answers to get an automatic match score.' : 'No private questions. Add some so you can check claimants more reliably.'}</p> : (
        <ol className="muted" style={{ paddingLeft: 20 }}>{list.map((q, i) => (
          <li key={q.id}>{q.question} <span className="faint small">({q.type}, importance {q.weight})</span>
            {shown && <div style={{ color: 'var(--text)' }}>Answer: <strong>{shown[i]?.answer}</strong></div>}</li>
        ))}</ol>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Private verification questions" wide>
        {editing && <><VerificationEditor entries={editing} onChange={setEditing} category={item.category} errors={errors} />
          <div className="row" style={{ marginTop: 12 }}><span className="spacer" /><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></div></>}
      </Modal>
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
              {canClaim && <Button variant="primary" onClick={() => setClaiming(true)}>🙋 Verify ownership & claim</Button>}
              {!user && item.type === 'found' && <Button variant="primary" onClick={() => nav(`/login?next=/items/${item.id}`)}>Sign in to claim</Button>}
              {item.mine && !['verified', 'returned', 'closed'].includes(item.status) && <Button onClick={close}>Close report</Button>}
              {item.mine && item.type === 'found' && <Link to="/claims" className="btn">Review claims</Link>}
            </div>
          </div>
        </div>
        {item.mine && item.type === 'found' && <div style={{ marginTop: 20 }}><VerificationPanel item={item} onChanged={load} /></div>}
      </Reveal>
      {canClaim && <ClaimModal item={item} open={claiming} onClose={() => setClaiming(false)} />}
    </div>
  );
}