import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../styles/verification.css';
import { Glass, Button, Modal, Field } from './ui.jsx';
import { Dropzone } from './Dropzone.jsx';
import { LEVEL_TEXT, RESULT_LABEL } from '../lib/verification.js';
import { api } from '../lib/api.js';
import { errMsg } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

export const REVIEW_STATE = { pending_review: 'Pending manual review', more_info_requested: 'More information requested', info_provided: 'Information provided, awaiting review' };

export function LevelRing({ score, level }) {
  const { t } = useTranslation();
  const color = { high: 'var(--green)', medium: 'var(--amber)', low: 'var(--red)' }[level] ?? 'var(--faint)';
  return <div className="ring" style={{ '--p': score ?? 0, '--c': color, width: 76, height: 76 }} role="img" aria-label={score == null ? t('verif.noScore') : t('item.match', { score })}>{score == null ? '—' : `${score}%`}</div>;
}

/** The finder's "AI Verification" panel. The server computed every number shown here. */
export function VerificationCard({ v, thresholds, reviewState }) {
  const { t } = useTranslation();
  const status = t(`reviewState.${reviewState ?? 'pending_review'}`, { defaultValue: REVIEW_STATE[reviewState] ?? REVIEW_STATE.pending_review });
  if (!v?.scored) {
    return (
      <Glass pad className="vcard lvl-unscored" aria-label={t('verif.ariaCard')}>
        <strong>{t('verif.aiTitle')}</strong>
        <p className="muted small" style={{ margin: '6px 0 0' }}>{t('verif.noAuto', { status })}</p>
      </Glass>
    );
  }
  const [title, advice] = LEVEL_TEXT[v.level];
  return (
    <Glass pad className={`vcard lvl-${v.level}`} aria-label={t('verif.ariaResults')}>
      <div className="row" style={{ alignItems: 'center' }}>
        <LevelRing score={v.score} level={v.level} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <strong>{t('verif.aiTitle')}</strong>
          <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{t('verif.match', { score: v.score })} <span className={`chip lvl-chip ${v.level}`}>{t(`verif.level_${v.level}`, { defaultValue: title })}</span></div>
          <div className="muted small">{t('verif.matched', { matched: v.matched, total: v.total })}{v.approximate ? t('verif.approx', { n: v.approximate }) : ''}{v.answered < v.total ? t('verif.blankN', { n: v.total - v.answered }) : ''}</div>
          <div className="small"><strong>{t(`verif.advice_${v.level}`, { defaultValue: advice })}</strong> · {status}</div>
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table aria-label={t('verif.tableAria')}><thead><tr><th>{t('verif.colQ')}</th><th>{t('verif.colA')}</th><th>{t('verif.colR')}</th></tr></thead>
          <tbody>{v.perQuestion.map((p) => { const [icon, label0] = RESULT_LABEL[p.result] ?? ['?', p.result]; const label = t(`verif.res_${p.result}`, { defaultValue: label0 }); return (
            <tr key={p.id}><td style={{ whiteSpace: 'normal' }}>{p.question}</td><td style={{ whiteSpace: 'normal' }}>{p.claimed || <span className="faint">{t('verif.blankCell')}</span>}</td><td><span className={`vres ${p.result}`} aria-label={label} title={label}>{icon}</span> <span className="sr-only">{label}</span></td></tr>
          ); })}</tbody></table>
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>{t('verif.disclaimer')}</p>
    </Glass>
  );
}

/** Finder: ask the claimant for more evidence (the platform's contact channel before approval). */
export function RequestInfoModal({ claim, open, onClose, onDone }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.post(`/claims/${claim.id}/request-info`, { message: message.trim() }); toast.success(t('verif.reqSent')); setMessage(''); onClose(); onDone?.(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('verif.reqTitle')}>
      <p className="muted">{t('verif.reqText', { name: claim?.claimantName })}</p>
      <Field as="textarea" label={t('verif.yourMsg')} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} hint={t('verif.reqHint', { n: message.trim().length })} />
      <div className="row"><span className="spacer" /><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} disabled={message.trim().length < 5} onClick={send}>{t('verif.sendReq')}</Button></div>
    </Modal>
  );
}

/** Claimant: answer the finder's request with text + photos. */
export function SupplementModal({ claim, open, onClose, onDone }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const f = new FormData(); f.append('message', message.trim()); files.forEach((x) => f.append('proofs', x));
      await api.upload(`/claims/${claim.id}/supplement`, f);
      toast.success(t('verif.suppSent')); setMessage(''); setFiles([]); onClose(); onDone?.();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('verif.suppTitle')} wide>
      <Glass pad style={{ borderRadius: 14, marginBottom: 12 }}><div className="faint small">{t('verif.finderAsks')}</div><div>{claim?.moreInfo?.message}</div></Glass>
      <div className="col">
        <Field as="textarea" label={t('verif.yourReply')} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} />
        <div><strong>{t('verif.photosOpt')}</strong><Dropzone files={files} onChange={setFiles} max={3} label={t('verif.addPhotos')} /></div>
        <div className="row"><span className="spacer" /><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} disabled={message.trim().length < 5} onClick={send}>{t('verif.send')}</Button></div>
      </div>
    </Modal>
  );
}