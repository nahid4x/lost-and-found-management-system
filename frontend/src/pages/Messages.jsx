import '../styles/chat.css';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Glass, Button, Empty, Skeleton } from '../components/ui.jsx';
import { useAuth } from '../context/Auth.jsx';
import { useLive } from '../context/Live.jsx';
import { useCall } from '../context/Call.jsx';
import { useToast } from '../context/Toast.jsx';
import { api, getToken, refresh } from '../lib/api.js';
import { errMsg, fmtTime, initials, timeAgo } from '../lib/util.js';

const tick = (m) => (m.pending ? '🕓' : m.failed ? '⚠️' : m.readAt ? <span className="tick read" title="Read">✓✓</span> : m.deliveredAt ? '✓✓' : '✓');

/* ---------- icons (one consistent line style) ---------- */
const Svg = ({ children }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const PhoneIcon = () => <Svg><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></Svg>;
const VideoIcon = () => <Svg><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></Svg>;
const ClipIcon = () => <Svg><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></Svg>;
const SendIcon = () => <Svg><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Svg>;
const TrashIcon = () => <Svg><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></Svg>;

const Avatar = ({ name, online }) => (
  <span className="avatar-wrap">
    <span className="avatar">{initials(name)}</span>
    <span className={`online-dot ${online ? 'on' : ''}`} role="img" aria-label={online ? 'Online' : 'Offline'} />
  </span>
);

/** "Today", "Yesterday" or a short date, used for the separators between days in a thread. */
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(iso) === dayKey(now)) return 'Today';
  if (dayKey(iso) === dayKey(yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** Shrinks a picture to a JPEG of at most ~900 KB (max 1280 px). Re-encoding also drops EXIF/location data. */
async function compressImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('decode'); }
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const b = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (b && b.size <= 900_000) return b;
  }
  throw new Error('too_large');
}

