import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

// Status / role values come from the backend, so they are translated for display only.
const useStatus = () => {
  const { t } = useTranslation();
  return (k) => t(`admin.st.${k}`, { defaultValue: k });
};

function Pager({ page, setPage, total, limit = 20 }) {
  const { t } = useTranslation();
  return (
    <div className="row" style={{ marginTop: 12 }}>
      <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('admin.prev')}</Button>
      <span className="muted small">{t('admin.pageOf', { page, pages: Math.max(1, Math.ceil(total / limit)), total })}</span>
      <Button size="sm" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{t('admin.next')}</Button>
    </div>
  );
}

function Overview() {
  const { t } = useTranslation();
  const st = useStatus();
  const [s, setS] = useState(null);
  useEffect(() => { Promise.all([api.get('/auth/admin/stats'), api.get('/items/admin/stats'), api.get('/claims/admin/stats')]).then(([u, i, c]) => setS({ u, i, c })).catch(() => setS({})); }, []);
  if (!s) return <Skeleton h={260} />;
  const by = (ty) => s.i?.breakdown?.filter((b) => b.type === ty).reduce((a, b) => a + b.count, 0) ?? 0;
  const recovered = s.i?.breakdown?.filter((b) => ['returned', 'closed'].includes(b.status)).reduce((a, b) => a + b.count, 0) ?? 0;
  const kpis = [
    [t('admin.kpi.users'), s.u?.users],
    [t('admin.kpi.new7'), s.u?.newLast7Days],
    [t('admin.kpi.reports'), s.i?.total],
    [t('admin.kpi.lostFound'), `${by('lost')} / ${by('found')}`],
    [t('admin.kpi.pendingClaims'), s.c?.pending],
    [t('admin.kpi.recovered'), recovered],
  ];
  return (
    <>
      <div className="kpis">{kpis.map(([l, v]) => <Glass key={l} className="stat"><b>{v ?? '—'}</b><span>{l}</span></Glass>)}</div>
      <div className="grid two">
        <Glass pad><h3>{t('admin.claimsByStatus')}</h3><BarChart data={['pending', 'approved', 'rejected', 'withdrawn'].map((k) => ({ label: st(k), value: s.c?.[k] ?? 0 }))} /></Glass>
        <Glass pad><h3>{t('admin.reportsByStatus')}</h3><BarChart data={['open', 'matched', 'claimed', 'verified', 'returned', 'closed'].map((k) => ({ label: st(k), value: s.i?.breakdown?.filter((b) => b.status === k).reduce((a, b) => a + b.count, 0) ?? 0 }))} /></Glass>
      </div>
    </>
  );
}

function Users({ ask }) {
  const { t } = useTranslation();
  const st = useStatus();
  const toast = useToast();
  const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [sel, setSel] = useState(new Set());
  const [{ rows, total }, reload] = useList('/auth/admin/users', { q, page });
  const patch = async (u, body) => { try { await api.patch(`/auth/admin/users/${u.id}`, body); toast.success(t('admin.users.updated')); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const bulk = () => ask(t('admin.users.bulkTitle', { n: sel.size }), t('admin.users.bulkText'), async () => { for (const id of sel) await api.patch(`/auth/admin/users/${id}`, { isActive: false }).catch((e) => toast.error(errMsg(e))); setSel(new Set()); reload(); });
  return (
    <Glass pad>
      <div className="row"><Field aria-label={t('admin.users.searchAria')} placeholder={t('admin.users.searchPh')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minWidth: 260 }} /><span className="spacer" />{sel.size > 0 && <Button variant="danger" size="sm" onClick={bulk}>{t('admin.users.bulkBtn', { n: sel.size })}</Button>}</div>
      {!rows ? <Skeleton h={200} /> : <div className="table-wrap"><table><thead><tr><th /><th>{t('admin.col.name')}</th><th>{t('admin.col.email')}</th><th>{t('admin.col.role')}</th><th>{t('admin.col.status')}</th><th>{t('admin.col.joined')}</th><th>{t('admin.col.actions')}</th></tr></thead><tbody>
        {rows.map((u) => (
          <tr key={u.id}><td><input type="checkbox" aria-label={t('admin.select', { name: u.name })} checked={sel.has(u.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(u.id) : n.delete(u.id); return n; })} /></td>
            <td>{u.name}</td><td>{u.email}</td><td><Chip kind={u.role === 'admin' ? 'verified' : 'open'}>{st(u.role)}</Chip></td><td><Chip kind={u.isActive ? 'approved' : 'rejected'}>{u.isActive ? t('admin.users.active') : t('admin.users.disabled')}</Chip></td><td>{fmtDate(u.createdAt)}</td>
            <td className="row" style={{ flexWrap: 'nowrap' }}><Button size="sm" onClick={() => ask(t(u.isActive ? 'admin.users.deactTitle' : 'admin.users.reactTitle', { name: u.name }), t(u.isActive ? 'admin.users.deactText' : 'admin.users.reactText'), () => patch(u, { isActive: !u.isActive }))}>{u.isActive ? t('admin.users.deactivate') : t('admin.users.activate')}</Button>
              <Button size="sm" onClick={() => ask(t(u.role === 'admin' ? 'admin.users.demoteTitle' : 'admin.users.promoteTitle', { name: u.name }), t('admin.users.roleText'), () => patch(u, { role: u.role === 'admin' ? 'user' : 'admin' }))}>{u.role === 'admin' ? t('admin.users.demote') : t('admin.users.promote')}</Button></td></tr>
        ))}</tbody></table></div>}
      <Pager page={page} setPage={setPage} total={total} />
    </Glass>
  );
}

