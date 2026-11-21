import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Modal, Skeleton } from '../components/ui.jsx';
import { useAuth } from '../context/Auth.jsx';
import { useToast } from '../context/Toast.jsx';
import { api } from '../lib/api.js';
import { errMsg, timeAgo } from '../lib/util.js';
import { SIZES, loadA11y, saveA11y, osPrefersReducedMotion } from '../lib/a11y.js';
import { collectMyData } from '../lib/exportData.js';
import DataPrint from '../components/DataPrint.jsx';
import { EmailSection, PasswordSection, DeleteSection } from '../components/AccountSections.jsx';

function Language() {
  const { t, i18n } = useTranslation();
  return (
    <section className="glass pad col">
      <label htmlFor="lang"><h2 style={{ margin: 0 }}>{t('settings.language')}</h2></label>
      <select id="lang" className="select" value={i18n.resolvedLanguage} onChange={(e) => i18n.changeLanguage(e.target.value)}>
        <option value="en">English</option>
        <option value="bn">বাংলা</option>
      </select>
      <p className="muted small" style={{ margin: 0 }}>{t('settings.languageHint')}</p>
    </section>
  );
}

/** Text size and reduced motion. Applied at once and remembered in this browser. */
function Accessibility() {
  const { t } = useTranslation();
  const [a, setA] = useState(loadA11y);
  const change = (patch) => { const n = { ...a, ...patch }; setA(n); saveA11y(n); };
  const reduced = a.motion ? a.motion === 'reduced' : osPrefersReducedMotion();
  const glyph = { sm: '0.9rem', md: '1.05rem', lg: '1.25rem', xl: '1.5rem' };
  return (
    <section className="glass pad col" aria-labelledby="set-a11y">
      <h2 id="set-a11y" style={{ margin: 0 }}>{t('settings.a11y.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>{t('settings.a11y.hint')}</p>
      <strong className="small muted" id="set-size">{t('settings.a11y.textSize')}</strong>
      <div className="size-opts" role="radiogroup" aria-labelledby="set-size">
        {SIZES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={a.size === s} className={`size-opt ${a.size === s ? 'on' : ''}`} onClick={() => change({ size: s })}>
            <span className="a" style={{ fontSize: glyph[s] }} aria-hidden>A</span>{t(`settings.a11y.size_${s}`)}
          </button>
        ))}
      </div>
      <p className="size-preview muted">{t('settings.a11y.preview')}</p>
      <label className="check"><input type="checkbox" checked={reduced} onChange={(e) => change({ motion: e.target.checked ? 'reduced' : 'full' })} />{t('settings.a11y.motion')}</label>
      <p className="hint" style={{ margin: 0 }}>{t('settings.a11y.motionHint')}</p>
      <div className="row"><Button size="sm" onClick={() => change({ size: 'md', motion: null })}>{t('settings.a11y.reset')}</Button></div>
    </section>
  );
}

/** Every device that is signed in to this account, with a button to sign one of them out. */
function Devices() {
  const { t } = useTranslation();
  const toast = useToast();
  const { logout } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(() => api.get('/auth/sessions').then((d) => { setRows(d.sessions); setFailed(false); }).catch(() => { setRows([]); setFailed(true); }), []);
  useEffect(() => { load(); }, [load]);

  const revoke = async (s) => {
    setBusy(s.id);
    try { await api.del(`/auth/sessions/${s.id}`); toast.success(t('settings.devices.signedOutToast')); await load(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  const all = async () => {
    setBusy('all');
    try { await api.post('/auth/logout-all'); await logout(); nav('/login', { replace: true }); } catch (e) { toast.error(errMsg(e)); setBusy(null); setConfirm(false); }
  };

  return (
    <section className="glass pad col" aria-labelledby="set-dev">
      <h2 id="set-dev" style={{ margin: 0 }}>{t('settings.devices.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>{t('settings.devices.hint')}</p>
      {!rows ? <Skeleton h={90} /> : failed ? <p className="err" role="alert">{t('settings.devices.loadFailed')}</p> : !rows.length ? <p className="muted">{t('settings.devices.none')}</p> : (
        <div role="list">
          {rows.map((s) => (
            <div className="dev-row" role="listitem" key={s.id}>
              <span className="dev-ico" aria-hidden>{/Android|iOS/.test(s.device) ? '📱' : '💻'}</span>
              <div className="dev-main">
                <strong>{s.device}{s.current && <Chip kind="verified">{t('settings.devices.thisDevice')}</Chip>}</strong>
                <div className="faint small">{[s.ip, t('settings.devices.signedIn', { when: timeAgo(s.loginAt) }), t('settings.devices.lastActive', { when: timeAgo(s.lastActive) })].filter(Boolean).join(' · ')}</div>
              </div>
              {!s.current && <Button size="sm" loading={busy === s.id} disabled={busy !== null} onClick={() => revoke(s)}>{t('settings.devices.signOut')}</Button>}
            </div>
          ))}
        </div>
      )}
      <p className="hint" style={{ margin: 0 }}>{t('settings.devices.note')}</p>
      <div className="row"><Button variant="danger" size="sm" onClick={() => setConfirm(true)}>{t('settings.devices.signOutAll')}</Button></div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title={t('settings.devices.allTitle')}>
        <p className="muted">{t('settings.devices.allText')}</p>
        <div className="row"><span className="spacer" /><Button onClick={() => setConfirm(false)}>{t('settings.devices.cancel')}</Button><Button variant="danger" loading={busy === 'all'} onClick={all}>{t('settings.devices.allConfirm')}</Button></div>
      </Modal>
    </section>
  );
}

/** Builds a JSON file from the person's own data, in the browser, and saves it. */
function MyData() {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [printData, setPrintData] = useState(null);
  const run = async () => {
    setBusy(true);
    try {
      const data = await collectMyData(api);
      setPrintData(data);
      if (data.missing.length) toast.info(t('settings.data.partial', { parts: data.missing.join(', ') }));
    } catch { toast.error(t('settings.data.failed')); } finally { setBusy(false); }
  };
  return (
    <section className="glass pad col" aria-labelledby="set-data">
      <h2 id="set-data" style={{ margin: 0 }}>{t('settings.data.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>{t('settings.data.hint')}</p>
      <p className="small" style={{ margin: 0 }}>{t('settings.data.includes')}</p>
      <p className="hint" style={{ margin: 0 }}>{t('settings.data.excludes')}</p>
      <div className="row"><Button variant="primary" loading={busy} onClick={run}>{busy ? t('settings.data.preparing') : t('settings.data.pdf')}</Button></div>
      <p className="hint" style={{ margin: 0 }}>{t('settings.data.pdfHint')}</p>
      {printData && <DataPrint data={printData} onDone={() => setPrintData(null)} />}
    </section>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  return (
    <div className="container settings-page">
      <h1>{t('settings.title')}</h1>
      <div className="set-stack">
        <Language />
        <Accessibility />
        <EmailSection />
        <PasswordSection />
        <Devices />
        <MyData />
        <DeleteSection />
      </div>
    </div>
  );
}
