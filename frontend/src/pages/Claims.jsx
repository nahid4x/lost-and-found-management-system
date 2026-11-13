import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { Glass, Tabs, Empty, Skeleton, Button, Chip, Modal, Reveal } from '../components/ui.jsx';
import { VerificationCard, RequestInfoModal, SupplementModal, REVIEW_STATE } from '../components/VerificationParts.jsx';
import { api } from '../lib/api.js';
import { errMsg, timeAgo } from '../lib/util.js';
import { useToast } from '../context/Toast.jsx';

const isEnded = (c) => ['rejected', 'withdrawn'].includes(c.status) || Boolean(c.returnedAt);

export default function Claims() {
  const { t } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useState('received');
  const [data, setData] = useState({ received: null, mine: null });
  const [confirm, setConfirm] = useState(null); // {c, decision}
  const [remove, setRemove] = useState(null); // claim to delete from my list
  const [info, setInfo] = useState(null); // finder: claim to ask for more information
  const [supp, setSupp] = useState(null); // claimant: claim to answer
  const [busy, setBusy] = useState(false);
  const load = () => {
    api.get('/claims/received').then((d) => setData((x) => ({ ...x, received: d.claims }))).catch((e) => toast.error(errMsg(e)));
    api.get('/claims/mine').then((d) => setData((x) => ({ ...x, mine: d.claims }))).catch((e) => toast.error(errMsg(e)));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (path, body, okMsg) => {
    setBusy(true);
    try { await api.post(path, body); toast.success(okMsg); setConfirm(null); setRemove(null); load(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const list = data[tab];
  const pendingCount = data.received?.filter((c) => c.status === 'pending').length;

  return (
    <div className="container">
      <Reveal><h1 style={{ fontSize: '2.2rem' }}>{t('claims.title')}</h1>
        <Tabs value={tab} onChange={setTab} tabs={[['received', t('claims.received'), pendingCount || null], ['mine', t('claims.mine')]]} /></Reveal>
      {!list ? <Skeleton h={220} /> : !list.length ? <Empty icon="🗂️" title={t('claims.noneTitle')}>{tab === 'received' ? t('claims.noneReceived') : t('claims.noneMine')}</Empty> : (
        <div className="col">{list.map((c) => (
          <Glass key={c.id} pad>
            <div className="row"><Link to={`/items/${c.itemId}`}><strong>{c.itemTitle}</strong></Link><Chip kind={c.status} />{c.returnedAt && <Chip kind="returned" />}<span className="spacer" /><span className="faint small">{timeAgo(c.createdAt)}</span></div>
            {tab === 'received' && <p className="muted small" style={{ margin: '6px 0' }}><Trans i18nKey="claims.claimedBy" values={{ name: c.claimantName }} components={{ b: <strong /> }} /></p>}
            {c.answers?.length > 0 && <div className="col" style={{ margin: '10px 0' }}>{c.answers.map((a, i) => <div key={i} className="glass pad" style={{ borderRadius: 14, padding: 12 }}><div className="faint small">{t('claims.q', { question: a.question })}</div><div style={{ whiteSpace: 'pre-wrap' }}>{a.answer}</div></div>)}</div>}
            {tab === 'received' && c.message && <p className="muted small" style={{ whiteSpace: 'pre-wrap' }}>{t('claims.claimantNote', { message: c.message })}</p>}
            {tab === 'received' && c.status === 'pending' && <VerificationCard v={c.verification} thresholds={c.thresholds} reviewState={c.reviewState} />}
            {tab === 'received' && c.moreInfo && <p className="muted small">{t('claims.youAsked', { message: c.moreInfo.message })}</p>}
            {tab === 'received' && c.supplement && <Glass pad style={{ borderRadius: 14, margin: '8px 0' }}><div className="faint small">{t('claims.claimantReply')}</div><div style={{ whiteSpace: 'pre-wrap' }}>{c.supplement.message}</div>
              {c.supplement.proofUrls?.length > 0 && <div className="previews">{c.supplement.proofUrls.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={t('claims.extraProof', { n: i + 1 })} loading="lazy" referrerPolicy="no-referrer" /></a>)}</div>}</Glass>}
            {tab === 'mine' && c.status === 'pending' && <p className="small"><span className="chip pending">{t(`reviewState.${c.reviewState}`, { defaultValue: REVIEW_STATE[c.reviewState] ?? t('claims.pendingReview') })}</span></p>}
            {tab === 'mine' && c.reviewState === 'more_info_requested' && <Glass pad style={{ borderRadius: 14, margin: '8px 0' }}><div className="faint small">{t('claims.finderAsks')}</div><div>{c.moreInfo?.message}</div><div className="row" style={{ marginTop: 8 }}><Button variant="primary" size="sm" onClick={() => setSupp(c)}>{t('claims.sendInfo')}</Button></div></Glass>}
            {tab === 'received' && c.proofUrls?.length > 0 && <div className="previews" aria-label={t('claims.proofPhotos')}>{c.proofUrls.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" aria-label={t('claims.openProof', { n: i + 1 })}><img src={u} alt={t('claims.proof', { n: i + 1 })} loading="lazy" referrerPolicy="no-referrer" /></a>)}</div>}
            {tab === 'mine' && <p className="faint small">{t('claims.proofAttached', { count: c.proofCount })}{c.status === 'approved' && c.finderName ? ` · ${t('claims.approvedBy', { name: c.finderName })}` : ''}</p>}
            <div className="row" style={{ marginTop: 8 }}>
              {tab === 'received' && c.status === 'pending' && <><Button variant="ok" onClick={() => setConfirm({ c, decision: 'approve' })}>{t('claims.approve')}</Button><Button variant="danger" onClick={() => setConfirm({ c, decision: 'reject' })}>{t('claims.reject')}</Button><Button onClick={() => setInfo(c)} disabled={c.reviewState === 'more_info_requested'}>{c.reviewState === 'more_info_requested' ? t('claims.waiting') : t('claims.requestInfo')}</Button><Button onClick={() => setInfo(c)} disabled={c.reviewState === 'more_info_requested'} aria-label={t('claims.contactAria', { name: c.claimantName })}>{t('claims.contact')}</Button></>}
              {tab === 'mine' && c.status === 'pending' && <Button onClick={() => act(`/claims/${c.id}/withdraw`, undefined, t('claims.withdrawnToast'))}>{t('claims.withdraw')}</Button>}
              {c.status === 'approved' && !c.returnedAt && <><Link to="/messages" className="btn primary">{t('claims.chat')}</Link><Button onClick={() => act(`/claims/${c.id}/returned`, undefined, t('claims.returnedToast'))}>{t('claims.markReturned')}</Button></>}
              {isEnded(c) && <><span className="spacer" /><Button variant="danger" onClick={() => setRemove(c)}>{t('claims.delete')}</Button></>}
            </div>
          </Glass>
        ))}</div>
      )}
      <RequestInfoModal claim={info} open={Boolean(info)} onClose={() => setInfo(null)} onDone={load} />
      <SupplementModal claim={supp} open={Boolean(supp)} onClose={() => setSupp(null)} onDone={load} />
      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.decision === 'approve' ? t('claims.approveTitle') : t('claims.rejectTitle')}>
        <p className="muted">{confirm?.decision === 'approve' ? t('claims.approveText', { name: confirm?.c.claimantName }) : t('claims.rejectText')}</p>
        <div className="row"><span className="spacer" /><Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button><Button variant={confirm?.decision === 'approve' ? 'ok' : 'danger'} loading={busy} onClick={() => act(`/claims/${confirm.c.id}/decision`, { decision: confirm.decision }, confirm.decision === 'approve' ? t('claims.approvedToast') : t('claims.rejectedToast'))}>{confirm?.decision === 'approve' ? t('claims.approveBtn') : t('claims.rejectBtn')}</Button></div>
      </Modal>
      <Modal open={Boolean(remove)} onClose={() => setRemove(null)} title={t('claims.deleteTitle')}>
        <p className="muted">{t('claims.deleteText', { title: remove?.itemTitle })}</p>
        <div className="row"><span className="spacer" /><Button onClick={() => setRemove(null)}>{t('common.cancel')}</Button><Button variant="danger" loading={busy} onClick={() => act(`/claims/${remove.id}/hide`, undefined, t('claims.removedToast'))}>{t('common.delete')}</Button></div>
      </Modal>
    </div>
  );
}