import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Auth.jsx';
import { api } from '../lib/api.js';
import { errMsg, initials, validatePassword } from '../lib/util.js';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const longDate = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
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
    if (!f.current) er.current = 'Enter your current password';
    const p = validatePassword(f.next);
    if (p.length) er.next = `Password needs ${p.join(', ')}`;
    else if (f.next === f.current) er.next = 'Choose a password different from your current one';
    if (f.next !== f.confirm) er.confirm = 'Passwords do not match';
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
      <h2 style={{ margin: 0 }}>Change password</h2>
      <p className="muted small" style={{ margin: 0 }}>You will be signed out on all devices and asked to sign in with the new password.</p>
      <F id="pw-current" label="Current password" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} error={errors.current} maxLength={128} disabled={busy} />
      <F id="pw-new" label="New password" type="password" autoComplete="new-password" value={f.next} onChange={set('next')} error={errors.next} hint="Use 10+ characters; a passphrase works well." maxLength={128} disabled={busy} />
      <F id="pw-confirm" label="Confirm new password" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} maxLength={128} disabled={busy} />
      <Msg m={msg} />
      <div className="row"><Submit busy={busy}>{busy ? 'Updating…' : 'Update password'}</Submit></div>
    </form>
  );
}

/* ---------------- change email (code goes to the NEW address) ---------------- */
function EmailSection() {
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
    if (!EMAIL.test(em)) er.newEmail = 'Enter a valid email address';
    else if (em === user.email) er.newEmail = 'That is already your email address';
    if (!password) er.password = 'Enter your current password';
    setErrors(er); setMsg(null);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await api.post('/auth/email/change/request', { password, newEmail: em });
      setStep('code'); setCode('');
      setMsg({ type: 'ok', text: `We are sending a 6-digit code to ${em}. It is valid for 5 minutes. Check spam if it does not arrive.` });
    } catch (err) {
      setMsg({ type: 'err', text: err.retryAfter ? `Please wait ${err.retryAfter}s before requesting another code.` : errMsg(err) });
    } finally { setBusy(false); }
  }

  async function confirm(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setErrors({ code: 'Enter the 6-digit code' }); return; }
    setErrors({}); setMsg(null); setBusy(true);
    try {
      const d = await api.post('/auth/email/change/confirm', { code });
      updateUser(d.user);
      setStep('form'); setNewEmail(''); setPassword(''); setCode('');
      setMsg({ type: 'ok', text: 'Email address updated and verified.' });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  return (
    <div className="glass pad col">
      <h2 style={{ margin: 0 }}>Email address</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Current: <strong>{user.email}</strong> {user.emailVerified ? '(verified)' : <>(not verified · <Link to="/verify-email">Verify now</Link>)</>}. Your current email stays active until you confirm the new one.
      </p>
      {step === 'form' ? (
        <form className="col" onSubmit={request} noValidate>
          <F id="em-new" label="New email address" type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} error={errors.newEmail} maxLength={254} disabled={busy} />
          <F id="em-pw" label="Current password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} maxLength={128} disabled={busy} />
          <Msg m={msg} />
          <div className="row"><Submit busy={busy}>{busy ? 'Sending code…' : 'Send verification code'}</Submit></div>
        </form>
      ) : (
        <form className="col" onSubmit={confirm} noValidate>
          <Msg m={msg} />
          <F id="em-code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} error={errors.code} maxLength={6} disabled={busy} />
          <div className="row">
            <Submit busy={busy} disabled={code.length !== 6}>{busy ? 'Confirming…' : 'Confirm new email'}</Submit>
            <button type="button" className="btn" disabled={busy} onClick={request}>Resend code</button>
            <button type="button" className="btn" disabled={busy} onClick={() => { setStep('form'); setMsg(null); setErrors({}); }}>Use a different email</button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------------- delete account (7-day grace period) ---------------- */
function DeleteSection() {
  const { user, updateUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user.deletionScheduledFor) return null; // the banner at the top of the page handles the cancel flow

  async function submit(e) {
    e.preventDefault();
    if (!password) { setError('Enter your password to confirm'); return; }
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
      <h2 style={{ margin: 0 }}>Delete account</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Deleting your account permanently removes your profile and sign-in. It is not immediate: you get 7 days to change your mind, and you can cancel from this page at any time before the deadline.
      </p>
      {!open ? (
        <div className="row"><button type="button" className="btn danger" onClick={() => setOpen(true)}>Delete my account…</button></div>
      ) : (
        <form className="col" onSubmit={submit} noValidate>
          <F id="del-pw" label="Confirm with your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} maxLength={128} disabled={busy} />
          <div className="row">
            <Submit danger busy={busy}>{busy ? 'Scheduling…' : 'Schedule deletion in 7 days'}</Submit>
            <button type="button" className="btn" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setError(''); }}>Keep my account</button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ---------------- page ---------------- */
export default function Profile() {
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
      setMsg({ type: 'ok', text: 'Profile updated.' });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  async function onAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type)) return setMsg({ type: 'err', text: 'Use a JPG, PNG or WebP image.' });
    if (file.size > MAX_BYTES) return setMsg({ type: 'err', text: 'Image must be 5 MB or smaller.' });
    setBusy(true); setMsg(null);
    try {
      const d = await api.uploadRaw('/auth/me/avatar', file);
      updateUser(d.user);
      setMsg({ type: 'ok', text: 'Profile picture updated.' });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  async function removeAvatar() {
    setBusy(true); setMsg(null);
    try {
      const d = await api.del('/auth/me/avatar');
      updateUser(d.user);
      setMsg({ type: 'ok', text: 'Profile picture removed.' });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  async function cancelDeletion() {
    setBusy(true); setMsg(null);
    try {
      const d = await api.post('/auth/me/delete/cancel');
      updateUser(d.user);
      setMsg({ type: 'ok', text: 'Deletion cancelled. Your account stays as it is.' });
    } catch (err) {
      setMsg({ type: 'err', text: errMsg(err) });
    } finally { setBusy(false); }
  }

  function cancelEdit() { setEditing(false); setName(user.name); setBio(user.bio || ''); setMsg(null); }

  return (
    <div className="container profile-page">
      <div>
        <h1>Profile</h1>
        <p className="muted">Manage your personal information and account security</p>
      </div>

      {user.deletionScheduledFor && (
        <div className="profile-banner" role="alert">
          <div>
            <strong>Your account is scheduled for deletion on {longDate(user.deletionScheduledFor)}</strong>
            <p className="small" style={{ margin: '4px 0 0' }}>{daysLeft(user.deletionScheduledFor)} day(s) left. Cancel before then and nothing is removed.</p>
          </div>
          <button type="button" className="btn" disabled={busy} onClick={cancelDeletion}>Cancel deletion</button>
        </div>
      )}

      <Msg m={msg} />

      <section className="glass pad profile-head">
        <div className="profile-avatar-wrap">
          <div className="avatar profile-avatar">
            {user.avatarUrl ? <img src={user.avatarUrl} alt={`${user.name}'s profile picture`} /> : initials(user.name)}
          </div>
          <button type="button" className="icon-btn profile-cam" aria-label="Change profile picture" disabled={busy} onClick={() => fileRef.current?.click()}>📷</button>
          <input ref={fileRef} type="file" accept={TYPES.join(',')} hidden onChange={onAvatar} />
        </div>
        <div className="profile-meta">
          <h2>{user.name}</h2>
          <p className="muted">{user.email}</p>
          <p className="faint small">Member since {longDate(user.createdAt)}</p>
          <div className="row">
            {user.emailVerified
              ? <span className="chip verified">✓ Email verified</span>
              : <span className="chip pending">Not verified · <Link to="/verify-email">Verify now</Link></span>}
            {user.avatarUrl && <button type="button" className="btn sm" disabled={busy} onClick={removeAvatar}>Remove photo</button>}
          </div>
          <p className="hint" style={{ margin: '8px 0 0' }}>JPG, PNG or WebP, up to 5 MB.</p>
        </div>
      </section>

      <form className="glass pad col" onSubmit={save} noValidate>
        <div className="row">
          <h2 style={{ margin: 0 }}>Personal information</h2>
          <span className="spacer" />
          {!editing && <button type="button" className="btn sm" onClick={() => { setEditing(true); setMsg(null); }}>Edit profile</button>}
        </div>

        <F id="p-name" label="Full name" value={name} onChange={(e) => setName(e.target.value)} disabled={!editing || busy} maxLength={60} error={nameInvalid ? 'Name must be at least 2 characters' : ''} />
        <F id="p-email" label="Email" value={user.email} disabled readOnly hint="Change it in the Email address section below." />

        <div className="field">
          <label htmlFor="p-bio">Bio</label>
          <textarea id="p-bio" className="textarea" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} disabled={!editing || busy} maxLength={280} />
          <span className="hint">{bio.length}/280</span>
        </div>

        {editing && (
          <div className="row">
            <Submit busy={busy} disabled={!dirty || nameInvalid}>{busy ? 'Saving…' : 'Save changes'}</Submit>
            <button type="button" className="btn" disabled={busy} onClick={cancelEdit}>Cancel</button>
          </div>
        )}
      </form>

      <EmailSection />
      <PasswordSection />
      <DeleteSection />
    </div>
  );
}