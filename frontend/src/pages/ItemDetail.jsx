import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      toast.success(t('detail.submitted')); onClose(); nav('/claims');
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('detail.verifyTitle')} wide>
      {!form && !error && <Skeleton h={160} />}
      {error && <p className="err" role="alert">{error}</p>}
      {form && (
        <form className="col" onSubmit={submit}>
          <p className="muted">{hasQuestions ? t('detail.qIntro') : t('detail.noQIntro')}</p>
          {hasQuestions && <p className="hint">{t('detail.blankHint')}</p>}
          {form.questions.map((q, i) => (
            <Field key={i} as={form.verification?.[i]?.type === 'number' ? 'input' : 'textarea'} label={q} value={answers[i] ?? ''} maxLength={500} autoComplete="off"
              inputMode={form.verification?.[i]?.type === 'number' ? 'decimal' : undefined} hint={form.verification?.[i]?.type === 'number' ? t('detail.numHint') : undefined}
              onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))} />
          ))}
          <Field as="textarea" label={hasQuestions ? t('detail.elseOpt') : t('detail.whyYours')} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} hint={hasQuestions ? undefined : t('detail.minChars', { n: message.trim().length })} />
          <div><strong>{t('detail.proofTitle')}</strong><p className="hint">{t('detail.proofHint')}</p><Dropzone files={proofs} onChange={setProofs} max={3} label={t('detail.addProof')} /></div>
          <div className="row"><span className="spacer" /><Button type="button" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} disabled={!valid}>{t('detail.submitReview')}</Button></div>
        </form>
      )}
    </Modal>
  );
}

/** Owner-only: manage the private questions + answers of a found report. Answers load only when asked for. */
function VerificationPanel({ item, onChanged }) {
  const { t } = useTranslation();
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
    try { await api.put(`/items/${item.id}/verification`, { verification: toPayload(editing) }); toast.success(t('detail.saved')); setEditing(null); setShown(null); onChanged?.(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Glass pad>
      <div className="row"><h3 style={{ margin: 0 }}>{t('detail.vpTitle')}</h3><span className="spacer" />
        {!legacy && !shown && <Button size="sm" onClick={reveal}>{t('detail.showAnswers')}</Button>}{shown && <Button size="sm" onClick={() => setShown(null)}>{t('detail.hideAnswers')}</Button>}
        <Button size="sm" onClick={edit} disabled={locked}>{legacy ? t('detail.add') : t('detail.edit')}</Button></div>
      {locked && <p className="hint">{t('detail.locked')}</p>}
      {legacy ? <p className="muted small">{item.questions?.length ? t('detail.legacyQ') : t('detail.legacyNone')}</p> : (
        <ol className="muted" style={{ paddingLeft: 20 }}>{list.map((q, i) => (
          <li key={q.id}>{q.question} <span className="faint small">{t('detail.typeImp', { type: t(`verif.type_${q.type}`, { defaultValue: q.type }), weight: q.weight })}</span>
            {shown && <div style={{ color: 'var(--text)' }}>{t('detail.answer')} <strong>{shown[i]?.answer}</strong></div>}</li>
        ))}</ol>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t('detail.editTitle')} wide>
        {editing && <><VerificationEditor entries={editing} onChange={setEditing} category={item.category} errors={errors} />
          <div className="row" style={{ marginTop: 12 }}><span className="spacer" /><Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} onClick={save}>{t('detail.save')}</Button></div></>}
      </Modal>
    </Glass>
  );
}

export default function ItemDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [item, setItem] = useState(undefined);
  const [claiming, setClaiming] = useState(false);
  const load = useCallback(() => api.get(`/items/${id}`).then((d) => setItem(d.item)).catch(() => setItem(null)), [id]);
  useEffect(() => { setItem(undefined); load(); }, [load, user?.id]);

  if (item === undefined) return <div className="container"><Skeleton h={420} /></div>;
  if (item === null) return <div className="container"><Empty icon="🫥" title={t('detail.notFoundTitle')} action={<Link to="/" className="btn primary">{t('detail.backHome')}</Link>}>{t('detail.notFoundText')}</Empty></div>;

  const canClaim = user && item.type === 'found' && !item.mine && ['open', 'matched', 'claimed'].includes(item.status);
  const close = async () => { try { await api.post(`/items/${item.id}/close`); toast.success(t('detail.reportClosed')); load(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div className="container">
      <Reveal>
        <div className="row" style={{ marginBottom: 12 }}><Chip kind={item.type} /><Chip kind={item.status} /><span className="muted">{catEmoji(item.category)} {catLabel(item.category)}</span><span className="faint">{t('detail.postedBy', { time: timeAgo(item.createdAt), name: item.ownerName })}</span></div>
        <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>{item.title}</h1>
        <div className="grid two" style={{ alignItems: 'start' }}>
          <div className="col"><Gallery images={item.images} category={item.category} /></div>
          <div className="col">
            <Glass pad><h3>{t('detail.detailsTitle')}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p>
              <div className="muted small">{t(item.type === 'lost' ? 'detail.lostOn' : 'detail.foundOn', { date: fmtDate(item.date), place: item.area.label })}</div></Glass>
            <Glass pad><h3>{t('detail.statusTitle')}</h3><Timeline status={item.status} history={item.history} /></Glass>
            {item.location ? (
              <Glass pad><h3>{t('detail.exactTitle')}</h3>
                {item.heldAt && <p>{t('detail.heldAt')} <strong>{item.heldAt}</strong></p>}
                {item.contactNote && <p>{t('detail.contact')} <strong>{item.contactNote}</strong></p>}
                <ApproxMap lat={item.location.lat} lng={item.location.lng} exact />
                {!item.mine && <div className="row" style={{ marginTop: 12 }}><Link to="/messages" className="btn primary">{t('detail.openChat')}</Link><Link to="/claims" className="btn">{t('detail.markReturned')}</Link></div>}
              </Glass>
            ) : (
              <Glass pad><h3>{t('detail.approxTitle')}</h3><ApproxMap lat={item.area.lat} lng={item.area.lng} />
                <p className="hint" style={{ marginTop: 8 }}>{item.type === 'found' ? t('detail.areaHintFound') : t('detail.areaHintLost')}</p></Glass>
            )}
            <div className="row">
              {canClaim && <Button variant="primary" onClick={() => setClaiming(true)}>{t('detail.claimBtn')}</Button>}
              {!user && item.type === 'found' && <Button variant="primary" onClick={() => nav(`/login?next=/items/${item.id}`)}>{t('detail.signInClaim')}</Button>}
              {item.mine && !['verified', 'returned', 'closed'].includes(item.status) && <Button onClick={close}>{t('detail.closeReport')}</Button>}
              {item.mine && item.type === 'found' && <Link to="/claims" className="btn">{t('detail.reviewClaims')}</Link>}
            </div>
          </div>
        </div>
        {item.mine && item.type === 'found' && <div style={{ marginTop: 20 }}><VerificationPanel item={item} onChanged={load} /></div>}
      </Reveal>
      {canClaim && <ClaimModal item={item} open={claiming} onClose={() => setClaiming(false)} />}
    </div>
  );
}