import { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '../../pages/reports/reportUtils';
import { createReport } from '../../api/reports';
import '../../styles/reports.css';

const MAX_FILES = 3;
const MAX_MB = 5;

/**
 * <ReportModal open onClose target={{ type: 'item', id: '123', label: 'Black wallet' }} />
 * target.type: item | claim | user | message | general
 */
export default function ReportModal({ open, onClose, target = { type: 'general' } }) {
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState('');
  const [subReason, setSubReason] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.preview)), [files]);

  if (!open) return null;

  const reset = () => { setStep(1); setCategory(''); setSubReason(''); setDescription(''); setFiles([]); setError(''); setDone(null); };
  const close = () => { reset(); onClose(); };

  const addFiles = (list) => {
    setError('');
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setError('Only JPG, PNG or WebP images are allowed.'); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { setError(`Each image must be under ${MAX_MB} MB.`); continue; }
      if (next.length >= MAX_FILES) { setError(`You can attach up to ${MAX_FILES} images.`); break; }
      next.push(Object.assign(f, { preview: URL.createObjectURL(f) }));
    }
    setFiles(next);
  };
  const removeFile = (i) => setFiles(files.filter((_, idx) => idx !== i));

  const submit = async () => {
    setError('');
    if (!subReason) return setError('Choose a reason.');
    if (description.trim().length < 10) return setError('Describe the problem in at least 10 characters.');
    const fd = new FormData();
    fd.append('targetType', target.type || 'general');
    if (target.id) fd.append('targetId', target.id);
    if (target.label) fd.append('targetLabel', target.label);
    fd.append('category', category);
    fd.append('subReason', subReason);
    fd.append('description', description.trim());
    files.forEach((f) => fd.append('images', f));
    setBusy(true);
    try { setDone(await createReport(fd)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const cat = CATEGORIES[category];

  return (
    <div className="rp-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="rp rp-modal" role="dialog" aria-modal="true" aria-labelledby="rp-title" tabIndex={-1} ref={dialogRef}>
        <header className="rp-modal__head">
          <h2 id="rp-title">{done ? 'Report sent' : step === 1 ? 'What is the problem?' : cat?.label}</h2>
          <button className="rp-icon-btn" onClick={close} aria-label="Close">×</button>
        </header>

        {target.label && !done && <p className="rp-target">Reporting: <strong>{target.label}</strong></p>}

        {done ? (
          <div className="rp-body">
            <p className="rp-ticket">{done.ticketId}</p>
            <p>We will review your report. Status changes and admin feedback show up in your notifications and under My reports.</p>
            <div className="rp-actions">
              <a className="rp-btn rp-btn--primary" href="/reports">View my reports</a>
              <button className="rp-btn" onClick={close}>Close</button>
            </div>
          </div>
        ) : step === 1 ? (
          <div className="rp-body">
            <ul className="rp-cats">
              {Object.entries(CATEGORIES).map(([key, c]) => (
                <li key={key}>
                  <button className="rp-cat" onClick={() => { setCategory(key); setSubReason(''); setStep(2); }}>
                    <span className="rp-cat__name">{c.label}</span>
                    <span className="rp-cat__hint">{c.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rp-body">
            <fieldset className="rp-field">
              <legend>Reason</legend>
              <div className="rp-chips">
                {cat.subs.map((s) => (
                  <label key={s} className={`rp-chip ${subReason === s ? 'is-on' : ''}`}>
                    <input type="radio" name="sub" checked={subReason === s} onChange={() => setSubReason(s)} />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="rp-field">
              <span>Details</span>
              <textarea value={description} maxLength={1000} rows={4}
                placeholder="What happened? Include names, places or times that help us check."
                onChange={(e) => setDescription(e.target.value)} />
              <small>{description.length}/1000</small>
            </label>

            <div className="rp-field">
              <span>Screenshots (optional)</span>
              <div className="rp-thumbs">
                {files.map((f, i) => (
                  <div className="rp-thumb" key={f.preview}>
                    <img src={f.preview} alt={`Attachment ${i + 1}`} />
                    <button onClick={() => removeFile(i)} aria-label={`Remove image ${i + 1}`}>×</button>
                  </div>
                ))}
                {files.length < MAX_FILES && (
                  <label className="rp-add">
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                      onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                    Add image
                  </label>
                )}
              </div>
              <small>Up to {MAX_FILES} images, {MAX_MB} MB each. Location data is removed automatically.</small>
            </div>

            {error && <p className="rp-error" role="alert">{error}</p>}
            <div className="rp-actions">
              <button className="rp-btn" onClick={() => { setStep(1); setError(''); }}>Back</button>
              <button className="rp-btn rp-btn--primary" onClick={submit} disabled={busy}>
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </div>
        )}
        {step === 1 && error && <p className="rp-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
