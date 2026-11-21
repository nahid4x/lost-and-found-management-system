import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Quote, ReplyBar } from './Quote.jsx';

describe('Quote', () => {
  it('shows who and what, and jumps to the original when pressed', () => {
    const onJump = vi.fn();
    render(<Quote name="Nabil" deletedLabel="Deleted" onJump={onJump}>charger</Quote>);
    expect(screen.getByText('Nabil')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(screen.getByText('charger')).toBeTruthy();
  });
  it('shows the "deleted" label instead of the words when the original is gone', () => {
    render(<Quote name="Nabil" deleted deletedLabel="This message was deleted" onJump={() => {}}>secret</Quote>);
    expect(screen.getByText('This message was deleted')).toBeTruthy();
    expect(screen.queryByText('secret')).toBeNull();
  });
});

describe('ReplyBar', () => {
  it('shows who you answer and can be cancelled', () => {
    const onCancel = vi.fn();
    render(<ReplyBar title="Replying to Nabil" cancelLabel="Cancel reply" onCancel={onCancel}>hello there</ReplyBar>);
    expect(screen.getByText('Replying to Nabil')).toBeTruthy();
    expect(screen.getByText('hello there')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