function Reports({ ask }) {
  const { t } = useTranslation();
  const st = useStatus();
  const toast = useToast();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [sel, setSel] = useState(new Set());
  const [{ rows, total }, reload] = useList('/items/admin/items', { q, status, page });
  const patch = async (id, body) => { try { await api.patch(`/items/admin/items/${id}`, body); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const bulkHide = () => ask(t('admin.reports.bulkTitle', { n: sel.size }), t('admin.reports.bulkText'), async () => { for (const id of sel) await patch(id, { hidden: true }); setSel(new Set()); });
  return (
    <Glass pad>
      <div className="row"><Field aria-label={t('admin.reports.searchAria')} placeholder={t('admin.reports.searchPh')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minWidth: 240 }} />
        <Field as="select" aria-label={t('admin.col.status')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">{t('admin.anyStatus')}</option>{['open', 'matched', 'claimed', 'verified', 'returned', 'closed'].map((s) => <option key={s} value={s}>{st(s)}</option>)}</Field><span className="spacer" />
        {sel.size > 0 && <Button size="sm" variant="danger" onClick={bulkHide}>{t('admin.reports.bulkBtn', { n: sel.size })}</Button>}</div>
      {!rows ? <Skeleton h={200} /> : !rows.length ? <Empty icon="📭" title={t('admin.reports.emptyTitle')}>{t('admin.reports.emptyText')}</Empty> : <div className="table-wrap"><table><thead><tr><th /><th>{t('admin.col.title')}</th><th>{t('admin.col.type')}</th><th>{t('admin.col.status')}</th><th>{t('admin.col.area')}</th><th>{t('admin.col.owner')}</th><th>{t('admin.col.visibility')}</th><th>{t('admin.col.actions')}</th></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id}><td><input type="checkbox" aria-label={t('admin.select', { name: r.title })} checked={sel.has(r.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} /></td>
            <td>{r.title}</td><td><Chip kind={r.type} /></td><td><Chip kind={r.status} /></td><td>{r.area.label}</td><td>{r.ownerName}</td><td>{r.hidden ? t('admin.reports.hiddenLabel') : t('admin.reports.publicLabel')}</td>
            <td className="row" style={{ flexWrap: 'nowrap' }}><Button size="sm" onClick={() => patch(r.id, { hidden: !r.hidden })}>{r.hidden ? t('admin.reports.unhide') : t('admin.reports.hide')}</Button>
              <Button size="sm" variant="danger" onClick={() => ask(t('admin.reports.delTitle', { title: r.title }), t('admin.reports.delText'), async () => { await api.del(`/items/admin/items/${r.id}`).catch((e) => toast.error(errMsg(e))); reload(); })}>{t('admin.reports.delete')}</Button></td></tr>
        ))}</tbody></table></div>}
      <Pager page={page} setPage={setPage} total={total} />
    </Glass>
  );
}

