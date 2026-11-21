/** Helpers for answering ("replying to") a chat message. */
export const MAX_QUOTE = 140;

/** The short copy of a message that travels with a reply, same shape the server sends back. */
export const quoteOf = (m) => ({ id: m.id, sender: m.sender, kind: m.kind ?? 'text', text: String(m.text ?? '').slice(0, MAX_QUOTE), deleted: false });

/** After a message is deleted, every quote of it stops showing its words. */
export const quotesDeleted = (list, id) => list.map((m) => (m.replyTo?.id === id ? { ...m, replyTo: { ...m.replyTo, deleted: true, text: '' } } : m));

/** Only messages that really exist can be answered: not unsent, failed or deleted ones. */
export const canReply = (m) => !m.pending && !m.failed && !m.deleted;
