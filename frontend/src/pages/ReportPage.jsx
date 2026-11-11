import { useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Glass, Field, Button, Reveal } from '../components/ui.jsx';
import { Dropzone } from '../components/Dropzone.jsx';
import { MapPicker } from '../components/maps.jsx';
import { VerificationEditor } from '../components/VerificationEditor.jsx';
import { validateEntries, toPayload, emptyEntry } from '../lib/verification.js';
import { api } from '../lib/api.js';
import { CATEGORIES, errMsg, catLabel, fmtDate } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

const SUGGESTIONS = {
  found: {
    electronics: ['I found a [phone/laptop/earbuds] at [place]. Brand and model will be asked during verification.'],
    wallet: ['I found a wallet at [place]. It has some cards and cash. The owner can verify by describing the contents.'],
    keys: ['I found a set of keys at [place]. The keychain detail is kept private for verification.'],
    bags: ['I found a [colour] bag near [place]. I am keeping one detail inside private for verification.'],
    clothing: ['I found a [jacket/shirt/scarf] at [place]. Colour: [colour]. Size and brand will be asked during verification.'],
    documents: ['I found an ID/document at [place]. I will not share the name publicly; the owner can verify privately.'],
    jewelry: ['I found a [ring/necklace/watch] at [place]. I am keeping one detail (engraving/stone) private for verification.'],
    pets: ['I found a [dog/cat/bird] near [place]. Colour: [colour]. Collar or tag detail is kept for verification.'],
    toys: ['I found a [toy] at [place]. Colour: [colour]. One distinctive mark is kept for verification.'],
    sports: ['I found [sports item] at [place]. Brand: [brand]. One detail is kept private for verification.'],
    other: ['I found an item at [place]. One identifying detail is kept back for verification.'],
  },
  lost: {
    electronics: ['I lost my [phone/laptop/earbuds] ([brand, model, colour]) at [place]. It has a [case/sticker/crack].'],
    wallet: ['I lost a [colour] wallet at [place]. It had [cards/cash] and a distinctive [mark].'],
    keys: ['I lost a set of keys near [place]. The keychain has [description].'],
    bags: ['I lost a [colour] bag near [place] on [date]. It has [brand/marks] and contains [items].'],
    clothing: ['I lost a [colour] [jacket/shirt/scarf] at [place]. Brand: [brand], size: [size].'],
    documents: ['I lost my [ID/document] near [place]. It was in a [holder/folder].'],
    jewelry: ['I lost a [ring/necklace/watch] at [place]. It is [metal/colour] with [stone/engraving].'],
    pets: ['My [dog/cat/bird] is missing near [place]. Colour: [colour]. Wearing [collar/tag].'],
    toys: ['I lost a [toy] at [place]. Colour: [colour]. It has [distinctive mark].'],
    sports: ['I lost [sports item] at [place]. Brand: [brand], colour: [colour].'],
    other: ['I lost a [item] at [place]. Distinctive marks: [marks].'],
  },
};

const today = () => new Date().toISOString().slice(0, 10);

/** Rules mirror the server's zod schema so users get instant feedback; the server remains the authority. */
export function validateStep(step, d, type) {
  const e = {};
  if (step === 'basics') {
    if (d.title.trim().length < 3) e.title = 'At least 3 characters';
    if (d.description.trim().length < 10) e.description = 'Describe it in at least 10 characters (colour, brand, marks…)';
    else if (/\[[^\]]*\]/.test(d.description)) e.description = 'Replace the [brackets] with real details';
    if (!d.category) e.category = 'Pick a category';
    if (!d.date) e.date = 'Pick a date'; else if (d.date > today()) e.date = 'Date cannot be in the future';
  }
  if (step === 'where') {
    if (!d.pin) e.pin = 'Drop a pin on the map';
    if (d.areaLabel.trim().length < 2) e.areaLabel = 'Name the area (e.g. “Ashulia, Dhaka”)';
  }
  if (step === 'verification' && type === 'found') {
    // Optional section: blank rows are ignored, but a half-filled row (question without answer or vice versa) is an error.
    const errs = validateEntries(d.verification);
    if (Object.keys(errs).length) e.verification = errs;
  }
  return e;
}

