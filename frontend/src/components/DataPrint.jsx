import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { fmtDate } from '../lib/util.js';

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

/**
 * Renders the person's data as a printable page, opens the browser's print window
 * (where "Save as PDF" is a printer choice) and calls onDone when it closes.
 * The browser's own print engine is used on purpose: it shapes Bangla text correctly.
 */
export default function DataPrint({ data, onDone }) {
  const { t } = useTranslation();
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const finish = () => done.current?.();
    window.addEventListener('afterprint', finish, { once: true });
    let r2;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => window.print()); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); window.removeEventListener('afterprint', finish); };
  }, []);

  const p = data.profile;
  const none = t('settings.data.print.none');
  return createPortal(
    <div id="data-print">
      <h1>FindIt — {t('settings.data.print.title')}</h1>
      <p className="dp-meta">{t('settings.data.print.exportedOn', { date: day(data.exportedAt) })}</p>

      <h2>{t('settings.data.print.profile')}</h2>
      {p ? (
        <table className="dp-kv"><tbody>
          <tr><th>{t('settings.data.print.name')}</th><td>{dash(p.name)}</td></tr>
          <tr><th>{t('settings.data.print.email')}</th><td>{dash(p.email)}</td></tr>
          <tr><th>{t('settings.data.print.role')}</th><td>{dash(p.role)}</td></tr>
          <tr><th>{t('settings.data.print.verified')}</th><td>{p.emailVerified ? t('settings.data.print.yes') : t('settings.data.print.no')}</td></tr>
        </tbody></table>
      ) : <p className="dp-none">{none}</p>}

      <h2>{t('settings.data.print.reports')} ({data.reports.length})</h2>
      <Table empty={none}
        head={[t('settings.data.print.item'), t('settings.data.print.type'), t('settings.data.print.category'), t('settings.data.print.status'), t('settings.data.print.date'), t('settings.data.print.area')]}
        rows={data.reports.map((i) => [dash(i.title), dash(i.type), dash(i.category), dash(i.status), day(i.date), dash(i.area?.label)])} />

      <h2>{t('settings.data.print.claimsMade')} ({data.claimsMade.length})</h2>
      <Table empty={none}
        head={[t('settings.data.print.item'), t('settings.data.print.status'), t('settings.data.print.date')]}
        rows={data.claimsMade.map((c) => [dash(c.itemTitle ?? c.item?.title), dash(c.status), day(c.createdAt)])} />

      <h2>{t('settings.data.print.claimsOnMine')} ({data.claimsOnMyItems.length})</h2>
      <Table empty={none}
        head={[t('settings.data.print.item'), t('settings.data.print.status'), t('settings.data.print.date')]}
        rows={data.claimsOnMyItems.map((c) => [dash(c.itemTitle), dash(c.status), day(c.createdAt)])} />

      <h2>{t('settings.data.print.notifications')} ({data.notifications.length})</h2>
      <Table empty={none}
        head={[t('settings.data.print.what'), t('settings.data.print.date')]}
        rows={data.notifications.map((n) => [dash(n.title), day(n.createdAt)])} />

      <p className="dp-foot">{t('settings.data.excludes')}</p>
    </div>,
    document.body,
  );
}
