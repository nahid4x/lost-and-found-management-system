import { useState } from 'react';
import '../styles/verification.css';
import { Glass, Button, Modal, Field } from './ui.jsx';
import { Dropzone } from './Dropzone.jsx';
import { LEVEL_TEXT, RESULT_LABEL } from '../lib/verification.js';
import { api } from '../lib/api.js';
import { errMsg } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

export const REVIEW_STATE = { pending_review: 'Pending manual review', more_info_requested: 'More information requested', info_provided: 'Information provided, awaiting review' };

export function LevelRing({ score, level }) {
  const color = { high: 'var(--green)', medium: 'var(--amber)', low: 'var(--red)' }[level] ?? 'var(--faint)';
  return <div className="ring" style={{ '--p': score ?? 0, '--c': color, width: 76, height: 76 }} role="img" aria-label={score == null ? 'No score' : `${score} percent match`}>{score == null ? '—' : `${score}%`}</div>;
}

/** The finder's "AI Verification" panel. The server computed every number shown here. */
export function VerificationCard({ v, thresholds, reviewState }) {
  if (!v?.scored) {
    return (
      <Glass pad className="vcard lvl-unscored" aria-label="Ownership verification">
        <strong>AI Verification</strong>
        <p className="muted small" style={{ margin: '6px 0 0' }}>No automatic score for this claim: the report has no stored private answers. Compare the claimant’s answers with what you know. Status: {REVIEW_STATE[reviewState] ?? 'Pending manual review'}.</p>
      </Glass>
    );
  }
  const [title, advice] = LEVEL_TEXT[v.level];
  return (
    <Glass pad className={`vcard lvl-${v.level}`} aria-label="Ownership verification results">
      <div className="row" style={{ alignItems: 'center' }}>
        <LevelRing score={v.score} level={v.level} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <strong>AI Verification</strong>
          <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{v.score}% Match <span className={`chip lvl-chip ${v.level}`}>{title}</span></div>
          <div className="muted small">{v.matched} of {v.total} answers matched{v.approximate ? ` · ${v.approximate} approximate` : ''}{v.answered < v.total ? ` · ${v.total - v.answered} left blank` : ''}</div>
          <div className="small"><strong>{advice}</strong> · {REVIEW_STATE[reviewState] ?? 'Pending manual review'}</div>
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table aria-label="Answer comparison"><thead><tr><th>Question</th><th>Claimant’s answer</th><th>Result</th></tr></thead>
          <tbody>{v.perQuestion.map((p) => { const [icon, label] = RESULT_LABEL[p.result] ?? ['?', p.result]; return (
            <tr key={p.id}><td style={{ whiteSpace: 'normal' }}>{p.question}</td><td style={{ whiteSpace: 'normal' }}>{p.claimed || <span className="faint">(blank)</span>}</td><td><span className={`vres ${p.result}`} aria-label={label} title={label}>{icon}</span> <span className="sr-only">{label}</span></td></tr>
          ); })}</tbody></table>
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>A high score is a signal, not proof. Ask for more evidence if unsure, and hand items over in a safe public place.</p>
    </Glass>
  );
}

/** Finder: ask the claimant for more evidence (the platform's contact channel before approval). */
export function RequestInfoModal({ claim, open, onClose, onDone }) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.post(`/claims/${claim.id}/request-info`, { message: message.trim() }); toast.success('Request sent. The claimant has been notified.'); setMessage(''); onClose(); onDone?.(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Contact claimant / request more information">
      <p className="muted">Ask for something only the real owner could provide (a receipt, a photo of the item before it was lost, a serial number). {claim?.claimantName} is notified and replies here; chat opens after you approve.</p>
      <Field as="textarea" label="Your message" value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} hint={`${message.trim().length}/500 · do not share the correct answers`} />
      <div className="row"><span className="spacer" /><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={message.trim().length < 5} onClick={send}>Send request</Button></div>
    </Modal>
  );
}

/** Claimant: answer the finder's request with text + photos. */
export function SupplementModal({ claim, open, onClose, onDone }) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const f = new FormData(); f.append('message', message.trim()); files.forEach((x) => f.append('proofs', x));
      await api.upload(`/claims/${claim.id}/supplement`, f);
      toast.success('Information sent to the finder'); setMessage(''); setFiles([]); onClose(); onDone?.();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Send more information" wide>
      <Glass pad style={{ borderRadius: 14, marginBottom: 12 }}><div className="faint small">The finder asks:</div><div>{claim?.moreInfo?.message}</div></Glass>
      <div className="col">
        <Field as="textarea" label="Your reply" value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} />
        <div><strong>Photos (optional)</strong><Dropzone files={files} onChange={setFiles} max={3} label="Add photos" /></div>
        <div className="row"><span className="spacer" /><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={message.trim().length < 5} onClick={send}>Send</Button></div>
      </div>
    </Modal>
  );
}
