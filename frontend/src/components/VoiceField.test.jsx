import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: 'en' } }) }));
vi.mock('../context/Toast.jsx', () => ({ useToast: () => ({ error: vi.fn() }) }));

let made;
class FakeRecognition {
  constructor() { made = this; this.started = false; }
  start() { this.started = true; }
  stop() { this.started = false; this.onend?.(); }
  abort() { this.started = false; this.onend?.(); }
}

beforeEach(() => { vi.resetModules(); made = null; });
afterEach(() => { delete window.SpeechRecognition; });

describe('VoiceField', () => {
  it('still works as a normal text field when the browser cannot listen', async () => {
    const { default: VoiceField } = await import('./VoiceField.jsx');
    const onText = vi.fn();
    render(<VoiceField label="Search" value="" onText={onText} />);
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'keys' } });
    expect(onText).toHaveBeenCalledWith('keys');
  });
  it('types what is said after the words already in the field, up to maxLength', async () => {
    window.SpeechRecognition = FakeRecognition;
    const { default: VoiceField } = await import('./VoiceField.jsx');
    const onText = vi.fn();
    render(<VoiceField label="Search" value="black" maxLength={12} onText={onText} />);
    fireEvent.click(screen.getByRole('button', { name: 'chat.voiceStart' }));
    expect(made.lang).toBe('en-US');
    made.onresult({ results: [[{ transcript: 'wallet and phone' }]] });
    expect(onText).toHaveBeenLastCalledWith('black wallet');
  });
});
