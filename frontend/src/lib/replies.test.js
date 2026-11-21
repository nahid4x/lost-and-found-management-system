import { describe, it, expect } from 'vitest';
import { MAX_QUOTE, canReply, quoteOf, quotesDeleted } from './replies.js';

describe('quoteOf', () => {
  it('keeps who, what kind and a short copy of the words', () => {
    expect(quoteOf({ id: 'm1', sender: 'u1', kind: 'voice', text: '🎤 Voice message', extra: 'x' })).toEqual({ id: 'm1', sender: 'u1', kind: 'voice', text: '🎤 Voice message', deleted: false });
    expect(quoteOf({ id: 'm2', sender: 'u2', text: 'a'.repeat(500) }).text).toHaveLength(MAX_QUOTE);
    expect(quoteOf({ id: 'm3', sender: 'u2' })).toMatchObject({ kind: 'text', text: '' });
  });
});

describe('quotesDeleted', () => {
  it('clears the words of every quote of the deleted message and nothing else', () => {
    const list = [
      { id: 'a', text: 'hi' },
      { id: 'b', text: 'ok', replyTo: { id: 'a', sender: 'u1', kind: 'text', text: 'hi', deleted: false } },
      { id: 'c', text: 'ok2', replyTo: { id: 'x', sender: 'u1', kind: 'text', text: 'other', deleted: false } },
    ];
    const out = quotesDeleted(list, 'a');
    expect(out[1].replyTo).toEqual({ id: 'a', sender: 'u1', kind: 'text', text: '', deleted: true });
    expect(out[2]).toBe(list[2]);
    expect(out[0]).toBe(list[0]);
    expect(list[1].replyTo.deleted).toBe(false); // the old list is not changed
  });
});

describe('canReply', () => {
  it('is false for unsent, failed and deleted messages', () => {
    expect(canReply({ id: 'a' })).toBe(true);
    expect(canReply({ pending: true })).toBe(false);
    expect(canReply({ failed: true })).toBe(false);
    expect(canReply({ deleted: true })).toBe(false);
  });
});
