import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getReport, imageUrl } from '../../api/reports';
import StatusBadge from '../../components/reports/StatusBadge';
import Timeline from '../../components/reports/Timeline';
import { CATEGORIES, fmtDate } from './reportUtils';
import '../../styles/reports.css';

export default function ReportDetail() {
  const { id } = useParams();
  const [r, setR] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { getReport(id).then(setR).catch((e) => setError(e.message)); }, [id]);

  if (error) return <main className="rp rp-page"><p className="rp-error">{error}</p><Link to="/reports">Back to my reports</Link></main>;
  if (!r) return <main className="rp rp-page"><p className="rp-muted">Loading…</p></main>;

  const feedback = [...r.timeline].reverse().find((t) => t.note && t.status !== 'submitted');

  return (
    <main className="rp rp-page rp-detail">
      <Link to="/reports" className="rp-back">‹ My reports</Link>
      <header className="rp-detail__head">
        <div>
          <span className="rp-ticket-sm">{r.ticketId}</span>
          <h1>{CATEGORIES[r.category]?.label}</h1>
          <p className="rp-muted">{r.subReason} · sent {fmtDate(r.createdAt)}</p>
        </div>
        <StatusBadge status={r.status} />
      </header>

      {feedback && (
        <section className="rp-feedback">
          <h2>Feedback from the team</h2>
          <p>{feedback.note}</p>
          <time className="rp-muted">{fmtDate(feedback.at)}</time>
        </section>
      )}

      <section>
        <h2>Your report</h2>
        {r.targetLabel && <p className="rp-muted">About: {r.targetLabel}</p>}
        <p className="rp-desc">{r.description}</p>
        {r.images?.length > 0 && (
          <div className="rp-thumbs">
            {r.images.map((im, i) => (
              <a key={i} href={imageUrl(im.url)} target="_blank" rel="noreferrer" className="rp-thumb">
                <img src={imageUrl(im.url)} alt={`Attachment ${i + 1}`} />
              </a>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Progress</h2>
        <Timeline items={r.timeline} />
      </section>
    </main>
  );
}
