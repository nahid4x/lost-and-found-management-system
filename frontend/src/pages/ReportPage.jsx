import { useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Glass, Field, Button, Reveal } from '../components/ui.jsx';
import { Dropzone } from '../components/Dropzone.jsx';
import { MapPicker } from '../components/maps.jsx';
import { api } from '../lib/api.js';
import { CATEGORIES, errMsg, catLabel, fmtDate } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

const today = () => new Date().toISOString().slice(0, 10);

/** Rules mirror the server's zod schema so users get instant feedback; the server remains the authority. */
export function validateStep(step, d, type) {
  const e = {};
  if (step === 'basics') {
    if (d.title.trim().length < 3) e.title = 'At least 3 characters';
    if (d.description.trim().length < 10) e.description = 'Describe it in at least 10 characters (colour, brand, marks…)';
    if (!d.category) e.category = 'Pick a category';
    if (!d.date) e.date = 'Pick a date'; else if (d.date > today()) e.date = 'Date cannot be in the future';
  }
  if (step === 'where') {
    if (!d.pin) e.pin = 'Drop a pin on the map';
    if (d.areaLabel.trim().length < 2) e.areaLabel = 'Name the area (e.g. “Ashulia, Dhaka”)';
  }
  if (step === 'questions' && type === 'found') {
    const filled = d.questions.map((q) => q.trim()).filter(Boolean);
    if (!filled.length) e.questions = 'Add at least one private question';
    if (filled.some((q) => q.length < 3)) e.questions = 'Questions need at least 3 characters';
  }
  return e;
}

export default function ReportPage() {
  const { type } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const steps = useMemo(() => (type === 'found' ? ['basics', 'where', 'photos', 'questions', 'review'] : ['basics', 'where', 'photos', 'review']), [type]);
  const [i, setI] = useState(0);
  const [d, setD] = useState({ title: '', description: '', category: '', date: today(), pin: null, areaLabel: '', heldAt: '', contactNote: '', questions: [''], files: [] });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  if (!['lost', 'found'].includes(type)) return <Navigate to="/" replace />;
  const step = steps[i];
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target?.value ?? e }));

  const next = () => { const er = validateStep(step, d, type); setErrors(er); if (!Object.keys(er).length) setI((x) => x + 1); };
  const submit = async () => {
    setBusy(true);
    try {
      const f = new FormData();
      f.append('type', type); f.append('title', d.title.trim()); f.append('description', d.description.trim()); f.append('category', d.category);
      f.append('date', new Date(`${d.date}T12:00:00`).toISOString()); f.append('lat', d.pin.lat); f.append('lng', d.pin.lng); f.append('areaLabel', d.areaLabel.trim());
      if (type === 'found') {
        if (d.heldAt.trim()) f.append('heldAt', d.heldAt.trim());
        if (d.contactNote.trim()) f.append('contactNote', d.contactNote.trim());
        f.append('questions', JSON.stringify(d.questions.map((q) => q.trim()).filter(Boolean)));
      }
      d.files.forEach((file) => f.append('images', file));
      const r = await api.upload('/items/', f);
      toast.success('Report published. We are looking for matches now.'); nav(`/items/${r.item.id}`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="container" style={{ maxWidth: 820 }}>
      <Reveal>
        <h1 style={{ fontSize: '2.2rem' }}>{type === 'lost' ? ' Report a lost item' : ' Report a found item'}</h1>
        <div className="wiz-steps" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-label={`Step ${i + 1} of ${steps.length}`}>{steps.map((s, k) => <span key={s} className={k <= i ? 'on' : ''} />)}</div>
        <Glass pad className="col">
          {step === 'basics' && <>
            <Field label="Title" value={d.title} onChange={set('title')} maxLength={100} error={errors.title} placeholder="Black leather wallet" />
            <Field label="Category" as="select" value={d.category} onChange={set('category')} error={errors.category}><option value="">Select…</option>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Field>
            <Field label="Description" as="textarea" value={d.description} onChange={set('description')} maxLength={2000} error={errors.description} hint={type === 'found' ? 'Describe it, but keep one detail back for verification (do not reveal everything).' : 'Colour, brand, marks, what was inside. The more detail, the better the matches.'} />
            <Field label={type === 'lost' ? 'Date lost' : 'Date found'} type="date" max={today()} value={d.date} onChange={set('date')} error={errors.date} />
          </>}
          {step === 'where' && <>
            <MapPicker value={d.pin} onChange={(pin) => setD((x) => ({ ...x, pin }))} />{errors.pin && <span className="err" role="alert">{errors.pin}</span>}
            <Field label="Area name (public)" value={d.areaLabel} onChange={set('areaLabel')} maxLength={80} error={errors.areaLabel} placeholder="Ashulia, Dhaka" hint="Shown on the report instead of your exact pin." />
            {type === 'found' && <>
              <Field label="Where is the item now? (private)" value={d.heldAt} onChange={set('heldAt')} maxLength={200} placeholder="Library front desk" hint="Shared only with the verified owner." />
              <Field label="Contact note (private)" value={d.contactNote} onChange={set('contactNote')} maxLength={200} placeholder="Call after 5 PM: 01XXX-XXXXXX" hint="Shared only with the verified owner after you approve their claim." />
            </>}
          </>}
          {step === 'photos' && <><Dropzone files={d.files} onChange={(files) => setD((x) => ({ ...x, files }))} max={5} /><p className="hint">Photos help matching and verification. Hide anything sensitive (IDs, card numbers).</p></>}
          {step === 'questions' && <>
            <p className="muted">Ask 1–3 questions only the real owner can answer (contents, a scratch, a lock-screen picture). You will compare their answers yourself. We never store correct answers.</p>
            {d.questions.map((q, k) => (
              <div className="row" key={k} style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
                <Field style={{ flex: 1 }} label={`Question ${k + 1}`} value={q} maxLength={200} onChange={(e) => setD((x) => ({ ...x, questions: x.questions.map((v, j) => (j === k ? e.target.value : v)) }))} />
                {d.questions.length > 1 && <Button type="button" size="sm" aria-label={`Remove question ${k + 1}`} onClick={() => setD((x) => ({ ...x, questions: x.questions.filter((_, j) => j !== k) }))}>✕</Button>}
              </div>
            ))}
            {errors.questions && <span className="err" role="alert">{errors.questions}</span>}
            {d.questions.length < 3 && <Button type="button" size="sm" onClick={() => setD((x) => ({ ...x, questions: [...x.questions, ''] }))}>+ Add question</Button>}
          </>}
          {step === 'review' && <div className="col">
            <h3 style={{ margin: 0 }}>{d.title}</h3><p className="muted" style={{ margin: 0 }}>{catLabel(d.category)} · {fmtDate(d.date)} · 📍 {d.areaLabel}</p><p style={{ whiteSpace: 'pre-wrap' }}>{d.description}</p>
            <p className="faint small">{d.files.length} photo(s){type === 'found' ? ` · ${d.questions.filter((q) => q.trim()).length} verification question(s)` : ''}. Your exact pin stays private.</p>
          </div>}
          <div className="row">{i > 0 && <Button type="button" onClick={() => setI((x) => x - 1)}>← Back</Button>}<span className="spacer" />
            {step !== 'review' ? <Button variant="primary" type="button" onClick={next}>Continue →</Button> : <Button variant="primary" loading={busy} onClick={submit}>Publish report</Button>}</div>
        </Glass>
      </Reveal>
    </div>
  );
}
