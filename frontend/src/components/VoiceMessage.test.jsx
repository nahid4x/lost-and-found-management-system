import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VoiceRecorder, VoiceMessage, canRecord, fmtDur, toPeaks } from './VoiceMessage.jsx';

const error = vi.fn();
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('../context/Toast.jsx', () => ({ useToast: () => ({ error }) }));
vi.mock('../lib/api.js', () => ({ getToken: () => 'tok', refresh: async () => false }));

const stopTrack = vi.fn();
class FakeRecorder {
  static isTypeSupported(t) { return t === 'audio/webm;codecs=opus'; }
  constructor() { this.state = 'inactive'; }
  start() { this.state = 'recording'; this.ondataavailable?.({ data: new Blob([new Uint8Array(500)]) }); }
  stop() { this.state = 'inactive'; this.onstop?.(); }
}
const allow = () => {
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) } });
};

beforeEach(() => { error.mockClear(); stopTrack.mockClear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete navigator.mediaDevices; });

describe('VoiceRecorder', () => {
  it('shows nothing when the browser cannot record', () => {
    expect(canRecord()).toBe(false);
    const { container } = render(<VoiceRecorder onSend={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('records, shows the timer, and hands the audio over when sent', async () => {
    allow();
    const onSend = vi.fn();
    render(<VoiceRecorder onSend={onSend} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('chat.recordVoice')); });
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole('timer').textContent).toBe('0:03');
    await act(async () => { fireEvent.click(screen.getByLabelText('chat.sendVoice')); });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0].type).toBe('audio/webm;codecs=opus');
    expect(onSend.mock.calls[0][1]).toBe(3);
    expect(stopTrack).toHaveBeenCalled(); // microphone released
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('cancel throws the recording away, and a too-short one is not sent', async () => {
    allow();
    const onSend = vi.fn();
    render(<VoiceRecorder onSend={onSend} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('chat.recordVoice')); });
    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { fireEvent.click(screen.getByLabelText('chat.cancelRecording')); });
    expect(onSend).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByLabelText('chat.recordVoice')); });
    await act(async () => { fireEvent.click(screen.getByLabelText('chat.sendVoice')); });
    expect(onSend).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('chat.voiceTooShort');
  });

  it('explains when the microphone is blocked', async () => {
    allow();
    navigator.mediaDevices.getUserMedia = vi.fn(async () => { throw new Error('denied'); });
    render(<VoiceRecorder onSend={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('chat.recordVoice')); });
    expect(error).toHaveBeenCalledWith('chat.micDenied');
    expect(screen.queryByRole('timer')).toBeNull();
  });
});

describe('VoiceMessage', () => {
  it('shows the length and a play button', () => {
    render(<VoiceMessage m={{ voice: { id: 'v1', durationSec: 65 } }} convId="c1" />);
    expect(screen.getByText('1:05')).toBeTruthy();
    expect(screen.getByLabelText('chat.playVoice')).toBeTruthy();
  });
  it('draws one bar per slice of the waveform and marks how far it has played', () => {
    const { container } = render(<VoiceMessage m={{ voice: { id: 'v1', durationSec: 5, peaks: '0123456789012345678901234567890123456789' } }} convId="c1" />);
    expect(container.querySelectorAll('.voice-wave i')).toHaveLength(40);
    expect(container.querySelectorAll('.voice-wave i.done')).toHaveLength(0);
  });
  it('turns loudness samples into 40 digits, loudest = 9, and skips tiny recordings', () => {
    expect(toPeaks([0.1, 0.2])).toBe('');
    const p = toPeaks(Array.from({ length: 200 }, (_, i) => (i === 100 ? 0.8 : 0.05)));
    expect(p).toMatch(/^[0-9]{40}$/);
    expect(p).toContain('9');
  });
  it('formats times', () => { expect(fmtDur(0)).toBe('0:00'); expect(fmtDur(125)).toBe('2:05'); });
});
