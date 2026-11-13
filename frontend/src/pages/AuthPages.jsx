import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { Glass, Field, Button, Reveal } from '../components/ui.jsx';
import { PasswordField } from '../components/PasswordField.jsx';
import { useAuth } from '../context/Auth.jsx';
import { api, safeNext } from '../lib/api.js';
import { errMsg, strength, validatePassword } from '../lib/util.js';

// Lowercase only, must contain @ and a valid domain ending (.com, .net, .edu.bd, ...).
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const OTP_COOLDOWN_S = 60; // matches the backend resend cooldown

// "nahid hasan" -> "Nahid Hasan" (first letter of every word upper case, rest left as typed)
const titleCase = (s) =>
  s.trimStart().replace(/\s{2,}/g, ' ').replace(/(^|\s)(\S)/g, (_, sp, ch) => sp + ch.toUpperCase());

// Email is always lower case and never contains spaces.
const lowerEmail = (s) => s.toLowerCase().replace(/\s/g, '');

const STRENGTH_KEYS = ['tooWeak', 'weak', 'fair', 'good', 'strong'];

function Strength({ pw }) {
  const { t } = useTranslation();
  const s = strength(pw);
  return (
    <div aria-live="polite">
      <div className="bar" role="presentation">
        <i style={{ width: `${(s / 4) * 100}%`, background: ['#fb7185', '#fb7185', '#fbbf24', '#4ade80', '#2dd4bf'][s] }} />
      </div>
      <span className="hint">{t('auth.strength', { label: t(`auth.str.${STRENGTH_KEYS[s]}`) })}</span>
    </div>
  );
}