export default function ReportPage() {
  const { type } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const steps = useMemo(() => (type === 'found' ? ['basics', 'where', 'photos', 'verification', 'review'] : ['basics', 'where', 'photos', 'review']), [type]);
  const [i, setI] = useState(0);
  const [d, setD] = useState({ title: '', description: '', category: '', date: today(), pin: null, areaLabel: '', heldAt: '', contactNote: '', verification: [emptyEntry()], files: [] });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  if (!['lost', 'found'].includes(type)) return <Navigate to="/" replace />;
  const step = steps[i];
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target?.value ?? e }));

  const next = () => { const er = validateStep(step, d, type); setErrors(er); if (!Object.keys(er).length) setI((x) => x + 1); };

  const suggestions = SUGGESTIONS[type]?.[d.category] ?? [];

  const submit = async () => {
    setBusy(true);
    try {
      const f = new FormData();
      f.append('type', type); f.append('title', d.title.trim()); f.append('description', d.description.trim()); f.append('category', d.category);
      f.append('date', new Date(`${d.date}T12:00:00`).toISOString()); f.append('lat', d.pin.lat); f.append('lng', d.pin.lng); f.append('areaLabel', d.areaLabel.trim());
      if (type === 'found') {
        if (d.heldAt.trim()) f.append('heldAt', d.heldAt.trim());
        if (d.contactNote.trim()) f.append('contactNote', d.contactNote.trim());
        const payload = toPayload(d.verification);
        if (payload.length) f.append('verification', JSON.stringify(payload)); // answers travel only over the owner's authenticated request
      }
      d.files.forEach((file) => f.append('images', file));
      const r = await api.upload('/items/', f);
      toast.success('Report published. We are looking for matches now.'); nav(`/items/${r.item.id}`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="container" style={{ maxWidth: 820 }}>
      <Reveal>
        <h1 style={{ fontSize: '2.2rem' }}>{type === 'lost' ? 'Report a lost item' : 'Report a found item'}</h1>
        <div className="wiz-steps" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-label={`Step ${i + 1} of ${steps.length}`}>{steps.map((s, k) => <span key={s} className={k <= i ? 'on' : ''} />)}</div>
        <Glass pad className="col">
          {step === 'basics' && <>
            <Field label="Title" value={d.title} onChange={set('title')} maxLength={100} error={errors.title} placeholder="Black leather wallet" />
            <Field label="Category" as="select" value={d.category} onChange={set('category')} error={errors.category}><option value="">Select…</option>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Field>
            <Field label="Description" as="textarea" value={d.description} onChange={set('description')} maxLength={2000} error={errors.description} hint={type === 'found' ? 'Describe it, but keep one detail back for verification (do not reveal everything).' : 'Colour, brand, marks, what was inside. The more detail, the better the matches.'} />
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '-4px 0 12px' }}>
                <span className="muted" style={{ fontSize: 12, width: '100%' }}>Suggestions (tap to use, then edit the [brackets]):</span>
                {suggestions.map((text) => (
                  <button
                    type="button"
                    key={text}
                    className="btn ghost"
                    style={{ fontSize: 12, textAlign: 'left' }}
                    onClick={() => setD((x) => ({ ...x, description: text }))}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}
            <Field label={type === 'lost' ? 'Date lost' : 'Date found'} type="date" max={today()} value={d.date} onChange={set('date')} error={errors.date} />
          </>}
          {step === 'where' && <>
            <MapPicker value={d.pin} onChange={set('pin')} onArea={(name) => setD((x) => ({ ...x, areaLabel: name }))} />
            {errors.pin && <span className="err" role="alert">{errors.pin}</span>}
            <Field label="Area name (public)" value={d.areaLabel} onChange={set('areaLabel')} maxLength={80} error={errors.areaLabel} placeholder="Ashulia, Dhaka" hint="Shown on the report instead of your exact pin." />
            {type === 'found' && <>
              <Field label="Where is the item now? (private)" value={d.heldAt} onChange={set('heldAt')} maxLength={200} placeholder="Library front desk" hint="Shared only with the verified owner." />
              <Field label="Contact note (private)" value={d.contactNote} onChange={set('contactNote')} maxLength={200} placeholder="Call after 5 PM: 01XXX-XXXXXX" hint="Shared only with the verified owner after you approve their claim." />
            </>}
          </>}
          {step === 'photos' && <><Dropzone files={d.files} onChange={(files) => setD((x) => ({ ...x, files }))} max={5} /><p className="hint">Photos help matching and verification. Hide anything sensitive (IDs, card numbers).</p></>}
          {step === 'verification' && <VerificationEditor entries={d.verification} category={d.category} errors={errors.verification ?? {}} onChange={(verification) => setD((x) => ({ ...x, verification }))} />}
          {step === 'review' && <div className="col">
            <h3 style={{ margin: 0 }}>{d.title}</h3><p className="muted" style={{ margin: 0 }}>{catLabel(d.category)} · {fmtDate(d.date)} · {d.areaLabel}</p><p style={{ whiteSpace: 'pre-wrap' }}>{d.description}</p>
            <p className="faint small">{d.files.length} photo(s){type === 'found' ? ` · ${toPayload(d.verification).length} private verification question(s)` : ''}. Your exact pin stays private.</p>
          </div>}
          <div className="row">{i > 0 && <Button type="button" onClick={() => setI((x) => x - 1)}>← Back</Button>}<span className="spacer" />
            {step !== 'review' ? <Button variant="primary" type="button" onClick={next}>Continue →</Button> : <Button variant="primary" loading={busy} onClick={submit}>Publish report</Button>}</div>
        </Glass>
      </Reveal>
    </div>
  );
}