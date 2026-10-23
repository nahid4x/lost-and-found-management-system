import { useCallback, useEffect, useState } from 'react';
import { Glass, Tabs, Button, Chip, Modal, Skeleton, BarChart, Field, Empty, Reveal } from '../components/ui.jsx';
import { api, qs } from '../lib/api.js';
import { errMsg, fmtDate, timeAgo } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

function useList(path, params) {
  const [state, setState] = useState({ rows: null, total: 0 });
  const key = JSON.stringify(params);
  const load = useCallback(() => api.get(`${path}${qs(params)}`).then((d) => setState({ rows: d.items ?? d.claims ?? d.entries, total: d.total })).catch(() => setState({ rows: [], total: 0 })), [path, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setState((s) => ({ ...s, rows: null })); load(); }, [load]);
  return [state, load];
}

function Pager({ page, setPage, total, limit = 20 }) {
  return <div className="row" style={{ marginTop: 12 }}><Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</Button><span className="muted small">Page {page} of {Math.max(1, Math.ceil(total / limit))} · {total} total</span><Button size="sm" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>Next →</Button></div>;
}

function Overview() {
  const [s, setS] = useState(null);
  useEffect(() => { Promise.all([api.get('/auth/admin/stats'), api.get('/items/admin/stats'), api.get('/claims/admin/stats')]).then(([u, i, c]) => setS({ u, i, c })).catch(() => setS({})); }, []);
  if (!s) return <Skeleton h={260} />;
  const by = (t) => s.i?.breakdown?.filter((b) => b.type === t).reduce((a, b) => a + b.count, 0) ?? 0;
  const recovered = s.i?.breakdown?.filter((b) => ['returned', 'closed'].includes(b.status)).reduce((a, b) => a + b.count, 0) ?? 0;
  const kpis = [['Users', s.u?.users], ['New (7d)', s.u?.newLast7Days], ['Reports', s.i?.total], ['Lost / Found', `${by('lost')} / ${by('found')}`], ['Pending claims', s.c?.pending], ['Closed or returned', recovered]];
  return (
    <>
      <div className="kpis">{kpis.map(([l, v]) => <Glass key={l} className="stat"><b>{v ?? '—'}</b><span>{l}</span></Glass>)}</div>
      <div className="grid two">
        <Glass pad><h3>Claims by status</h3><BarChart data={['pending', 'approved', 'rejected', 'withdrawn'].map((k) => ({ label: k, value: s.c?.[k] ?? 0 }))} /></Glass>
        <Glass pad><h3>Reports by status</h3><BarChart data={['open', 'matched', 'claimed', 'verified', 'returned', 'closed'].map((k) => ({ label: k, value: s.i?.breakdown?.filter((b) => b.status === k).reduce((a, b) => a + b.count, 0) ?? 0 }))} /></Glass>
      </div>
    </>
  );
}

function Users({ ask }) {
  const toast = useToast();
  const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [sel, setSel] = useState(new Set());
  const [{ rows, total }, reload] = useList('/auth/admin/users', { q, page });
  const patch = async (u, body) => { try { await api.patch(`/auth/admin/users/${u.id}`, body); toast.success('User updated'); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const bulk = () => ask(`Deactivate ${sel.size} user(s)?`, 'They are signed out immediately and cannot log in.', async () => { for (const id of sel) await api.patch(`/auth/admin/users/${id}`, { isActive: false }).catch((e) => toast.error(errMsg(e))); setSel(new Set()); reload(); });
  return (
    <Glass pad>
      <div className="row"><Field aria-label="Search users" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minWidth: 260 }} /><span className="spacer" />{sel.size > 0 && <Button variant="danger" size="sm" onClick={bulk}>Deactivate selected ({sel.size})</Button>}</div>
      {!rows ? <Skeleton h={200} /> : <div className="table-wrap"><table><thead><tr><th /><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>
        {rows.map((u) => (
          <tr key={u.id}><td><input type="checkbox" aria-label={`Select ${u.name}`} checked={sel.has(u.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(u.id) : n.delete(u.id); return n; })} /></td>
            <td>{u.name}</td><td>{u.email}</td><td><Chip kind={u.role === 'admin' ? 'verified' : 'open'}>{u.role}</Chip></td><td><Chip kind={u.isActive ? 'approved' : 'rejected'}>{u.isActive ? 'active' : 'disabled'}</Chip></td><td>{fmtDate(u.createdAt)}</td>
            <td className="row" style={{ flexWrap: 'nowrap' }}><Button size="sm" onClick={() => ask(`${u.isActive ? 'Deactivate' : 'Reactivate'} ${u.name}?`, u.isActive ? 'They are signed out immediately.' : 'They can sign in again.', () => patch(u, { isActive: !u.isActive }))}>{u.isActive ? 'Deactivate' : 'Activate'}</Button>
              <Button size="sm" onClick={() => ask(`Make ${u.name} ${u.role === 'admin' ? 'a regular user' : 'an admin'}?`, 'Admins can moderate every report, claim and user.', () => patch(u, { role: u.role === 'admin' ? 'user' : 'admin' }))}>{u.role === 'admin' ? 'Demote' : 'Promote'}</Button></td></tr>
        ))}</tbody></table></div>}
      <Pager page={page} setPage={setPage} total={total} />
    </Glass>
  );
}