function ClaimsAdmin({ ask }) {
  const { t } = useTranslation();
  const st = useStatus();
  const toast = useToast();
  const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [{ rows, total }, reload] = useList('/claims/admin/claims', { status, page });
  return (
    <Glass pad>
      <Field as="select" aria-label={t('admin.col.status')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ maxWidth: 220 }}><option value="">{t('admin.anyStatus')}</option>{['pending', 'approved', 'rejected', 'withdrawn'].map((s) => <option key={s} value={s}>{st(s)}</option>)}</Field>
      {!rows ? <Skeleton h={200} /> : <div className="table-wrap"><table><thead><tr><th>{t('admin.col.item')}</th><th>{t('admin.col.claimant')}</th><th>{t('admin.col.finder')}</th><th>{t('admin.col.status')}</th><th>{t('admin.col.created')}</th><th /></tr></thead><tbody>
        {rows.map((c) => <tr key={c.id}><td>{c.itemTitle}</td><td>{c.claimantName}</td><td>{c.finderName}</td><td><Chip kind={c.status} /></td><td>{timeAgo(c.createdAt)}</td><td>{c.status === 'pending' && <Button size="sm" variant="danger" onClick={() => ask(t('admin.claims.rejectTitle'), t('admin.claims.rejectText'), async () => { await api.patch(`/claims/admin/claims/${c.id}`, { status: 'rejected' }).catch((e) => toast.error(errMsg(e))); reload(); })}>{t('admin.claims.reject')}</Button>}</td></tr>)}</tbody></table></div>}
      <Pager page={page} setPage={setPage} total={total} />
    </Glass>
  );
}

function Audit() {
  const { t } = useTranslation();
  const [action, setAction] = useState(''); const [page, setPage] = useState(1);
  const [{ rows, total }] = useList('/claims/admin/audit', { action, page, limit: 25 });
  return (
    <Glass pad>
      <Field aria-label={t('admin.audit.filterAria')} placeholder={t('admin.audit.filterPh')} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} style={{ maxWidth: 340 }} />
      {!rows ? <Skeleton h={200} /> : <div className="table-wrap"><table><thead><tr><th>{t('admin.audit.when')}</th><th>{t('admin.audit.service')}</th><th>{t('admin.audit.action')}</th><th>{t('admin.audit.actor')}</th><th>{t('admin.audit.target')}</th><th>{t('admin.audit.ip')}</th></tr></thead><tbody>
        {rows.map((a) => <tr key={a.id}><td>{new Date(a.at).toLocaleString()}</td><td>{a.service}</td><td><code>{a.action}</code></td><td>{a.actor ?? '—'}</td><td>{a.targetType}:{a.targetId?.slice(-6)}</td><td>{a.ip ?? '—'}</td></tr>)}</tbody></table></div>}
      <Pager page={page} setPage={setPage} total={total} limit={25} />
    </Glass>
  );
}

export default function Admin() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('overview');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const ask = (title, text, run) => setConfirm({ title, text, run });
  return (
    <div className="container">
      <Reveal><h1 style={{ fontSize: '2.2rem' }}>{t('admin.title')}</h1>
        <Tabs value={tab} onChange={setTab} tabs={[['overview', t('admin.tab.overview')], ['users', t('admin.tab.users')], ['reports', t('admin.tab.reports')], ['claims', t('admin.tab.claims')], ['audit', t('admin.tab.audit')]]} /></Reveal>
      {tab === 'overview' && <Overview />}{tab === 'users' && <Users ask={ask} />}{tab === 'reports' && <Reports ask={ask} />}{tab === 'claims' && <ClaimsAdmin ask={ask} />}{tab === 'audit' && <Audit />}
      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.title ?? ''}>
        <p className="muted">{confirm?.text}</p>
        <div className="row"><span className="spacer" /><Button onClick={() => setConfirm(null)}>{t('admin.cancel')}</Button><Button variant="danger" loading={busy} onClick={async () => { setBusy(true); try { await confirm.run(); } finally { setBusy(false); setConfirm(null); } }}>{t('admin.confirm')}</Button></div>
      </Modal>
    </div>
  );
}