import { X } from 'lucide-react';

/** The small quoted message shown inside a reply bubble. Pressing it jumps to the original message. */
export function Quote({ name, deleted, deletedLabel, onJump, children }) {
  return (
    <button type="button" className="quote" onClick={onJump}>
      <strong>{name}</strong>
      <span>{deleted ? <em>{deletedLabel}</em> : children}</span>
    </button>
  );
}

/** The bar above the writing box while you are answering a message. */
export function ReplyBar({ title, cancelLabel, onCancel, children }) {
  return (
    <div className="reply-bar" role="group" aria-label={title}>
      <div className="reply-text"><strong>{title}</strong><span>{children}</span></div>
      <button type="button" className="chat-btn" onClick={onCancel} aria-label={cancelLabel} title={cancelLabel}><X size={16} aria-hidden="true" /></button>
    </div>
  );
}
