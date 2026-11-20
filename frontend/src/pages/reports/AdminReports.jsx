import { useCallback, useEffect, useState } from 'react';
import { adminList, adminStats, adminUpdate, imageUrl } from '../../api/reports';
import StatusBadge from '../../components/reports/StatusBadge';
import Timeline from '../../components/reports/Timeline';
import { CATEGORIES, STATUS_META, fmtDate } from './reportUtils';
import '../../styles/reports.css';

export default function AdminReports() {
  const [filters, setFilters] = useState({ status: '', category: '', priority: '', q: '' });
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({});
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ status: 'under_review', note: '', internalNote: '', priority: 'medium' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminList({ ...filters, page }).then(setData).catch((e) => setMsg({ type: 'error', text: e.message }));
    adminStats().then(setStats).catch(() => {});
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);

  const open = (r) => {
    setSel(r); setMsg({ type: '', text: '' });
    setForm({ status: r.status === 'submitted' ? 'under_review' : r.status, note: '', internalNote: '', priority: r.priority });
  };

  const save = async () => {
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      const updated = await adminUpdate(sel._id, form);
      setSel(updated);
      setForm((f) => ({ ...f, note: '', internalNote: '' }));
      setMsg({ type: 'ok', text: 'Saved. The user has been notified.' });
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const setF = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.value }); };

  return (
    <main className="rp rp-page rp-admin">
      <h1>Reports</h1>

      <div className="rp-stats">
        {Object.entries(STATUS_META).map(([k, m]) => (
          <button key={k} className={`rp-stat ${filters.status === k ? 'is-on' : ''}`}
            onClick={() => { setPage(1); setFilters({ ...filters, status: filters.status === k ? '' : k }); }}>
            <strong>{stats[k] ?? 0}</strong><span>{m.label}</span>
          </button>
        ))}
      </div>

      <div className="rp-filters">
        <input placeholder="Search ticket, e.g. FR-1042" value={filters.q} onChange={setF('q')} />
        <select value={filters.category} onChange={setF('category')}>
          <option value="">All categories</option>
          {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
        </select>
        <select value={filters.priority} onChange={setF('priority')}>
          <option value="">Any priority</option>
          <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
      </div>

      <div className="rp-admin__grid">
        <div className="rp-tablewrap">
          <table className="rp-table">
            <thead><tr><th>Ticket</th><th>Category</th><th>Priority</th><th>Status</th><th>Sent</th></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r._id} className={sel?._id === r._id ? 'is-on' : ''} onClick={() => open(r)} tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && open(r)}>
                  <td>{r.ticketId}</td>
                  <td>{CATEGORIES[r.category]?.label}<br /><small className="rp-muted">{r.subReason}</small></td>
                  <td><span className={`rp-prio rp-prio--${r.priority}`}>{r.priority}</span></td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan="5" className="rp-muted">No reports match these filters.</td></tr>}
            </tbody>
          </table>
          {data.pages > 1 && (
            <div className="rp-pager">
              <button className="rp-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {data.pages}</span>
              <button className="rp-btn" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </div>

        <aside className="rp-panel" aria-live="polite">
          {!sel ? <p className="rp-muted">Select a report to review it.</p> : (
            <>
              <div className="rp-card__top"><span className="rp-ticket-sm">{sel.ticketId}</span><StatusBadge status={sel.status} /></div>
              <h2>{CATEGORIES[sel.category]?.label}</h2>
              <p className="rp-muted">{sel.subReason} · reporter {sel.reporter}</p>
              {sel.targetLabel && <p>About: {sel.targetLabel} <small className="rp-muted">({sel.targetType} {sel.targetId})</small></p>}
              <p className="rp-desc">{sel.description}</p>
              {sel.images?.length > 0 && (
                <div className="rp-thumbs">
                  {sel.images.map((im, i) => (
                    <a key={i} className="rp-thumb" href={imageUrl(im.url)} target="_blank" rel="noreferrer">
                      <img src={imageUrl(im.url)} alt={`Evidence ${i + 1}`} />
                    </a>
                  ))}
                </div>
              )}

              <div className="rp-form">
                <label className="rp-field"><span>Status</span>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                  </select>
                </label>
                <label className="rp-field"><span>Priority</span>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </label>
                <label className="rp-field"><span>Feedback for the user</span>
                  <textarea rows={3} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="Required when resolving, closing or asking for more information." />
                </label>
                <label className="rp-field"><span>Internal note (admins only)</span>
                  <textarea rows={2} maxLength={1000} value={form.internalNote} onChange={(e) => setForm({ ...form, internalNote: e.target.value })} />
                </label>
                {msg.text && <p className={msg.type === 'ok' ? 'rp-ok' : 'rp-error'} role="status">{msg.text}</p>}
                <button className="rp-btn rp-btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save and notify user'}</button>
              </div>

              <h3>History</h3>
              <Timeline items={sel.timeline} admin />
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
