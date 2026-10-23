import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Glass, Field, Button, Reveal } from '../components/ui.jsx';
import { useAuth } from '../context/Auth.jsx';
import { api, safeNext } from '../lib/api.js';
import { errMsg, strength, validatePassword } from '../lib/util.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_COOLDOWN_S = 60; // matches the backend resend cooldown

function Strength({ pw }) {
  const s = strength(pw);
  return <div aria-live="polite"><div className="bar" role="presentation"><i style={{ width: `${(s / 4) * 100}%`, background: ['#fb7185', '#fb7185', '#fbbf24', '#4ade80', '#2dd4bf'][s] }} /></div><span className="hint">Strength: {['too weak', 'weak', 'fair', 'good', 'strong'][s]}. Use 10+ characters; a passphrase works well.</span></div>;
}

export default function AuthPages({ mode }) {
  const { user, login, register } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = safeNext(sp.get('next'));
  const token = sp.get('token') ?? '';
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // verify mode: with ?token= the old email-link flow runs; without it we show the 6-digit code screen.
  const [state, setState] = useState(mode === 'verify' ? (token ? 'working' : 'code') : 'idle');
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const [codeInfo, setCodeInfo] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  // Old link flow: only when a token is actually present (no more empty-token calls).
  useEffect(() => {
    if (mode !== 'verify' || !token) return;
    api.post('/auth/email/verify', { token }).then(() => setState('ok')).catch(() => setState('bad'));
  }, [mode, token]);

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (user && ['login', 'register'].includes(mode)) return <Navigate to={next} replace />;

  const sendCode = async () => {
    setCodeMsg(''); setCodeInfo(''); setSending(true);
    try {
      await api.post('/auth/email/otp/send', {});
      setCooldown(OTP_COOLDOWN_S);
      setCodeInfo(`We sent a 6-digit code to ${user?.email ?? 'your email'}. It expires in 5 minutes.`);
    } catch (err) { setCodeMsg(errMsg(err)); } finally { setSending(false); }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setCodeMsg(''); setCodeInfo('');
    if (!/^\d{6}$/.test(code)) { setCodeMsg('Enter the 6-digit code from your email'); return; }
    setBusy(true);
    try {
      await api.post('/auth/email/otp/verify', { code });
      setState('ok');
      // Reload so the signed-in user (and the "not verified" banners) pick up the new status.
      setTimeout(() => window.location.assign('/'), 1200);
    } catch (err) { setCodeMsg(errMsg(err)); } finally { setBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (mode !== 'reset' && mode !== 'verify' && !EMAIL.test(f.email)) er.email = 'Enter a valid email';
    if (mode === 'register' && f.name.trim().length < 2) er.name = 'Enter your name';
    if (['register', 'reset'].includes(mode)) { const p = validatePassword(f.password); if (p.length) er.password = `Password needs ${p.join(', ')}`; }
    if (mode === 'login' && !f.password) er.password = 'Enter your password';
    setErrors(er); setMsg('');
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      if (mode === 'login') { await login(f.email.trim(), f.password); nav(next, { replace: true }); }
      else if (mode === 'register') { await register(f.name.trim(), f.email.trim(), f.password); nav(next, { replace: true }); }
      else if (mode === 'forgot') { await api.post('/auth/password/forgot', { email: f.email.trim() }); setState('sent'); }
      else if (mode === 'reset') { await api.post('/auth/password/reset', { token, password: f.password }); setState('ok'); }
    } catch (err) { setMsg(mode === 'login' ? 'Invalid email or password' : errMsg(err)); } finally { setBusy(false); }
  };

  const title = { login: 'Welcome back', register: 'Join FindIt', forgot: 'Reset your password', reset: 'Choose a new password', verify: 'Email confirmation' }[mode];

  const verifyBody = () => {
    // Link flow (?token=...)
    if (token) {
      return <p>{state === 'working' ? 'Confirming…' : state === 'ok' ? '✅ Your email is confirmed.' : 'This link is invalid or has expired.'} <Link to="/">Go home</Link></p>;
    }
    // Code flow needs a signed-in user.
    if (!user) {
      return <p>Please <Link to={`/login?next=${encodeURIComponent('/verify-email')}`}>sign in</Link> to verify your email with a code.</p>;
    }
    if (state === 'ok') return <p>✅ Your email is confirmed. <Link to="/">Go home</Link></p>;
    if (user.emailVerified) return <p>✅ Your email is already verified. <Link to="/">Go home</Link></p>;
    return (
      <form className="col" onSubmit={verifyCode} noValidate>
        <p className="muted">Enter the 6-digit code sent to <strong>{user.email}</strong>. No code yet? Use the button below.</p>
        <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} />
        {codeInfo && <p className="hint" role="status">{codeInfo}</p>}
        {codeMsg && <p className="err" role="alert">{codeMsg}</p>}
        <Button variant="primary" loading={busy}>Verify email</Button>
        <div className="row small">
          <button type="button" className="linklike" onClick={sendCode} disabled={sending || cooldown > 0}>
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : sending ? 'Sending…' : 'Send a new code'}
          </button>
          <span className="spacer" />
          <Link to="/">Go home</Link>
        </div>
      </form>
    );
  };

  return (
    <div className="auth-wrap">
      <Reveal className="auth-card"><Glass pad className="auth-card" style={{ padding: 32 }}>
        <h1 style={{ fontSize: '2rem' }}>{title}</h1>
        {mode === 'verify' ? (
          verifyBody()
        ) : state === 'sent' ? (
          <p className="muted">If an account exists for that email, a reset link is on its way. It works once and expires in 30 minutes.</p>
        ) : state === 'ok' ? (
          <p>✅ Password updated. <Link to="/login">Sign in</Link></p>
        ) : (
          <form className="col" onSubmit={submit} noValidate>
            {mode === 'register' && <Field label="Full name" autoComplete="name" value={f.name} onChange={set('name')} error={errors.name} maxLength={60} />}
            {mode !== 'reset' && <Field label="Email" type="email" autoComplete="email" value={f.email} onChange={set('email')} error={errors.email} maxLength={254} />}
            {mode !== 'forgot' && <Field label={mode === 'reset' ? 'New password' : 'Password'} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} error={errors.password} maxLength={128} />}
            {['register', 'reset'].includes(mode) && <Strength pw={f.password} />}
            {msg && <p className="err" role="alert">{msg}</p>}
            <Button variant="primary" loading={busy}>{{ login: 'Sign in', register: 'Create account', forgot: 'Send reset link', reset: 'Update password' }[mode]}</Button>
            <div className="row small">
              {mode === 'login' && <><Link to="/forgot-password">Forgot password?</Link><span className="spacer" /><Link to={`/register${sp.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}>Create account</Link></>}
              {mode === 'register' && <><span className="muted">Already a member?</span><Link to="/login">Sign in</Link></>}
              {mode === 'forgot' && <Link to="/login">Back to sign in</Link>}
            </div>
          </form>
        )}
      </Glass></Reveal>
    </div>
  );
}