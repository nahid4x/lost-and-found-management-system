import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/Auth.jsx';
import { api } from '../lib/api.js';
import { errMsg, initials, validatePassword } from '../lib/util.js';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const longDate = (d, lng) => new Date(d).toLocaleDateString(lng?.startsWith('bn') ? 'bn-BD' : undefined, { year: 'numeric', month: 'long', day: 'numeric' });
const daysLeft = (d) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));

function Msg({ m }) {
  if (!m) return null;
  return <div className={`profile-msg ${m.type}`} role={m.type === 'err' ? 'alert' : 'status'}>{m.text}</div>;
}

function F({ id, label, error, hint, ...props }) {
  return (
    <div className={`field ${error ? 'invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" aria-invalid={!!error} {...props} />
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function Submit({ busy, disabled, danger, children }) {
  return (
    <button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy || disabled} aria-busy={busy}>
      {busy && <span className="spinner" />}{children}
    </button>
  );
}

/* ---------------- change password ---------------- */
function PasswordSection() {
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
function EmailSection() {
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
function DeleteSection() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user.deletionScheduledFor) return null; // the banner at the top of the page handles the cancel flow

  async function submit(e) {
    e.preventDefault();
    if (!password) { setError(t('profile.delEnterPw')); return; }
    setError(''); setBusy(true);
    try {
      const d = await api.post('/auth/me/delete', { password });
      updateUser(d.user);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(errMsg(err));
    } finally { setBusy(false); }
  }

  return (
    <section className="glass pad col danger-zone">
      <h2 style={{ margin: 0 }}>{t('profile.delTitle')}</h2>
      <p className="muted small" style={{ margin: 0 }}>{t('profile.delText')}</p>
      {!open ? (
        <div className="row"><button type="button" className="btn danger" onClick={() => setOpen(true)}>{t('profile.delBtn')}</button></div>
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

/* ---------------- page ---------------- */
export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const dirty = name.trim() !== user.name || bio.trim() !== (user.bio || '');
  const nameInvalid = editing && name.trim().length < 2;

  async function save(e) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true); setMsg(null);
    try {
      const d = await api.patch('/auth/me', { name: name.trim(), bio: bio.trim() });
      updateUser(d.user);
      setEditing(false);
      setMsg({ type: 'ok', text: t('profile.updated') });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  async function onAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type)) return setMsg({ type: 'err', text: t('profile.useImage') });
    if (file.size > MAX_BYTES) return setMsg({ type: 'err', text: t('profile.imgSmall') });
    setBusy(true); setMsg(null);
    try {
      const d = await api.uploadRaw('/auth/me/avatar', file);
      updateUser(d.user);
      setMsg({ type: 'ok', text: t('profile.picUpdated') });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  async function removeAvatar() {
    setBusy(true); setMsg(null);
    try {
      const d = await api.del('/auth/me/avatar');
      updateUser(d.user);
      setMsg({ type: 'ok', text: t('profile.picRemoved') });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
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

  function cancelEdit() { setEditing(false); setName(user.name); setBio(user.bio || ''); setMsg(null); }

  return (
    <div className="container profile-page">
      <div>
        <h1>{t('profile.title')}</h1>
        <p className="muted">{t('profile.subtitle')}</p>
      </div>

      {user.deletionScheduledFor && (
        <div className="profile-banner" role="alert">
          <div>
            <strong>{t('profile.delBanner', { date: longDate(user.deletionScheduledFor, i18n.language) })}</strong>
            <p className="small" style={{ margin: '4px 0 0' }}>{t('profile.daysLeft', { count: daysLeft(user.deletionScheduledFor) })}</p>
          </div>
          <button type="button" className="btn" disabled={busy} onClick={cancelDeletion}>{t('profile.cancelDeletion')}</button>
        </div>
      )}

      <Msg m={msg} />

      <section className="glass pad profile-head">
        <div className="profile-avatar-wrap">
          <div className="avatar profile-avatar">
            {user.avatarUrl ? <img src={user.avatarUrl} alt={t('profile.avatarAlt', { name: user.name })} /> : initials(user.name)}
          </div>
          <button type="button" className="icon-btn profile-cam" aria-label={t('profile.changePhoto')} disabled={busy} onClick={() => fileRef.current?.click()}>📷</button>
          <input ref={fileRef} type="file" accept={TYPES.join(',')} hidden onChange={onAvatar} />
        </div>
        <div className="profile-meta">
          <h2>{user.name}</h2>
          <p className="muted">{user.email}</p>
          <p className="faint small">{t('profile.memberSince', { date: longDate(user.createdAt, i18n.language) })}</p>
          <div className="row">
            {user.emailVerified
              ? <span className="chip verified">{t('profile.emailVerified')}</span>
              : <span className="chip pending">{t('profile.notVerified')} · <Link to="/verify-email">{t('profile.verifyNow')}</Link></span>}
            {user.avatarUrl && <button type="button" className="btn sm" disabled={busy} onClick={removeAvatar}>{t('profile.removePhoto')}</button>}
          </div>
          <p className="hint" style={{ margin: '8px 0 0' }}>{t('profile.photoHint')}</p>
        </div>
      </section>

      <form className="glass pad col" onSubmit={save} noValidate>
        <div className="row">
          <h2 style={{ margin: 0 }}>{t('profile.personal')}</h2>
          <span className="spacer" />
          {!editing && <button type="button" className="btn sm" onClick={() => { setEditing(true); setMsg(null); }}>{t('profile.editProfile')}</button>}
        </div>

        <F id="p-name" label={t('profile.fullName')} value={name} onChange={(e) => setName(e.target.value)} disabled={!editing || busy} maxLength={60} error={nameInvalid ? t('profile.nameMin') : ''} />
        <F id="p-email" label={t('profile.email')} value={user.email} disabled readOnly hint={t('profile.emailHint')} />

        <div className="field">
          <label htmlFor="p-bio">{t('profile.bio')}</label>
          <textarea id="p-bio" className="textarea" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} disabled={!editing || busy} maxLength={280} />
          <span className="hint">{bio.length}/280</span>
        </div>

        {editing && (
          <div className="row">
            <Submit busy={busy} disabled={!dirty || nameInvalid}>{busy ? t('profile.saving') : t('profile.save')}</Submit>
            <button type="button" className="btn" disabled={busy} onClick={cancelEdit}>{t('common.cancel')}</button>
          </div>
        )}
      </form>

      <EmailSection />
      <PasswordSection />
      <DeleteSection />
    </div>
  );
}