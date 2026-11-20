import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyReports } from '../../api/reports';
import StatusBadge from '../../components/reports/StatusBadge';
import { CATEGORIES, fmtDate } from './reportUtils';
import '../../styles/reports.css';

const TABS = [
  ['all', 'All', () => true],
  ['open', 'In progress', (r) => ['submitted', 'under_review', 'needs_info'].includes(r.status)],
  ['closed', 'Closed', (r) => ['resolved', 'rejected'].includes(r.status)]
];

export default function MyReports() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');

  useEffect(() => { getMyReports().then(setList).catch((e) => setError(e.message)); }, []);

  const filter = TABS.find((t) => t[0] === tab)[2];
  const shown = (list || []).filter(filter);

  return (
    <main className="rp rp-page">
      <h1>My reports</h1>
      <div className="rp-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {error && <p className="rp-error">{error}</p>}
      {!list && !error && <p className="rp-muted">Loading…</p>}
      {list && shown.length === 0 && (
        <div className="rp-empty">
          <p>{tab === 'all' ? 'You have not sent any reports yet.' : 'No reports here.'}</p>
          <p className="rp-muted">Use the Report option on any post, claim or profile to flag a problem.</p>
        </div>
      )}

      <ul className="rp-list">
        {shown.map((r) => {
          const last = r.timeline[r.timeline.length - 1];
          return (
            <li key={r._id}>
              <Link to={`/reports/${r._id}`} className="rp-card">
                <div className="rp-card__top">
                  <span className="rp-ticket-sm">{r.ticketId}</span>
                  <StatusBadge status={r.status} />
                </div>
                <h3>{CATEGORIES[r.category]?.label} · {r.subReason}</h3>
                {r.targetLabel && <p className="rp-muted">About: {r.targetLabel}</p>}
                {last?.note && r.status !== 'submitted' && <p className="rp-card__note">“{last.note}”</p>}
                <time className="rp-muted">{fmtDate(r.updatedAt)}</time>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
