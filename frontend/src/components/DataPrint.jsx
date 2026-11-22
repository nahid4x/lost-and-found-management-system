import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { fmtDate } from '../lib/util.js';
import { notifText } from '../lib/notifText.js';

const dash = (v) => (v === undefined || v === null || v === '' ? '—' : String(v));
const day = (d) => (d ? fmtDate(d) : '—');

function Table({ head, rows, empty }) {
  if (!rows.length) return <p className="dp-none">{empty}</p>;
  return (
    <table>
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

/** The document itself. Used for the on-screen preview and for printing. */
export function DataDocument({ data }) {
  const { t, i18n } = useTranslation();
  const bn = i18n.language?.startsWith('bn');
  const has = (id) => data.sections.includes(id);
  const none = t('settings.data.print.none');
  const p = data.profile;
  const { from, to } = data.range || {};
  const period = from || to
    ? `${from ? day(from) : '…'} – ${to ? day(to) : '…'}`
    : t('settings.data.print.allTime', 'All time');

  // Backend values (open, approved, lost, sports...) are translated for display only.
  const st = (v) => (v ? t(`status.${v}`, { defaultValue: v }) : '—');
  const cat = (v) => (v ? t(`cat.${v}`, { defaultValue: v }) : '—');
  const nt = (n) => notifText(n, i18n.language).title;
  const when = (d) => (d ? new Date(d).toLocaleString(bn ? 'bn-BD' : undefined) : '—');
  const device = (d) => {
    if (!d) return '—';
    if (!bn) return String(d);
    return String(d)
      .replace(/^(.+) on (.+)$/, '$2-এ $1')
      .replace('Unknown device', 'অজানা ডিভাইস')
      .replace('Browser', 'ব্রাউজার');
  };

  return (
    <div className="dp-doc">
      <header className="dp-head">
        <img src="/logo.png" alt="" width="44" height="44" />
        <div>
          <h1>FindIt — {t('settings.data.print.title')}</h1>
          <p className="dp-meta">
            {t('settings.data.print.exportedOn', { date: day(data.exportedAt) })}
            {' · '}
            {t('settings.data.print.period', 'Period')}: {period}
          </p>
        </div>
      </header>

      {has('account') && (
        <>
          <h2>{t('settings.data.print.profile')}</h2>
          {p ? (
            <table className="dp-kv"><tbody>
              <tr><th>{t('settings.data.print.name')}</th><td>{dash(p.name)}</td></tr>
              <tr><th>{t('settings.data.print.email')}</th><td>{dash(p.email)}</td></tr>
              <tr><th>{t('settings.data.print.role')}</th><td>{p.role ? st(p.role) : '—'}</td></tr>
              <tr><th>{t('settings.data.print.verified')}</th><td>{p.emailVerified ? t('settings.data.print.yes') : t('settings.data.print.no')}</td></tr>
            </tbody></table>
          ) : <p className="dp-none">{none}</p>}
        </>
      )}

      {has('reports') && (
        <>
          <h2>{t('settings.data.print.reports')} ({data.reports.length})</h2>
          <Table empty={none}
            head={[t('settings.data.print.item'), t('settings.data.print.type'), t('settings.data.print.category'), t('settings.data.print.status'), t('settings.data.print.date'), t('settings.data.print.area')]}
            rows={data.reports.map((i) => [dash(i.title), st(i.type), cat(i.category), st(i.status), day(i.date), dash(i.area?.label)])} />
        </>
      )}

      {has('claims') && (
        <>
          <h2>{t('settings.data.print.claimsMade')} ({data.claimsMade.length})</h2>
          <Table empty={none}
            head={[t('settings.data.print.item'), t('settings.data.print.status'), t('settings.data.print.date')]}
            rows={data.claimsMade.map((c) => [dash(c.itemTitle ?? c.item?.title), st(c.status), day(c.createdAt)])} />

          <h2>{t('settings.data.print.claimsOnMine')} ({data.claimsOnMyItems.length})</h2>
          <Table empty={none}
            head={[t('settings.data.print.item'), t('settings.data.print.status'), t('settings.data.print.date')]}
            rows={data.claimsOnMyItems.map((c) => [dash(c.itemTitle), st(c.status), day(c.createdAt)])} />
        </>
      )}

      {has('security') && (
        <>
          <h2>{t('settings.data.print.security', 'Security activity')} ({data.sessions.length})</h2>
          <Table empty={none}
            head={[t('settings.data.print.device', 'Device'), t('settings.data.print.ip', 'IP address'), t('settings.data.print.signedIn', 'Signed in'), t('settings.data.print.lastActive', 'Last active')]}
            rows={data.sessions.map((s) => [
              s.current ? `${device(s.device)} (${t('settings.data.print.thisDevice', 'this device')})` : device(s.device),
              dash(s.ip), when(s.loginAt), when(s.lastActive),
            ])} />
        </>
      )}

      {has('notifications') && (
        <>
          <h2>{t('settings.data.print.notifications')} ({data.notifications.length})</h2>
          <Table empty={none}
            head={[t('settings.data.print.what'), t('settings.data.print.date')]}
            rows={data.notifications.map((n) => [dash(nt(n)), day(n.createdAt)])} />
        </>
      )}

      <p className="dp-foot">{t('settings.data.excludes')}</p>
    </div>
  );
}

/**
 * Renders the document as a printable page, opens the browser's print window
 * (where "Save as PDF" is a printer choice) and calls onDone when it closes.
 * The browser's own print engine is used on purpose: it shapes Bangla text correctly.
 */
export default function DataPrint({ data, onDone }) {
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let cancelled = false;
    let r1;
    let r2;
    const finish = () => done.current?.();
    window.addEventListener('afterprint', finish, { once: true });
    // Wait for the logo, so it is in the PDF.
    const logo = new Image();
    logo.src = '/logo.png';
    const ready = logo.decode ? logo.decode().catch(() => {}) : Promise.resolve();
    ready.then(() => {
      if (cancelled) return;
      r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => window.print()); });
    });
    return () => { cancelled = true; cancelAnimationFrame(r1); cancelAnimationFrame(r2); window.removeEventListener('afterprint', finish); };
  }, []);

  return createPortal(<div id="data-print"><DataDocument data={data} /></div>, document.body);
}