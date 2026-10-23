import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Glass, Button, Empty, Skeleton } from '../components/ui.jsx';
import { useAuth } from '../context/Auth.jsx';
import { useLive } from '../context/Live.jsx';
import { useCall } from '../context/Call.jsx';
import { useToast } from '../context/Toast.jsx';
import { api } from '../lib/api.js';
import { fmtTime, initials, timeAgo } from '../lib/util.js';

const tick = (m) => (m.pending ? '🕓' : m.failed ? '⚠️' : m.readAt ? <span className="tick read" title="Read">✓✓</span> : m.deliveredAt ? '✓✓' : '✓');

export default function Messages() {
  const { id: activeId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { socket, connected, refreshCounts } = useLive();
  const call = useCall();
  const toast = useToast();
  const [convs, setConvs] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const box = useRef(null); const atBottom = useRef(true); const lastTyping = useRef(0); const typingTimer = useRef(null);
  const active = convs?.find((c) => c.id === activeId);

  const loadConvs = useCallback(() => api.get('/realtime/conversations').then((d) => setConvs(d.conversations)).catch(() => setConvs([])), []);
  useEffect(() => { loadConvs(); }, [loadConvs]);
  useEffect(() => { if (convs?.length && !activeId && window.innerWidth > 780) nav(`/messages/${convs[0].id}`, { replace: true }); }, [convs, activeId, nav]);

  const scrollDown = (smooth = true) => { const el = box.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); };
  const markRead = useCallback(() => { if (activeId && socket) socket.emit('message:read', { conversationId: activeId }, () => { refreshCounts(); setConvs((c) => c?.map((x) => (x.id === activeId ? { ...x, unread: 0 } : x))); }); }, [activeId, socket, refreshCounts]);

  // load history for the active conversation
  useEffect(() => {
    if (!activeId) { setMsgs([]); return; }
    setLoading(true); setMsgs([]);
    api.get(`/realtime/conversations/${activeId}/messages?limit=60`).then((d) => { setMsgs(d.messages); setLoading(false); setTimeout(() => scrollDown(false), 30); markRead(); }).catch(() => { setLoading(false); toast.error('Could not load messages'); });
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const merge = (list, m) => (list.some((x) => x.id === m.id || x.clientId === m.clientId) ? list.map((x) => (x.clientId === m.clientId || x.id === m.id ? { ...x, ...m, pending: false, failed: false } : x)) : [...list, m]);

  // live events
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = (m) => {
      if (m.conversation === activeId) {
        setMsgs((l) => merge(l, m)); markRead();
        if (atBottom.current) setTimeout(scrollDown, 30); else setUnseen(true);
      } else setConvs((c) => c?.map((x) => (x.id === m.conversation ? { ...x, unread: x.unread + 1, lastMessage: { text: m.text, sender: m.sender, createdAt: m.createdAt }, lastMessageAt: m.createdAt } : x)));
    };
    const onDelivered = ({ conversationId }) => conversationId === activeId && setMsgs((l) => l.map((m) => (m.sender === user.id && !m.deliveredAt ? { ...m, deliveredAt: new Date().toISOString() } : m)));
    const onRead = ({ conversationId, readAt }) => conversationId === activeId && setMsgs((l) => l.map((m) => (m.sender === user.id ? { ...m, readAt, deliveredAt: m.deliveredAt ?? readAt } : m)));
    const onTyping = (t) => { if (t.conversationId === activeId) { setTyping(t.typing); clearTimeout(typingTimer.current); if (t.typing) typingTimer.current = setTimeout(() => setTyping(false), 4000); } };
    const onConv = () => loadConvs();
    socket.on('message:new', onNew); socket.on('message:delivered', onDelivered); socket.on('message:read', onRead); socket.on('typing', onTyping); socket.on('conversation:new', onConv);
    return () => { socket.off('message:new', onNew); socket.off('message:delivered', onDelivered); socket.off('message:read', onRead); socket.off('typing', onTyping); socket.off('conversation:new', onConv); };
  }, [socket, activeId, user.id, markRead, loadConvs]);

  // reconnect catch-up: fetch only what we missed, merged without duplicates
  const first = useRef(true);
  useEffect(() => {
    if (!connected) return;
    if (first.current) { first.current = false; return; }
    loadConvs();
    const last = [...msgs].reverse().find((m) => !m.pending && m.id);
    if (activeId && last) api.get(`/realtime/conversations/${activeId}/messages?after=${last.id}`).then((d) => { setMsgs((l) => d.messages.reduce(merge, l)); markRead(); }).catch(() => {});
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (e, retry) => {
    e?.preventDefault();
    const body = (retry?.text ?? text).trim();
    if (!body || !activeId || !socket) return;
    const clientId = retry?.clientId ?? crypto.randomUUID();
    if (!retry) { setMsgs((l) => [...l, { id: clientId, clientId, conversation: activeId, sender: user.id, text: body, createdAt: new Date().toISOString(), pending: true }]); setText(''); setTimeout(scrollDown, 30); }
    else setMsgs((l) => l.map((m) => (m.clientId === clientId ? { ...m, failed: false, pending: true } : m)));
    socket.emit('message:send', { conversationId: activeId, text: body, clientId }, (ack) => {
      if (ack?.ok) { setMsgs((l) => merge(l, ack.message)); setConvs((c) => c?.map((x) => (x.id === activeId ? { ...x, lastMessage: { text: ack.message.text, sender: user.id, createdAt: ack.message.createdAt } } : x))); }
      else { setMsgs((l) => l.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m))); toast.error(ack?.error === 'rate_limited' ? 'Slow down a little' : 'Message not sent'); }
    });
  };
  const onType = (e) => {
    setText(e.target.value);
    const now = Date.now();
    if (socket && activeId && now - lastTyping.current > 2000) { lastTyping.current = now; socket.emit('typing', { conversationId: activeId, typing: true }, () => {}); }
    clearTimeout(onType.t); onType.t = setTimeout(() => socket?.emit('typing', { conversationId: activeId, typing: false }, () => {}), 2500);
  };

  if (!convs) return <div className="container"><Skeleton h={420} /></div>;
  if (!convs.length) return <div className="container"><Empty icon="💬" title="No conversations yet">A private chat opens automatically when a claim is approved, so you can arrange the handover.</Empty></div>;

  return (
    <div className="container" style={{ paddingBottom: 24 }}>
      <div className={`chat-layout ${activeId ? 'has-active' : ''}`}>
        <Glass className="convs" role="list" aria-label="Conversations">
          {convs.map((c) => (
            <button key={c.id} role="listitem" className="conv" aria-current={c.id === activeId} onClick={() => nav(`/messages/${c.id}`)}>
              <span className="avatar">{initials(c.other.name)}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}><strong>{c.other.name}</strong><span className="faint small" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.item?.title}{c.lastMessage ? ` · ${c.lastMessage.text}` : ''}</span></span>
              {c.unread > 0 && <span className="badge">{c.unread}</span>}
            </button>
          ))}
        </Glass>
        <Glass className="thread" style={{ position: 'relative' }}>
          {!active ? <Empty icon="👈" title="Pick a conversation">Select a chat to start talking.</Empty> : (
            <>
              <div className="thread-head">
                <Button size="sm" className="back" onClick={() => nav('/messages')} aria-label="Back to conversations" style={{ display: window.innerWidth > 780 ? 'none' : undefined }}>←</Button>
                <span className="avatar">{initials(active.other.name)}</span>
                <div style={{ flex: 1 }}><strong>{active.other.name}</strong><div className="faint small">{active.item?.title} · {connected ? 'live' : 'reconnecting…'}</div></div>
                <Button size="sm" onClick={() => call.start(active, 'audio')} disabled={call.busy} aria-label="Start audio call">📞</Button>
                <Button size="sm" onClick={() => call.start(active, 'video')} disabled={call.busy} aria-label="Start video call">🎥</Button>
              </div>
              <div className="msgs" ref={box} onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (atBottom.current) setUnseen(false); }} role="log" aria-live="polite" aria-label="Messages">
                {loading && <Skeleton h={60} />}
                {msgs.map((m) => (
                  <div key={m.id} className={`bubble ${m.sender === user.id ? 'me' : ''} ${m.pending ? 'pending' : ''}`}>
                    {m.text}
                    <small>{fmtTime(m.createdAt)} {m.sender === user.id && tick(m)} {m.failed && <button className="btn sm" onClick={() => send(null, m)}>Retry</button>}</small>
                  </div>
                ))}
              </div>
              {unseen && <Button size="sm" variant="primary" style={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)' }} onClick={() => { scrollDown(); setUnseen(false); }}>New messages ↓</Button>}
              <div className="typing" aria-live="polite">{typing ? `${active.other.name} is typing…` : ''}</div>
              <form className="composer" onSubmit={send}>
                <label className="sr-only" htmlFor="msg">Message</label>
                <input id="msg" className="input" placeholder="Write a message…" value={text} maxLength={2000} autoComplete="off" onChange={onType} />
                <Button variant="primary" disabled={!text.trim()}>Send</Button>
              </form>
            </>
          )}
        </Glass>
      </div>
      <p className="faint small center" style={{ marginTop: 8 }}>Last activity {active ? timeAgo(active.lastMessageAt) : ''}. Never share card numbers or passwords in chat.</p>
    </div>
  );
}
