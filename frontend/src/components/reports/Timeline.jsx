import { STATUS_META, fmtDate } from '../../pages/reports/reportUtils';

export default function Timeline({ items = [], admin = false }) {
  return (
    <ol className="rp-timeline">
      {[...items].reverse().map((t, i) => (
        <li key={i} className={`rp-timeline__item rp-tone--${STATUS_META[t.status]?.tone || 'neutral'}`}>
          <div className="rp-timeline__head">
            <strong>{STATUS_META[t.status]?.label || t.status}</strong>
            <time>{fmtDate(t.at)}</time>
          </div>
          {t.note && <p className="rp-timeline__note">{t.note}</p>}
          {admin && t.internalNote && <p className="rp-timeline__internal">Internal: {t.internalNote}</p>}
        </li>
      ))}
    </ol>
  );
}
