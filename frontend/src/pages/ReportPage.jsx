import { useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/index.js';
import { Glass, Field, Button, Reveal } from '../components/ui.jsx';
import { Dropzone } from '../components/Dropzone.jsx';
import { MapPicker } from '../components/maps.jsx';
import { VerificationEditor } from '../components/VerificationEditor.jsx';
import { validateEntries, toPayload, emptyEntry } from '../lib/verification.js';
import { api } from '../lib/api.js';
import { CATEGORIES, errMsg, catLabel, fmtDate } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

const today = () => new Date().toISOString().slice(0, 10);

/** Rules mirror the server's zod schema so users get instant feedback; the server remains the authority. */
export function validateStep(step, d, type) {
  const T = (k) => i18n.t(k);
  const e = {};
  if (step === 'basics') {
    if (d.title.trim().length < 3) e.title = T('report.e_title');
    if (d.description.trim().length < 10) e.description = T('report.e_desc');
    else if (/\[[^\]]*\]/.test(d.description)) e.description = T('report.e_brackets');
    if (!d.category) e.category = T('report.e_category');
    if (!d.date) e.date = T('report.e_date'); else if (d.date > today()) e.date = T('report.e_future');
  }
  if (step === 'where') {
    if (!d.pin) e.pin = T('report.e_pin');
    if (d.areaLabel.trim().length < 2) e.areaLabel = T('report.e_area');
  }
  if (step === 'verification' && type === 'found') {
    // Optional section: blank rows are ignored, but a half-filled row (question without answer or vice versa) is an error.
    const errs = validateEntries(d.verification);
    if (Object.keys(errs).length) e.verification = errs;
  }
  return e;
}

export default function ReportPage() {
  const { t, i18n: i18 } = useTranslation();
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

  const sugKey = d.category ? `report.sug_${type}_${d.category}` : null;
  const suggestions = sugKey && i18.exists(sugKey) ? [t(sugKey)] : [];

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
      toast.success(t('report.published')); nav(`/items/${r.item.id}`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="container" style={{ maxWidth: 820 }}>
      <Reveal>
        <h1 style={{ fontSize: '2.2rem' }}>{type === 'lost' ? t('report.lostTitle') : t('report.foundTitle')}</h1>
        <div className="wiz-steps" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-label={t('report.stepOf', { n: i + 1, total: steps.length })}>{steps.map((s, k) => <span key={s} className={k <= i ? 'on' : ''} />)}</div>
        <Glass pad className="col">
          {step === 'basics' && <>
            <Field label={t('report.title')} value={d.title} onChange={set('title')} maxLength={100} error={errors.title} placeholder={t('report.titlePh')} />
            <Field label={t('report.category')} as="select" value={d.category} onChange={set('category')} error={errors.category}><option value="">{t('report.select')}</option>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{t(`cat.${k}`, { defaultValue: l })}</option>)}</Field>
            <Field label={t('report.description')} as="textarea" value={d.description} onChange={set('description')} maxLength={2000} error={errors.description} hint={type === 'found' ? t('report.descHintFound') : t('report.descHintLost')} />
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '-4px 0 12px' }}>
                <span className="muted" style={{ fontSize: 12, width: '100%' }}>{t('report.sugLabel')}</span>
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
            <Field label={type === 'lost' ? t('report.dateLost') : t('report.dateFound')} type="date" max={today()} value={d.date} onChange={set('date')} error={errors.date} />
          </>}
          {step === 'where' && <>
            <MapPicker value={d.pin} onChange={set('pin')} onArea={(name) => setD((x) => ({ ...x, areaLabel: name }))} />
            {errors.pin && <span className="err" role="alert">{errors.pin}</span>}
            <Field label={t('report.areaName')} value={d.areaLabel} onChange={set('areaLabel')} maxLength={80} error={errors.areaLabel} placeholder={t('report.areaPh')} hint={t('report.areaHint')} />
            {type === 'found' && <>
              <Field label={t('report.heldAt')} value={d.heldAt} onChange={set('heldAt')} maxLength={200} placeholder={t('report.heldAtPh')} hint={t('report.heldAtHint')} />
              <Field label={t('report.contactNote')} value={d.contactNote} onChange={set('contactNote')} maxLength={200} placeholder={t('report.contactPh')} hint={t('report.contactHint')} />
            </>}
          </>}
          {step === 'photos' && <><Dropzone files={d.files} onChange={(files) => setD((x) => ({ ...x, files }))} max={5} /><p className="hint">{t('report.photosHint')}</p></>}
          {step === 'verification' && <VerificationEditor entries={d.verification} category={d.category} errors={errors.verification ?? {}} onChange={(verification) => setD((x) => ({ ...x, verification }))} />}
          {step === 'review' && <div className="col">
            <h3 style={{ margin: 0 }}>{d.title}</h3><p className="muted" style={{ margin: 0 }}>{catLabel(d.category)} · {fmtDate(d.date)} · {d.areaLabel}</p><p style={{ whiteSpace: 'pre-wrap' }}>{d.description}</p>
            <p className="faint small">{t('report.photos', { count: d.files.length })}{type === 'found' ? ` · ${t('report.vq', { count: toPayload(d.verification).length })}` : ''}. {t('report.pinPrivate')}</p>
          </div>}
          <div className="row">{i > 0 && <Button type="button" onClick={() => setI((x) => x - 1)}>{t('report.back')}</Button>}<span className="spacer" />
            {step !== 'review' ? <Button variant="primary" type="button" onClick={next}>{t('report.continue')}</Button> : <Button variant="primary" loading={busy} onClick={submit}>{t('report.publish')}</Button>}</div>
        </Glass>
      </Reveal>
    </div>
  );
}