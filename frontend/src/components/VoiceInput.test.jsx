import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const error = vi.fn();
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: 'bn' } }) }));
vi.mock('../context/Toast.jsx', () => ({ useToast: () => ({ error }) }));

let made;
class FakeRecognition {
  constructor() { made = this; this.started = false; }
  start() { this.started = true; }
  stop() { this.started = false; this.onend?.(); }
  abort() { this.started = false; this.onend?.(); }
}
const say = (r, ...parts) => r.onresult({ results: parts.map((p) => [{ transcript: p }]) });

beforeEach(() => { vi.resetModules(); error.mockClear(); made = null; });
afterEach(() => { vi.unstubAllGlobals(); delete window.SpeechRecognition; });

describe('VoiceInput', () => {
  it('renders nothing when the browser has no speech recognition', async () => {
    const { default: VoiceInput } = await import('./VoiceInput.jsx');
    const { container } = render(<VoiceInput value="" onChange={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
  });
  it('types what is said after the text already in the box, in the chosen language', async () => {
    window.SpeechRecognition = FakeRecognition;
    const { default: VoiceInput } = await import('./VoiceInput.jsx');
    const onChange = vi.fn();
    render(<VoiceInput value="Hello" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'chat.voiceStart' }));
    expect(made.started).toBe(true);
    expect(made.lang).toBe('bn-BD');
    say(made, 'I lost', ' my wallet');
    expect(onChange).toHaveBeenLastCalledWith('Hello I lost my wallet');
    expect(screen.getByRole('button', { name: 'chat.voiceStop' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'chat.voiceStop' }));
    expect(made.started).toBe(false);
  });
  it('explains a blocked microphone and ignores silence', async () => {
    window.SpeechRecognition = FakeRecognition;
    const { default: VoiceInput } = await import('./VoiceInput.jsx');
    render(<VoiceInput value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    made.onerror({ error: 'no-speech' });
    expect(error).not.toHaveBeenCalled();
    made.onerror({ error: 'not-allowed' });
    expect(error).toHaveBeenCalledWith('chat.voiceDenied');
  });
});
