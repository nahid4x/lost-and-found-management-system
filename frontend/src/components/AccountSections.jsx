import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/Auth.jsx';
import { api } from '../lib/api.js';
import { errMsg, validatePassword } from '../lib/util.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const longDate = (d, lng) => new Date(d).toLocaleDateString(lng?.startsWith('bn') ? 'bn-BD' : undefined, { year: 'numeric', month: 'long', day: 'numeric' });
export const daysLeft = (d) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));

export function Msg({ m }) {
  if (!m) return null;
  return <div className={`profile-msg ${m.type}`} role={m.type === 'err' ? 'alert' : 'status'}>{m.text}</div>;
}

export function F({ id, label, error, hint, ...props }) {
  return (
    <div className={`field ${error ? 'invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" aria-invalid={!!error} {...props} />
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Submit({ busy, disabled, danger, children }) {
  return (
    <button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy || disabled} aria-busy={busy}>
      {busy && <span className="spinner" />}{children}
    </button>
  );
}

/* ---------------- change password ---------------- */
export function PasswordSection() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (!f.current) er.current = t('profile.pwEnterCurrent');
    const p = validatePassword(f.next);
    if (p.length) er.next = t('profile.pwNeeds', { issues: p.join(', ') });
    else if (f.next === f.current) er.next = t('profile.pwDifferent');
    if (f.next !== f.confirm) er.confirm = t('profile.pwMismatch');
    setErrors(er); setMsg(null);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await api.post('/auth/password/change', { current: f.current, password: f.next });
      // The server signs out every session after a password change, so sign in again with the new one.
      await logout();
      nav('/login', { replace: true });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
      setBusy(false);
    }
  }

  return (
    <form className="glass pad col" onSubmit={submit} noValidate>
      <h2 style={{ margin: 0 }}>{t('profile.pwTitle')}</h2>
      <p className="muted small" style={{ margin: 0 }}>{t('profile.pwHint')}</p>
      <F id="pw-current" label={t('profile.pwCurrent')} type="password" autoComplete="current-password" value={f.current} onChange={set('current')} error={errors.current} maxLength={128} disabled={busy} />
      <F id="pw-new" label={t('profile.pwNew')} type="password" autoComplete="new-password" value={f.next} onChange={set('next')} error={errors.next} hint={t('profile.pwNewHint')} maxLength={128} disabled={busy} />
      <F id="pw-confirm" label={t('profile.pwConfirm')} type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} maxLength={128} disabled={busy} />
      <Msg m={msg} />
      <div className="row"><Submit busy={busy}>{busy ? t('profile.pwUpdating') : t('profile.pwUpdate')}</Submit></div>
    </form>
  );
}

/* ---------------- change email (code goes to the NEW address) ---------------- */
export function EmailSection() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [step, setStep] = useState('form');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function request(e) {
    e?.preventDefault();
    const er = {};
    const em = newEmail.trim().toLowerCase();
    if (!EMAIL.test(em)) er.newEmail = t('profile.emInvalid');
    else if (em === user.email) er.newEmail = t('profile.emSame');
    if (!password) er.password = t('profile.pwEnterCurrent');
    setErrors(er); setMsg(null);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await api.post('/auth/email/change/request', { password, newEmail: em });
      setStep('code'); setCode('');
      setMsg({ type: 'ok', text: t('profile.emSent', { email: em }) });
    } catch (err) {
      setMsg({ type: 'err', text: err.retryAfter ? t('profile.emWait', { s: err.retryAfter }) : errMsg(err) });
    } finally { setBusy(false); }
  }

  async function confirm(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setErrors({ code: t('profile.emCode6') }); return; }
    setErrors({}); setMsg(null); setBusy(true);
    try {
      const d = await api.post('/auth/email/change/confirm', { code });
      updateUser(d.user);
      setStep('form'); setNewEmail(''); setPassword(''); setCode('');
      setMsg({ type: 'ok', text: t('profile.emUpdated') });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  return (
    <div className="glass pad col">
      <h2 style={{ margin: 0 }}>{t('profile.emTitle')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {t('profile.emCurrent')} <strong>{user.email}</strong> {user.emailVerified ? t('profile.emVerified') : <>({t('profile.notVerified')} · <Link to="/verify-email">{t('profile.verifyNow')}</Link>)</>}. {t('profile.emStays')}
      </p>
      {step === 'form' ? (
        <form className="col" onSubmit={request} noValidate>
          <F id="em-new" label={t('profile.emNew')} type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} error={errors.newEmail} maxLength={254} disabled={busy} />
          <F id="em-pw" label={t('profile.pwCurrent')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} maxLength={128} disabled={busy} />
          <Msg m={msg} />
          <div className="row"><Submit busy={busy}>{busy ? t('profile.emSending') : t('profile.emSend')}</Submit></div>
        </form>
      ) : (
        <form className="col" onSubmit={confirm} noValidate>
          <Msg m={msg} />
          <F id="em-code" label={t('profile.emCodeLabel')} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} error={errors.code} maxLength={6} disabled={busy} />
          <div className="row">
            <Submit busy={busy} disabled={code.length !== 6}>{busy ? t('profile.emConfirming') : t('profile.emConfirm')}</Submit>
            <button type="button" className="btn" disabled={busy} onClick={request}>{t('profile.emResend')}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => { setStep('form'); setMsg(null); setErrors({}); }}>{t('profile.emDifferent')}</button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------------- delete account (7-day grace period) ---------------- */
export function DeleteSection() {
  const { t, i18n } = useTranslation();
  const { user, updateUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!password) { setError(t('profile.delEnterPw')); return; }
    setError(''); setBusy(true);
    try {
      const d = await api.post('/auth/me/delete', { password });
      updateUser(d.user);
    } catch (err) {
      setError(errMsg(err));
    } finally { setBusy(false); }
  }

  async function cancelDeletion() {
    setBusy(true); setMsg(null);
    try {
      const d = await api.post('/auth/me/delete/cancel');
      updateUser(d.user);
      setMsg({ type: 'ok', text: t('profile.delCancelled') });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  if (user.deletionScheduledFor) {
    return (
      <section className="glass pad col danger-zone">
        <h2 style={{ margin: 0 }}>{t('profile.delTitle')}</h2>
        <p style={{ margin: 0 }}><strong>{t('profile.delBanner', { date: longDate(user.deletionScheduledFor, i18n.language) })}</strong></p>
        <p className="muted small" style={{ margin: 0 }}>{t('profile.daysLeft', { count: daysLeft(user.deletionScheduledFor) })}</p>
        <Msg m={msg} />
        <div className="row"><button type="button" className="btn" disabled={busy} onClick={cancelDeletion}>{t('profile.cancelDeletion')}</button></div>
      </section>
    );
  }

  return (
    <section className="glass pad col danger-zone">
      <h2 style={{ margin: 0 }}>{t('profile.delTitle')}</h2>
      <p className="muted small" style={{ margin: 0 }}>{t('profile.delText')}</p>
      <Msg m={msg} />
      {!open ? (
        <div className="row"><button type="button" className="btn danger fi-neon-danger" onClick={() => setOpen(true)}>{t('profile.delBtn')}</button></div>
      ) : (
        <form className="col" onSubmit={submit} noValidate>
          <F id="del-pw" label={t('profile.delConfirmPw')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} maxLength={128} disabled={busy} />
          <div className="row">
            <Submit danger busy={busy}>{busy ? t('profile.delScheduling') : t('profile.delSchedule')}</Submit>
            <button type="button" className="btn" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setError(''); }}>{t('profile.delKeep')}</button>
          </div>
        </form>
      )}
    </section>
  );
}