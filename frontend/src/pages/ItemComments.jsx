import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { timeAgo } from '../lib/util.js';
import * as store from '../lib/commentsStore.js';
import * as AuthCtx from '../context/Auth.jsx';
import AnonIcon from '../components/AnonIcon.jsx';

// Logged-in user. Tomar Auth.jsx-er shape onujayi field name gulo guess kora ache;
// nam/avatar thik na ashle ekhane field name milao.
function useMe() {
  const auth = AuthCtx.useAuth ? AuthCtx.useAuth() : null;
  const u = auth?.user || auth?.me || auth?.currentUser || null;
  if (!u) return { id: 'local-user', name: 'You', avatar: null };
  return {
    id: u.id || u._id,
    name: u.name || u.fullName || u.username || 'User',
    avatar: u.avatar || u.avatarUrl || u.photo || null,
  };
}

// Profile link. Ekhon shudhu nijer profile ache (/profile).
// Onno user-er profile page toiri hole `return `/users/${c.userId}`` korle shobar link kaj korbe.
function profilePath(c, me) {
  if (c.anonymous) return null;
  return c.userId === me.id ? '/profile' : null;
}

const nameOf = (c) => (c.anonymous ? 'Anonymous' : c.userName);

function useComments(itemId) {
  const [list, setList] = useState(() => store.listComments(itemId));
  const [hidden, setHidden] = useState(() => store.getHidden());
  useEffect(() => {
    const sync = () => { setList(store.listComments(itemId)); setHidden(store.getHidden()); };
    sync();
    return store.subscribe(itemId, sync);
  }, [itemId]);
  return { list, hidden };
}

function Avatar({ c, me }) {
  if (c.anonymous) return <span className="cm-av cm-anon" aria-hidden="true"><AnonIcon size={20} /></span>;
  const inner = c.userAvatar
    ? <img src={c.userAvatar} alt="" />
    : <span>{(c.userName || '?')[0].toUpperCase()}</span>;
  const path = profilePath(c, me);
  return path
    ? <Link to={path} className="cm-av" aria-label={`${c.userName} profile`}>{inner}</Link>
    : <span className="cm-av">{inner}</span>;
}

function Composer({ placeholder, onSubmit, onCancel, autoFocus }) {
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    onSubmit(v, anon);
    setText('');
    onCancel?.();
  };
  return (
    <form className="cm-composer" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
      <label className="cm-anon-toggle">
        <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Anonymous
      </label>
      <button type="submit" className="cm-send">Send</button>
      {onCancel && <button type="button" className="cm-link" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

function Comment({ c, root, replies = [], me, itemId, hidden }) {
  const [replying, setReplying] = useState(false);
  const [picker, setPicker] = useState(false);
  const isMine = c.userId === me.id;
  const mineKey = c.reactions?.[me.id];
  const mineReaction = store.REACTIONS.find((r) => r.key === mineKey);

  if (hidden.includes(c.id)) {
    return (
      <div className="cm-hidden">
        Comment hidden.{' '}
        <button type="button" className="cm-link" onClick={() => store.setHidden(itemId, c.id, false)}>Unhide</button>
      </div>
    );
  }

  const counts = {};
  Object.values(c.reactions || {}).forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const top = store.REACTIONS.filter((r) => counts[r.key]).sort((a, b) => counts[b.key] - counts[a.key]).slice(0, 3);

  const react = (k) => { store.toggleReaction(itemId, c.id, me.id, k); setPicker(false); };
  const remove = () => {
    if (window.confirm('Delete this comment? Replies o delete hoye jabe.')) store.deleteComment(itemId, c.id);
  };

  const path = profilePath(c, me);
  const label = c.anonymous ? `Anonymous${isMine ? ' (you)' : ''}` : c.userName;

  return (
    <div className="cm-item">
      <Avatar c={c} me={me} />
      <div className="cm-main">
        <div className="cm-bubble">
          <div className="cm-name">
            {path ? <Link to={path}><b>{label}</b></Link> : <b>{label}</b>}
          </div>
          <p>{c.replyToName && <span className="cm-mention">{c.replyToName} </span>}{c.text}</p>
          {total > 0 && (
            <span className="cm-summary" title={`${total} reaction`}>
              {top.map((r) => r.emoji).join('')} {total}
            </span>
          )}
        </div>

        <div className="cm-actions">
          <span className="cm-react-wrap" onMouseEnter={() => setPicker(true)} onMouseLeave={() => setPicker(false)}>
            {picker && (
              <span className="cm-picker">
                {store.REACTIONS.map((r) => (
                  <button key={r.key} type="button" title={r.label} onClick={() => react(r.key)}>{r.emoji}</button>
                ))}
              </span>
            )}
            <button type="button" className={`cm-link ${mineReaction ? 'on' : ''}`} onClick={() => react(mineKey || 'like')}>
              {mineReaction ? mineReaction.label : 'Like'}
            </button>
          </span>
          <button type="button" className="cm-link" onClick={() => setReplying((v) => !v)}>Reply</button>
          <button type="button" className="cm-link" onClick={() => store.setHidden(itemId, c.id, true)}>Hide</button>
          {isMine && <button type="button" className="cm-link danger" onClick={remove}>Delete</button>}
          <span className="cm-time">{timeAgo(c.createdAt)}</span>
        </div>

        {replying && (
          <Composer
            autoFocus
            placeholder={`Reply to ${nameOf(c)}...`}
            onCancel={() => setReplying(false)}
            onSubmit={(text, anonymous) =>
              store.addComment(itemId, { text, parentId: root ? root.id : c.id, replyToName: nameOf(c), user: me, anonymous })}
          />
        )}

        {replies.length > 0 && (
          <div className="cm-replies">
            {replies.map((r) => (
              <Comment key={r.id} c={r} root={c} me={me} itemId={itemId} hidden={hidden} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ItemComments() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const { list, hidden } = useComments(id);

  const roots = list.filter((c) => !c.parentId);
  const repliesOf = (rid) => list.filter((c) => c.parentId === rid);

  return (
    <div className="cm-page">
      <div className="cm-head">
        <button type="button" className="cm-back" onClick={() => navigate(-1)}>← Back</button>
        <h2>Comments ({list.length})</h2>
        <Link to={`/items/${id}`} className="cm-link">View item</Link>
      </div>

      <div className="cm-box">
        <Composer
          placeholder="Write a comment..."
          onSubmit={(text, anonymous) => store.addComment(id, { text, user: me, anonymous })}
        />
      </div>

      <div className="cm-list">
        {roots.length === 0 && <p className="cm-empty">No comments yet. Be the first!</p>}
        {roots.map((c) => (
          <Comment key={c.id} c={c} replies={repliesOf(c.id)} me={me} itemId={id} hidden={hidden} />
        ))}
      </div>
    </div>
  );
}