function Reports({ ask }) {
  const toast = useToast();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [sel, setSel] = useState(new Set());
  const [{ rows, total }, reload] = useList('/items/admin/items', { q, status, page });
  const patch = async (id, body) => { try { await api.patch(`/items/admin/items/${id}`, body); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const bulkHide = () => ask(`Hide ${sel.size} report(s)?`, 'Hidden reports disappear from public lists and search.', async () => { for (const id of sel) await patch(id, { hidden: true }); setSel(new Set()); });
  return (
    <Glass pad>
      <div className="row"><Field aria-label="Search reports" placeholder="Search title or area" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minWidth: 240 }} />
        <Field as="select" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any status</option>{['open', 'matched', 'claimed', 'verified', 'returned', 'closed'].map((s) => <option key={s}>{s}</option>)}</Field><span className="spacer" />
        {sel.size > 0 && <Button size="sm" variant="danger" onClick={bulkHide}>Hide selected ({sel.size})</Button>}</div>
      {!rows ? <Skeleton h={200} /> : !rows.length ? <Empty icon="📭" title="No reports">Nothing matches.</Empty> : <div className="table-wrap"><table><thead><tr><th /><th>Title</th><th>Type</th><th>Status</th><th>Area</th><th>Owner</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id}><td><input type="checkbox" aria-label={`Select ${r.title}`} checked={sel.has(r.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} /></td>
            <td>{r.title}</td><td><Chip kind={r.type} /></td><td><Chip kind={r.status} /></td><td>{r.area.label}</td><td>{r.ownerName}</td><td>{r.hidden ? '🙈 hidden' : '👁 public'}</td>
            <td className="row" style={{ flexWrap: 'nowrap' }}><Button size="sm" onClick={() => patch(r.id, { hidden: !r.hidden })}>{r.hidden ? 'Unhide' : 'Hide'}</Button>
              <Button size="sm" variant="danger" onClick={() => ask(`Delete “${r.title}”?`, 'This permanently removes the report and its photos.', async () => { await api.del(`/items/admin/items/${r.id}`).catch((e) => toast.error(errMsg(e))); reload(); })}>Delete</Button></td></tr>
        ))}</tbody></table></div>}
      <Pager page={page} setPage={setPage} total={total} />
    </Glass>
  );
}

function ClaimsAdmin({ ask }) {
  const toast = useToast();
  const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [{ rows, total }, reload] = useList('/claims/admin/claims', { status, page });
  return (
    <Glass pad>
      <Field as="select" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ maxWidth: 220 }}><option value="">Any status</option>{['pending', 'approved', 'rejected', 'withdrawn'].map((s) => <option key={s}>{s}</option>)}</Field>
      {!rows ? <Skeleton h={200} /> : <div className="table-wrap"><table><thead><tr><th>Item</th><th>Claimant</th><th>Finder</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>
        {rows.map((c) => <tr key={c.id}><td>{c.itemTitle}</td><td>{c.claimantName}</td><td>{c.finderName}</td><td><Chip kind={c.status} /></td><td>{timeAgo(c.createdAt)}</td><td>{c.status === 'pending' && <Button size="sm" variant="danger" onClick={() => ask('Reject this claim?', 'Use for abusive or fraudulent claims.', async () => { await api.patch(`/claims/admin/claims/${c.id}`, { status: 'rejected' }).catch((e) => toast.error(errMsg(e))); reload(); })}>Reject</Button>}</td></tr>)}</tbody></table></div>}
      <Pager page={page} setPage={setPage} total={total} />
    </Glass>
  );
}

function Audit() {
  const [action, setAction] = useState(''); const [page, setPage] = useState(1);
  const [{ rows, total }] = useList('/claims/admin/audit', { action, page, limit: 25 });
  return (
    <Glass pad>
      <Field aria-label="Filter by action" placeholder="Filter by action, e.g. claim.approve" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} style={{ maxWidth: 340 }} />
      {!rows ? <Skeleton h={200} /> : <div className="table-wrap"><table><thead><tr><th>When</th><th>Service</th><th>Action</th><th>Actor</th><th>Target</th><th>IP</th></tr></thead><tbody>
        {rows.map((a) => <tr key={a.id}><td>{new Date(a.at).toLocaleString()}</td><td>{a.service}</td><td><code>{a.action}</code></td><td>{a.actor ?? '—'}</td><td>{a.targetType}:{a.targetId?.slice(-6)}</td><td>{a.ip ?? '—'}</td></tr>)}</tbody></table></div>}
      <Pager page={page} setPage={setPage} total={total} limit={25} />
    </Glass>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('overview');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const ask = (title, text, run) => setConfirm({ title, text, run });
  return (
    <div className="container">
      <Reveal><h1 style={{ fontSize: '2.2rem' }}>Admin</h1>
        <Tabs value={tab} onChange={setTab} tabs={[['overview', 'Overview'], ['users', 'Users'], ['reports', 'Reports'], ['claims', 'Claims'], ['audit', 'Audit log']]} /></Reveal>
      {tab === 'overview' && <Overview />}{tab === 'users' && <Users ask={ask} />}{tab === 'reports' && <Reports ask={ask} />}{tab === 'claims' && <ClaimsAdmin ask={ask} />}{tab === 'audit' && <Audit />}
      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.title ?? ''}>
        <p className="muted">{confirm?.text}</p>
        <div className="row"><span className="spacer" /><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={async () => { setBusy(true); try { await confirm.run(); } finally { setBusy(false); setConfirm(null); } }}>Confirm</Button></div>
      </Modal>
    </div>
  );
}
