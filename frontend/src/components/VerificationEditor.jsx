import { Field, Button } from './ui.jsx';
import { emptyEntry, MAX_QUESTIONS, TYPES, WEIGHTS, templatesFor, validateEntries } from '../lib/verification.js';

/**
 * Private verification questions + answers. Answers are only ever sent to the server over the owner's
 * authenticated session; they are never rendered on public pages.
 */
export function VerificationEditor({ entries, onChange, category, errors = {}, disabled }) {
  const set = (i, patch) => onChange(entries.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const full = entries.length >= MAX_QUESTIONS;
  const taken = new Set(entries.map((e) => e.question.trim().toLowerCase()));
  const suggestions = templatesFor(category).filter(([q]) => !taken.has(q.toLowerCase()));
  const addTemplate = ([question, type]) => {
    const blank = entries.findIndex((e) => !e.question.trim() && !e.answer.trim());
    const next = { ...emptyEntry(), question, type };
    onChange(blank >= 0 ? entries.map((e, k) => (k === blank ? next : e)) : [...entries, next]);
  };
  return (
    <div className="col">
      <div className="glass pad" style={{ borderRadius: 14, padding: 14 }}>
        <strong>🔒 Private verification (optional)</strong>
        <p className="hint" style={{ margin: '6px 0 0' }}>Ask things only the real owner would know. Your answers are stored separately, are never shown on the public page and are never visible to claimants.
          When someone claims the item, the server compares their answers with yours and shows you a match score. A high score helps your decision; it is not proof of ownership.</p>
      </div>
      {!!suggestions.length && !full && (
        <div><span className="hint">Suggestions:</span>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>{suggestions.slice(0, 6).map((t) => <button key={t[0]} type="button" className="chip" style={{ cursor: 'pointer', textTransform: 'none' }} onClick={() => addTemplate(t)} disabled={disabled}>+ {t[0]}</button>)}</div>
        </div>
      )}
      {entries.map((e, i) => (
        <div key={i} className="glass pad" style={{ borderRadius: 14, padding: 14 }}>
          <div className="col">
            <Field label={`Question ${i + 1}`} value={e.question} maxLength={200} disabled={disabled} onChange={(ev) => set(i, { question: ev.target.value })} error={errors[i]?.question} placeholder="e.g. What was the phone’s wallpaper?" />
            <Field label="Correct answer (private)" value={e.answer} maxLength={200} disabled={disabled} autoComplete="off" onChange={(ev) => set(i, { answer: ev.target.value })} error={errors[i]?.answer} inputMode={e.type === 'number' ? 'decimal' : undefined} />
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field as="select" label="Answer type" value={e.type} disabled={disabled} onChange={(ev) => set(i, { type: ev.target.value })} style={{ minWidth: 150 }}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Field>
              <Field as="select" label="Importance" value={e.weight} disabled={disabled} onChange={(ev) => set(i, { weight: Number(ev.target.value) })} style={{ minWidth: 130 }}>{WEIGHTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Field>
              {e.type === 'number' && <Field label="Allowed difference (optional)" value={e.tolerance} inputMode="decimal" disabled={disabled} onChange={(ev) => set(i, { tolerance: ev.target.value })} error={errors[i]?.tolerance} placeholder="0 = exact" style={{ minWidth: 160 }} />}
              <span className="spacer" />
              <Button type="button" size="sm" disabled={disabled} aria-label={`Remove question ${i + 1}`} onClick={() => onChange(entries.filter((_, k) => k !== i))}>Remove</Button>
            </div>
            <span className="hint">{e.type === 'text' ? 'Compared exactly (ignoring capitals, spaces and punctuation).' : e.type === 'number' ? 'Compared as a number. ৳ and commas are ignored; Bangla digits work.' : 'Compared by key words. Close answers count as approximate, never as a full match.'}</span>
          </div>
        </div>
      ))}
      {errors._form && <span className="err" role="alert">{errors._form}</span>}
      <div className="row"><Button type="button" size="sm" disabled={disabled || full} onClick={() => onChange([...entries, emptyEntry()])}>+ Add question</Button><span className="hint">{entries.filter((e) => e.question.trim()).length}/{MAX_QUESTIONS}</span></div>
    </div>
  );
}

export { validateEntries };
