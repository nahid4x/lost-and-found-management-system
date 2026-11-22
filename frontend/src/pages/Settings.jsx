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
import DataPrint, { DataDocument } from '../components/DataPrint.jsx';
import { EmailSection, PasswordSection, DeleteSection } from '../components/AccountSections.jsx';
import {
  Smartphone, Laptop, User, FileText, Handshake, ShieldCheck, Bell, Archive, Eye, Download, Check,
} from 'lucide-react';

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
  const { t, i18n } = useTranslation();
  // The device name comes from the server in English ("Chrome on Windows"); shown in Bangla when the language is Bangla.
  const deviceName = (d) => (i18n.language?.startsWith('bn')
    ? String(d).replace(/^(.+) on (.+)$/, '$2-এ $1').replace('Unknown device', 'অজানা ডিভাইস').replace('Browser', 'ব্রাউজার')
    : d);
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
              <span className="dev-ico" aria-hidden>{/Android|iOS/.test(s.device) ? <Smartphone size={20} strokeWidth={1.75} /> : <Laptop size={20} strokeWidth={1.75} />}</span>
              <div className="dev-main">
                <strong>{deviceName(s.device)}{s.current && <Chip kind="verified">{t('settings.devices.thisDevice')}</Chip>}</strong>
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

const EXPORT_SECTIONS = [
  { id: 'account', icon: User, title: 'Account summary', desc: 'Your profile' },
  { id: 'reports', icon: FileText, title: 'Lost & found reports', desc: 'Your reports' },
  { id: 'claims', icon: Handshake, title: 'Claim history', desc: 'Your claims and a short summary' },
  { id: 'security', icon: ShieldCheck, title: 'Security activity', desc: 'Your signed-in devices' },
  { id: 'notifications', icon: Bell, title: 'Notifications', desc: 'Your latest notifications' },
];

/** Pick what to include and a date range, preview it, then save it as a PDF. All in the browser. */
function MyData() {
  const { t } = useTranslation();
  const toast = useToast();
  const [sel, setSel] = useState(() => new Set(['account', 'reports', 'claims', 'notifications']));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(null); // 'preview' | 'print' | null
  const [data, setData] = useState(null);
  const [preview, setPreview] = useState(false);
  const [printing, setPrinting] = useState(false);

  const allOn = EXPORT_SECTIONS.every((s) => sel.has(s.id));
  const badRange = Boolean(from && to && from > to);
  const toggle = (id) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel(allOn ? new Set() : new Set(EXPORT_SECTIONS.map((s) => s.id)));

  const run = async (mode) => {
    if (!sel.size || badRange) return;
    setBusy(mode);
    try {
      const d = await collectMyData(api, { sections: [...sel], from, to });
      setData(d);
      if (d.missing.length) toast.info(t('settings.data.partial', { parts: d.missing.join(', ') }));
      if (mode === 'preview') setPreview(true); else setPrinting(true);
    } catch { toast.error(t('settings.data.failed')); } finally { setBusy(null); }
  };

  const savePreview = () => { setPreview(false); setPrinting(true); };

  return (
    <section className="glass pad col" aria-labelledby="set-data">
      <h2 id="set-data" style={{ margin: 0 }}>{t('settings.data.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>{t('settings.data.hint')}</p>
      <p className="hint" style={{ margin: 0 }}>{t('settings.data.excludes')}</p>

      <div className="exp-grid" role="group" aria-label={t('settings.data.choose', 'Choose what to include')}>
        {EXPORT_SECTIONS.map(({ id, icon: Icon, title, desc }) => (
          <button key={id} type="button" className="exp-opt" aria-pressed={sel.has(id)} onClick={() => toggle(id)}>
            <span className="exp-ico" aria-hidden><Icon size={18} /></span>
            <span className="exp-txt">
              <strong>{t(`settings.data.opt.${id}.title`, title)}</strong>
              <small>{t(`settings.data.opt.${id}.desc`, desc)}</small>
            </span>
            <Check className="exp-check" size={18} aria-hidden />
          </button>
        ))}
        <button type="button" className="exp-opt" aria-pressed={allOn} onClick={toggleAll}>
          <span className="exp-ico" aria-hidden><Archive size={18} /></span>
          <span className="exp-txt">
            <strong>{t('settings.data.opt.all.title', 'Everything')}</strong>
            <small>{t('settings.data.opt.all.desc', 'Select all sections')}</small>
          </span>
          <Check className="exp-check" size={18} aria-hidden />
        </button>
      </div>

      <div className="exp-dates">
        <label>{t('settings.data.from', 'From')}<input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>{t('settings.data.to', 'To')}<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <p className="hint" style={{ margin: 0 }}>{t('settings.data.rangeHint', 'Leave the dates empty to include everything.')}</p>
      {badRange && <p className="err" role="alert" style={{ margin: 0 }}>{t('settings.data.badRange', 'The start date must be before the end date.')}</p>}

      <div className="exp-actions">
        <Button loading={busy === 'preview'} disabled={!sel.size || badRange || busy !== null} onClick={() => run('preview')}>
          <Eye size={16} aria-hidden /> {t('settings.data.preview', 'Preview')}
        </Button>
        <Button variant="primary" loading={busy === 'print'} disabled={!sel.size || badRange || busy !== null} onClick={() => run('print')}>
          <Download size={16} aria-hidden /> {busy === 'print' ? t('settings.data.preparing') : t('settings.data.pdf')}
        </Button>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {sel.size ? t('settings.data.count', { count: sel.size, defaultValue: '{{count}} section(s) selected' }) : t('settings.data.none', 'Select at least one section.')}
        {' · '}{t('settings.data.pdfHint')}
      </p>

      <Modal open={preview} onClose={() => setPreview(false)} title={t('settings.data.previewTitle', 'Preview')}>
        {data && <div className="dp-preview"><DataDocument data={data} /></div>}
        <div className="row">
          <span className="spacer" />
          <Button onClick={() => setPreview(false)}>{t('settings.data.close', 'Close')}</Button>
          <Button variant="primary" onClick={savePreview}><Download size={16} aria-hidden /> {t('settings.data.pdf')}</Button>
        </div>
      </Modal>

      {printing && data && <DataPrint data={data} onDone={() => setPrinting(false)} />}
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