export default function AuthPages({ mode }) {
  const { t } = useTranslation();
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
  const set = (k, fn = (v) => v) => (e) => setF((x) => ({ ...x, [k]: fn(e.target.value) }));

  // Old link flow: only when a token is actually present (no more empty-token calls).
  useEffect(() => {
    if (mode !== 'verify' || !token) return;
    api.post('/auth/email/verify', { token }).then(() => setState('ok')).catch(() => setState('bad'));
  }, [mode, token]);

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (user && ['login', 'register'].includes(mode)) return <Navigate to={next} replace />;

  const sendCode = async () => {
    setCodeMsg(''); setCodeInfo(''); setSending(true);
    try {
      await api.post('/auth/email/otp/send', {});
      setCooldown(OTP_COOLDOWN_S);
      setCodeInfo(t('auth.codeSent', { email: user?.email ?? t('auth.yourEmail') }));
    } catch (err) { setCodeMsg(errMsg(err)); } finally { setSending(false); }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setCodeMsg(''); setCodeInfo('');
    if (!/^\d{6}$/.test(code)) { setCodeMsg(t('auth.err.code6')); return; }
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
    const email = f.email.trim().toLowerCase();
    const name = titleCase(f.name.trim()).trim();
    if (mode !== 'reset' && mode !== 'verify' && !EMAIL.test(email)) er.email = t('auth.err.email');
    if (mode === 'register' && name.length < 2) er.name = t('auth.err.name');
    if (['register', 'reset'].includes(mode)) {
      const p = validatePassword(f.password);
      if (p.length) er.password = t('auth.err.pwNeeds', { list: p.join(', ') });
    }
    if (mode === 'login' && !f.password) er.password = t('auth.err.pwEmpty');
    setErrors(er); setMsg('');
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      if (mode === 'login') { await login(email, f.password); nav(next, { replace: true }); }
      else if (mode === 'register') { await register(name, email, f.password); nav(next, { replace: true }); }
      else if (mode === 'forgot') { await api.post('/auth/password/forgot', { email }); setState('sent'); }
      else if (mode === 'reset') { await api.post('/auth/password/reset', { token, password: f.password }); setState('ok'); }
    } catch (err) { setMsg(mode === 'login' ? t('auth.err.invalid') : errMsg(err)); } finally { setBusy(false); }
  };

  const title = t(`auth.title.${mode}`);

  const verifyBody = () => {
    // Link flow (?token=...)
    if (token) {
      return (
        <p>
          {state === 'working' ? t('auth.confirming') : state === 'ok' ? t('auth.confirmed') : t('auth.linkBad')}{' '}
          <Link to="/">{t('auth.goHome')}</Link>
        </p>
      );
    }
    // Code flow needs a signed-in user.
    if (!user) {
      return (
        <p>
          <Trans
            i18nKey="auth.pleaseSignIn"
            components={{ a: <Link to={`/login?next=${encodeURIComponent('/verify-email')}`} /> }}
          />
        </p>
      );
    }
    if (state === 'ok') return <p>{t('auth.confirmed')} <Link to="/">{t('auth.goHome')}</Link></p>;
    if (user.emailVerified) return <p>{t('auth.alreadyVerified')} <Link to="/">{t('auth.goHome')}</Link></p>;
    return (
      <form className="col" onSubmit={verifyCode} noValidate>
        <p className="muted">
          <Trans i18nKey="auth.enterCode" values={{ email: user.email }} components={{ b: <strong /> }} />
        </p>
        <Field
          label={t('auth.code6Label')}
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          maxLength={6}
        />
        {codeInfo && <p className="hint" role="status">{codeInfo}</p>}
        {codeMsg && <p className="err" role="alert">{codeMsg}</p>}
        <Button variant="primary" loading={busy}>{t('auth.verifyBtn')}</Button>
        <div className="row small">
          <button type="button" className="linklike" onClick={sendCode} disabled={sending || cooldown > 0}>
            {cooldown > 0 ? t('auth.sendNewIn', { s: cooldown }) : sending ? t('auth.sending') : t('auth.sendNew')}
          </button>
          <span className="spacer" />
          <Link to="/">{t('auth.goHome')}</Link>
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
          <p className="muted">{t('auth.sentReset')}</p>
        ) : state === 'ok' ? (
          <p>{t('auth.pwUpdated')} <Link to="/login">{t('auth.signIn')}</Link></p>
        ) : (
          <form className="col" onSubmit={submit} noValidate>
            {mode === 'register' && (
              <Field label={t('auth.fullName')} name="name" autoComplete="name" autoCapitalize="words"
                value={f.name} onChange={set('name', titleCase)} error={errors.name} maxLength={60} />
            )}
            {mode !== 'reset' && (
              <Field label={t('auth.email')} type="email" name="email"
                autoComplete={mode === 'forgot' ? 'email' : 'username'} autoCapitalize="none" spellCheck={false}
                value={f.email} onChange={set('email', lowerEmail)} error={errors.email} maxLength={254} />
            )}
            {mode !== 'forgot' && (
              <PasswordField label={mode === 'reset' ? t('auth.newPassword') : t('auth.password')} name="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={f.password} onChange={set('password')} error={errors.password} maxLength={128} />
            )}
            {['register', 'reset'].includes(mode) && <Strength pw={f.password} />}
            {msg && <p className="err" role="alert">{msg}</p>}
            <Button variant="primary" loading={busy}>{t(`auth.btn.${mode}`)}</Button>
            <div className="row small">
              {mode === 'login' && (
                <>
                  <Link to="/forgot-password">{t('auth.forgotLink')}</Link>
                  <span className="spacer" />
                  <Link to={`/register${sp.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}>{t('auth.createAccount')}</Link>
                </>
              )}
              {mode === 'register' && (
                <>
                  <span className="muted">{t('auth.alreadyMember')}</span>
                  <Link to="/login">{t('auth.signIn')}</Link>
                </>
              )}
              {mode === 'forgot' && <Link to="/login">{t('auth.backToSignIn')}</Link>}
            </div>
          </form>
        )}
      </Glass></Reveal>
    </div>
  );
}