/** A private chat photo. It is fetched with the login token (so only the two people can see it) and shown from a local blob. */
function ChatImage({ m, convId }) {
  const [url, setUrl] = useState(m.localUrl ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (m.localUrl || !m.image?.id) return undefined;
    let dead = false; let obj = null;
    const get = () => fetch(`/api/realtime/conversations/${convId}/images/${m.image.id}`, { headers: { Authorization: `Bearer ${getToken()}`, 'X-Requested-With': 'findit' }, credentials: 'include' });
    (async () => {
      try {
        let r = await get();
        if (r.status === 401 && (await refresh())) r = await get();
        if (!r.ok) throw new Error('load');
        obj = URL.createObjectURL(await r.blob());
        if (!dead) setUrl(obj);
      } catch { if (!dead) setFailed(true); }
    })();
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj); };
  }, [m.localUrl, m.image?.id, convId]);
  if (failed) return <span className="faint small">📷 Photo unavailable</span>;
  if (!url) return <Skeleton h={120} />;
  return <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Photo sent in chat" style={{ display: 'block', maxWidth: 260, width: '100%', borderRadius: 12 }} /></a>;
}

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
  const [typingIn, setTypingIn] = useState({}); // conversationId -> is the other person typing
  const [online, setOnline] = useState(() => new Set()); // user ids that are online now
  const [unseen, setUnseen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const box = useRef(null); const atBottom = useRef(true); const lastTyping = useRef(0); const input = useRef(null);
  const active = convs?.find((c) => c.id === activeId);
  const peerIds = useMemo(() => (convs ?? []).map((c) => c.other.id).join(','), [convs]);

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
  const applyDeleted = useCallback((id) => {
    setMsgs((l) => l.map((x) => (x.id === id ? { ...x, deleted: true, text: 'This message was deleted', kind: 'text', image: null, localUrl: null } : x)));
    loadConvs();
  }, [loadConvs]);

  // live events for the open conversation
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = (m) => {
      setTypingIn((x) => ({ ...x, [m.conversation]: false }));
      if (m.conversation === activeId) {
        setMsgs((l) => merge(l, m)); markRead();
        if (atBottom.current) setTimeout(scrollDown, 30); else setUnseen(true);
      } else setConvs((c) => c?.map((x) => (x.id === m.conversation ? { ...x, unread: x.unread + 1, lastMessage: { text: m.text, sender: m.sender, createdAt: m.createdAt }, lastMessageAt: m.createdAt } : x)));
    };
    const onDelivered = ({ conversationId }) => conversationId === activeId && setMsgs((l) => l.map((m) => (m.sender === user.id && !m.deliveredAt ? { ...m, deliveredAt: new Date().toISOString() } : m)));
    const onRead = ({ conversationId, readAt }) => conversationId === activeId && setMsgs((l) => l.map((m) => (m.sender === user.id ? { ...m, readAt, deliveredAt: m.deliveredAt ?? readAt } : m)));
    const onDeleted = ({ conversationId, messageId }) => { if (conversationId === activeId) applyDeleted(messageId); else loadConvs(); };
    const onConv = () => loadConvs();
    const onRemoved = ({ conversationId }) => { setConvs((c) => c?.filter((x) => x.id !== conversationId)); if (conversationId === activeId) nav('/messages'); };
    socket.on('message:new', onNew); socket.on('message:delivered', onDelivered); socket.on('message:read', onRead); socket.on('message:deleted', onDeleted); socket.on('conversation:new', onConv); socket.on('conversation:removed', onRemoved);
    return () => { socket.off('message:new', onNew); socket.off('message:delivered', onDelivered); socket.off('message:read', onRead); socket.off('message:deleted', onDeleted); socket.off('conversation:new', onConv); socket.off('conversation:removed', onRemoved); };
  }, [socket, activeId, user.id, markRead, loadConvs, applyDeleted, nav]);

  // typing + online status for every conversation (shown in the list and the header)
  useEffect(() => {
    if (!socket) return undefined;
    const timers = {};
    const onTyping = (t) => {
      clearTimeout(timers[t.conversationId]);
      setTypingIn((x) => ({ ...x, [t.conversationId]: t.typing }));
      if (t.typing) timers[t.conversationId] = setTimeout(() => setTypingIn((x) => ({ ...x, [t.conversationId]: false })), 4000);
    };
    const onPresence = ({ userId, online: on }) => setOnline((s) => { const n = new Set(s); if (on) n.add(userId); else n.delete(userId); return n; });
    socket.on('typing', onTyping); socket.on('presence', onPresence);
    return () => { socket.off('typing', onTyping); socket.off('presence', onPresence); Object.values(timers).forEach(clearTimeout); };
  }, [socket]);
  useEffect(() => {
    if (!socket || !connected || !peerIds) return;
    socket.emit('presence:query', { userIds: peerIds.split(',') }, (ack) => { if (ack?.ok) setOnline(new Set(ack.online)); });
  }, [socket, connected, peerIds]);
  useEffect(() => { if (typingIn[activeId] && atBottom.current) setTimeout(scrollDown, 30); }, [typingIn, activeId]);

  // reconnect catch-up: fetch only what we missed, merged without duplicates
  const first = useRef(true);
  useEffect(() => {
    if (!connected) return;
    if (first.current) { first.current = false; return; }
    loadConvs();
    const last = [...msgs].reverse().find((m) => !m.pending && m.id);
    if (activeId && last) api.get(`/realtime/conversations/${activeId}/messages?after=${last.id}`).then((d) => { setMsgs((l) => d.messages.reduce(merge, l)); markRead(); }).catch(() => {});
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const resize = () => { const el = input.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; } };

  const send = (e, retry) => {
    e?.preventDefault();
    const body = (retry?.text ?? text).trim();
    if (!body || !activeId || !socket) return;
    const clientId = retry?.clientId ?? crypto.randomUUID();
    if (!retry) { setMsgs((l) => [...l, { id: clientId, clientId, conversation: activeId, sender: user.id, text: body, createdAt: new Date().toISOString(), pending: true }]); setText(''); setTimeout(() => { resize(); scrollDown(); }, 30); }
    else setMsgs((l) => l.map((m) => (m.clientId === clientId ? { ...m, failed: false, pending: true } : m)));
    socket.emit('message:send', { conversationId: activeId, text: body, clientId }, (ack) => {
      if (ack?.ok) { setMsgs((l) => merge(l, ack.message)); setConvs((c) => c?.map((x) => (x.id === activeId ? { ...x, lastMessage: { text: ack.message.text, sender: user.id, createdAt: ack.message.createdAt }, lastMessageAt: ack.message.createdAt } : x))); }
      else { setMsgs((l) => l.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m))); toast.error(ack?.error === 'rate_limited' ? 'Slow down a little' : 'Message not sent'); }
    });
  };

  const sendImage = async (file) => {
    if (!file || !activeId || !socket) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose a picture'); return; }
    setUploading(true);
    const tempId = crypto.randomUUID();
    try {
      const blob = await compressImage(file);
      const localUrl = URL.createObjectURL(blob);
      setMsgs((l) => [...l, { id: tempId, clientId: tempId, conversation: activeId, sender: user.id, text: '📷 Photo', kind: 'image', localUrl, createdAt: new Date().toISOString(), pending: true }]);
      setTimeout(scrollDown, 30);
      const r = await api.upload(`/realtime/conversations/${activeId}/images?sid=${encodeURIComponent(socket.id)}`, blob);
      setMsgs((l) => l.map((x) => (x.id === tempId ? { ...r.message, localUrl } : x)));
      setConvs((c) => c?.map((x) => (x.id === activeId ? { ...x, lastMessage: { text: r.message.text, sender: user.id, createdAt: r.message.createdAt }, lastMessageAt: r.message.createdAt } : x)));
    } catch (err) {
      setMsgs((l) => l.filter((x) => x.id !== tempId));
      toast.error(err?.message === 'decode' ? 'Could not read this picture' : err?.message === 'too_large' ? 'Picture is too large' : errMsg(err));
    } finally { setUploading(false); }
  };

  const deleteMsg = (m) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    socket.emit('message:delete', { conversationId: activeId, messageId: m.id }, (ack) => {
      if (ack?.ok) applyDeleted(m.id); else toast.error('Could not delete the message');
    });
  };

  const deleteChat = async () => {
    if (!active || !window.confirm(`Delete this chat with ${active.other.name}?\n\nIt is removed from your list only. ${active.other.name} keeps their copy.`)) return;
    try {
      await api.post(`/realtime/conversations/${active.id}/hide`, {});
      setConvs((c) => c?.filter((x) => x.id !== active.id));
      nav('/messages');
      toast.success('Chat deleted');
    } catch (err) { toast.error(errMsg(err)); }
  };

  const onType = (e) => {
    setText(e.target.value);
    resize();
    const now = Date.now();
    if (socket && activeId && now - lastTyping.current > 2000) { lastTyping.current = now; socket.emit('typing', { conversationId: activeId, typing: true }, () => {}); }
    clearTimeout(onType.t); onType.t = setTimeout(() => socket?.emit('typing', { conversationId: activeId, typing: false }, () => {}), 2500);
  };
  // Enter sends, Shift+Enter adds a new line (ignored while an IME is composing text).
  const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e); };
  const canDelete = (m) => m.sender === user.id && !m.pending && !m.failed && !m.deleted && m.kind !== 'call';

  if (!convs) return <div className="container"><Skeleton h={420} /></div>;
  if (!convs.length) return <div className="container"><Empty icon="💬" title="No conversations yet">A private chat opens automatically when a claim is approved, so you can arrange the handover.</Empty></div>;

  const peerOnline = active ? online.has(active.other.id) : false;
  return (
    <div className="container" style={{ paddingBottom: 24 }}>
      <div className={`chat-layout ${activeId ? 'has-active' : ''}`}>
        <Glass className="convs" role="list" aria-label="Conversations">
          {convs.map((c) => {
            const mine = c.lastMessage?.sender === user.id;
            return (
              <button key={c.id} role="listitem" className="conv" aria-current={c.id === activeId} onClick={() => nav(`/messages/${c.id}`)}>
                <Avatar name={c.other.name} online={online.has(c.other.id)} />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <strong>{c.other.name}</strong>
                  <span className="faint small" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: c.unread > 0 ? 700 : undefined }}>
                    {typingIn[c.id] ? <span className="typing-now">typing…</span> : <>{c.item?.title}{c.lastMessage ? ` · ${mine ? 'You: ' : ''}${c.lastMessage.text}` : ''}</>}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className="faint small">{timeAgo(c.lastMessage?.createdAt ?? c.lastMessageAt)}</span>
                  {c.unread > 0 && <span className="badge" style={{ position: 'static' }}>{c.unread > 99 ? '99+' : c.unread}</span>}
                </span>
              </button>
            );
          })}
        </Glass>
        <Glass className="thread" style={{ position: 'relative' }}>
          {!active ? <Empty icon="👈" title="Pick a conversation">Select a chat to start talking.</Empty> : (
            <>
              <div className="thread-head">
                <Button size="sm" className="back" onClick={() => nav('/messages')} aria-label="Back to conversations" style={{ display: window.innerWidth > 780 ? 'none' : undefined }}>←</Button>
                <Avatar name={active.other.name} online={peerOnline} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{active.other.name}</strong>
                  <div className="faint small">{active.item?.title} · {!connected ? 'reconnecting…' : typingIn[active.id] ? <span className="typing-now">typing…</span> : peerOnline ? <span style={{ color: '#4ade80' }}>online</span> : 'offline'}</div>
                </div>
                <button type="button" className="chat-btn trash" onClick={deleteChat} aria-label="Delete this chat" title="Delete chat"><TrashIcon /></button>
                <button type="button" className="chat-btn voice" onClick={() => call.start(active, 'audio')} disabled={call.busy} aria-label="Start voice call" title="Voice call"><PhoneIcon /></button>
                <button type="button" className="chat-btn video" onClick={() => call.start(active, 'video')} disabled={call.busy} aria-label="Start video call" title="Video call"><VideoIcon /></button>
              </div>
              <div className="msgs" ref={box} onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (atBottom.current) setUnseen(false); }} role="log" aria-live="polite" aria-label="Messages">
                {loading && <Skeleton h={60} />}
                {msgs.map((m, k) => (
                  <Fragment key={m.id}>
                    {(k === 0 || dayKey(msgs[k - 1].createdAt) !== dayKey(m.createdAt)) && (
                      <div className="faint small" style={{ alignSelf: 'center', padding: '4px 12px', margin: '8px 0', borderRadius: 999, background: 'rgba(255,255,255,0.08)' }}>{dayLabel(m.createdAt)}</div>
                    )}
                    <div
                      className={`bubble ${m.sender === user.id ? 'me' : ''} ${m.pending ? 'pending' : ''} ${m.deleted ? 'deleted' : ''}`}
                      style={{ whiteSpace: 'pre-wrap' }}
                    >
                      {m.deleted ? <em className="faint">🚫 This message was deleted</em> : m.kind === 'image' ? <ChatImage m={m} convId={activeId} /> : m.text}
                      <small>{fmtTime(m.createdAt)} {m.sender === user.id && tick(m)} {m.failed && <button className="btn sm" onClick={() => send(null, m)}>Retry</button>}{canDelete(m) && <button type="button" className="msg-x" onClick={() => deleteMsg(m)} aria-label="Delete message" title="Delete message"><TrashIcon /></button>}</small>
                    </div>
                  </Fragment>
                ))}
              </div>
              {unseen && <Button size="sm" variant="primary" style={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)' }} onClick={() => { scrollDown(); setUnseen(false); }}>New messages ↓</Button>}
              <div className="typing" aria-live="polite">
                {typingIn[activeId] && <span className="typing-pill"><span className="dots" aria-hidden="true"><i /><i /><i /></span>{active.other.name} is typing…</span>}
              </div>
              <form className="composer" onSubmit={send}>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { sendImage(e.target.files?.[0]); e.target.value = ''; }} />
                <button type="button" className="chat-btn" disabled={uploading} onClick={() => fileRef.current?.click()} aria-label="Send a photo" title="Send a photo">{uploading ? '…' : <ClipIcon />}</button>
                <label className="sr-only" htmlFor="msg">Message</label>
                <textarea id="msg" ref={input} className="input" rows={1} style={{ resize: 'none', maxHeight: 120 }} placeholder="Write a message…" value={text} maxLength={2000} autoComplete="off" onChange={onType} onKeyDown={onKeyDown} />
                <button className="send-btn" type="submit" disabled={!text.trim()} aria-label="Send message" title="Send"><SendIcon /></button>
              </form>
            </>
          )}
        </Glass>
      </div>
      <p className="faint small center" style={{ marginTop: 8 }}>Last activity {active ? timeAgo(active.lastMessageAt) : ''}. Never share card numbers or passwords in chat.</p>
    </div>
  );
}