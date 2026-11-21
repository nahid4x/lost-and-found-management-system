const EVT = 'comments-changed';
const key = (itemId) => `comments-${itemId}`;
const HIDDEN = 'hidden-comments';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const REACTIONS = [
  { key: 'like', emoji: '👍', label: 'Like' },
  { key: 'love', emoji: '❤️', label: 'Love' },
  { key: 'haha', emoji: '😆', label: 'Haha' },
  { key: 'wow', emoji: '😮', label: 'Wow' },
  { key: 'sad', emoji: '😢', label: 'Sad' },
  { key: 'angry', emoji: '😡', label: 'Angry' },
];

function read(itemId) {
  try {
    const raw = localStorage.getItem(key(itemId));
    if (raw) return JSON.parse(raw);
    // ager inline comment gulo ekbar migrate hobe
    const old = JSON.parse(localStorage.getItem(`post-${itemId}`) || '{}');
    return (old.comments || []).map((c) => ({
      id: uid(), itemId, parentId: null, replyToName: null,
      userId: 'local-user', userName: 'You', userAvatar: null, anonymous: false,
      text: c.text, createdAt: new Date(c.id).toISOString(), reactions: {},
    }));
  } catch { return []; }
}

function write(itemId, list) {
  try { localStorage.setItem(key(itemId), JSON.stringify(list)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT, { detail: itemId }));
}

export const listComments = (itemId) => read(itemId);

export function addComment(itemId, { text, parentId = null, replyToName = null, user, anonymous = false }) {
  const c = {
    id: uid(), itemId, parentId, replyToName,
    userId: user.id, userName: user.name, userAvatar: user.avatar || null,
    anonymous, text, createdAt: new Date().toISOString(), reactions: {},
  };
  write(itemId, [...read(itemId), c]);
  return c;
}

export function deleteComment(itemId, id) {
  write(itemId, read(itemId).filter((c) => c.id !== id && c.parentId !== id));
}

export function toggleReaction(itemId, id, userId, reactionKey) {
  write(itemId, read(itemId).map((c) => {
    if (c.id !== id) return c;
    const reactions = { ...c.reactions };
    if (reactions[userId] === reactionKey) delete reactions[userId];
    else reactions[userId] = reactionKey;
    return { ...c, reactions };
  }));
}

export function getHidden() {
  try { return JSON.parse(localStorage.getItem(HIDDEN)) || []; } catch { return []; }
}

export function setHidden(itemId, id, hide) {
  const set = new Set(getHidden());
  hide ? set.add(id) : set.delete(id);
  try { localStorage.setItem(HIDDEN, JSON.stringify([...set])); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT, { detail: itemId }));
}

export function subscribe(itemId, cb) {
  const onEvt = (e) => { if (e.detail === itemId) cb(); };
  window.addEventListener(EVT, onEvt);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVT, onEvt); window.removeEventListener('storage', cb); };
}