import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Glass, Button, Empty, Skeleton, Reveal } from '../components/ui.jsx';
import { useLive } from '../context/Live.jsx';
import { useToast } from '../context/Toast.jsx';
import { api } from '../lib/api.js';
import { errMsg, timeAgo } from '../lib/util.js';

const ICON = { match: '✨', claim: '🙋', message: '💬', item: '📦' };
const linkFor = (n) => (n.type === 'match' && n.payload?.itemId ? `/items/${n.payload.itemId}` : n.type === 'message' ? '/messages' : n.payload?.itemId && n.type === 'item' ? `/items/${n.payload.itemId}` : '/claims');

function Toggle({ label, checked, onChange }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

export default function Notifications() {
  const { t } = useTranslation();
  const { refreshCounts, socket } = useLive();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const load = () => api.get('/notify/notifications?limit=50').then((d) => setItems(d.items)).catch((e) => { toast.error(errMsg(e)); setItems([]); });
  useEffect(() => { load(); api.get('/notify/preferences').then((d) => setPrefs(d.preferences)).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!socket) return undefined; const f = (n) => setItems((l) => [n, ...(l ?? [])]); socket.on('notification:new', f); return () => socket.off('notification:new', f); }, [socket]);

  const markAll = async () => { await api.post('/notify/notifications/read', { all: true }); setItems((l) => l.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))); refreshCounts(); };
  const markOne = async (n) => { if (n.readAt) return; await api.post('/notify/notifications/read', { ids: [n.id] }).catch(() => {}); setItems((l) => l.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))); refreshCounts(); };
  const savePref = async (group, key, value) => {
    const prev = prefs; setPrefs((p) => ({ ...p, ...(group === 'emailWhenOnline' ? { emailWhenOnline: value } : { [group]: { ...p[group], [key]: value } }) }));
    try { await api.put('/notify/preferences', group === 'emailWhenOnline' ? { emailWhenOnline: value } : { [group]: { [key]: value } }); } catch (e) { setPrefs(prev); toast.error(errMsg(e)); }
  };

  return (
    <div className="container">
      <Reveal><div className="row"><h1 style={{ margin: 0, fontSize: '2.2rem' }}>{t('notif.title')}</h1><span className="spacer" /><Button size="sm" onClick={markAll}>{t('notif.markAll')}</Button></div></Reveal>
      <div className="grid two" style={{ marginTop: 18, alignItems: 'start' }}>
        <div className="col">
          {!items ? <Skeleton h={200} /> : !items.length ? <Empty icon="🔔" title={t('notif.quietTitle')}>{t('notif.quietText')}</Empty> : items.map((n) => (
            <Glass key={n.id} pad hover as={Link} to={linkFor(n)} onClick={() => markOne(n)} style={{ color: 'inherit', opacity: n.readAt ? 0.7 : 1, borderLeft: n.readAt ? undefined : '4px solid var(--teal)' }}>
              <div className="row"><span style={{ fontSize: '1.5rem' }} aria-hidden>{ICON[n.type] ?? '🔔'}</span><div style={{ flex: 1 }}><strong>{n.title}</strong><div className="muted small">{n.body}</div></div><span className="faint small">{timeAgo(n.createdAt)}</span></div>
            </Glass>
          ))}
        </div>
        <Glass pad as="section" aria-label={t('notif.prefsLabel')}><h3>{t('notif.prefs')}</h3>
          {!prefs ? <Skeleton h={160} /> : (
            <div className="col">
              <strong className="small muted">{t('notif.inApp')}</strong>
              {['match', 'claim', 'message'].map((k) => <Toggle key={k} label={t(`notif.alert_${k}`)} checked={prefs.inApp[k]} onChange={(v) => savePref('inApp', k, v)} />)}
              <strong className="small muted" style={{ marginTop: 8 }}>{t('notif.email')}</strong>
              {['match', 'claim', 'message'].map((k) => <Toggle key={k} label={t(`notif.email_${k}`)} checked={prefs.email[k]} onChange={(v) => savePref('email', k, v)} />)}
              <Toggle label={t('notif.emailOnline')} checked={prefs.emailWhenOnline} onChange={(v) => savePref('emailWhenOnline', null, v)} />
              <p className="hint">{t('notif.emailHint')}</p>
            </div>
          )}
        </Glass>
      </div>
    </div>
  );
}