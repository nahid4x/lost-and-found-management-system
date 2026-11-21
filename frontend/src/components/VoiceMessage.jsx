import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Loader2 } from 'lucide-react';
import { useToast } from '../context/Toast.jsx';
import { getToken, refresh } from '../lib/api.js';

export const MAX_VOICE_SEC = 120;
const MIN_VOICE_SEC = 1;

const Svg = ({ children }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const WaveIcon = () => <Svg><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" /></Svg>;
const SendIcon = () => <Svg><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Svg>;
const TrashIcon = () => <Svg><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></Svg>;

const BARS = 40;
/** Turns loudness samples into BARS digits (0-9), one per bar. Empty string when there is nothing to show. */
export function toPeaks(levels) {
  if (levels.length < 4) return '';
  const out = [];
  for (let i = 0; i < BARS; i++) {
    const a = Math.floor((i * levels.length) / BARS); const b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / BARS));
    out.push(Math.max(...levels.slice(a, b)));
  }
  const top = Math.max(...out, 0.02);
  return out.map((x) => Math.min(9, Math.round(9 * Math.sqrt(x / top)))).join('');
}
/** Bar heights for a message: the real waveform if we have it, otherwise a steady pattern made from the id. */
const barsFor = (peaks, id = '') => {
  if (/^[0-9]{16,64}$/.test(peaks ?? '')) return [...peaks].map(Number);
  let h = 7; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: BARS }, (_, i) => { h = (h * 1103515245 + 12345 + i) >>> 0; return 2 + (h >>> 16) % 6; });
};

export const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const pickType = () => TYPES.find((t) => window.MediaRecorder?.isTypeSupported?.(t));
export const canRecord = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && pickType());

/**
 * Record button. Tap to start; a bar with a timer, cancel and send covers the composer while recording.
 * `onSend(blob, seconds)` is called with the finished recording. Nothing is uploaded until the person taps send.
 */
export function VoiceRecorder({ onSend, disabled = false }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [secs, setSecs] = useState(0);
  const rec = useRef(null); const stream = useRef(null); const chunks = useRef([]); const timer = useRef(null);
  const ctx = useRef(null); const analyser = useRef(null); const levels = useRef([]);
  const t0 = useRef(0); const keep = useRef(false);

  const release = () => {
    clearInterval(timer.current);
    ctx.current?.close?.().catch?.(() => {}); ctx.current = null; analyser.current = null;
    stream.current?.getTracks().forEach((x) => x.stop());
    stream.current = null; rec.current = null; setOn(false); setSecs(0);
  };
  useEffect(() => () => { keep.current = false; if (rec.current?.state === 'recording') rec.current.stop(); release(); }, []); // leaving the page throws the recording away

  const finish = (send) => {
    const r = rec.current;
    if (!r) return;
    keep.current = send;
    if (r.state === 'recording') r.stop(); else release();
  };

  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch { toast.error(t('chat.micDenied')); return; }
    const mimeType = pickType();
    const r = new MediaRecorder(stream.current, { mimeType });
    chunks.current = [];
    r.ondataavailable = (e) => { if (e.data?.size) chunks.current.push(e.data); };
    r.onstop = () => {
      const seconds = Math.round((Date.now() - t0.current) / 1000);
      const blob = new Blob(chunks.current, { type: mimeType });
      const send = keep.current;
      const peaks = toPeaks(levels.current);
      release();
      if (!send) return;
      if (seconds < MIN_VOICE_SEC || blob.size < 200) { toast.error(t('chat.voiceTooShort')); return; }
      onSend(blob, Math.min(seconds, MAX_VOICE_SEC), peaks);
    };
    levels.current = [];
    try { // listen to the loudness so the message can show a real waveform
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { ctx.current = new AC(); analyser.current = ctx.current.createAnalyser(); analyser.current.fftSize = 512; ctx.current.createMediaStreamSource(stream.current).connect(analyser.current); }
    } catch { analyser.current = null; }
    rec.current = r; keep.current = false; t0.current = Date.now();
    r.start(250);
    setOn(true);
    const buf = new Uint8Array(512);
    timer.current = setInterval(() => {
      if (analyser.current) {
        analyser.current.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2;
        levels.current.push(Math.sqrt(sum / buf.length));
      }
      const s = Math.floor((Date.now() - t0.current) / 1000);
      setSecs(s);
      if (s >= MAX_VOICE_SEC) finish(true);
    }, 100);
  };

  if (!canRecord()) return null;
  if (!on) {
    return <button type="button" className="send-btn" disabled={disabled} onClick={start} aria-label={t('chat.recordVoice')} title={t('chat.recordVoice')}><WaveIcon /></button>;
  }
  return (
    <div className="rec-bar" role="group" aria-label={t('chat.recording')}>
      <button type="button" className="chat-btn trash" onClick={() => finish(false)} aria-label={t('chat.cancelRecording')} title={t('chat.cancelRecording')}><TrashIcon /></button>
      <span className="rec-dot" aria-hidden="true" />
      <span className="rec-time" role="timer">{fmtDur(secs)}</span>
      <span className="faint small rec-hint">{t('chat.recording')}</span>
      <button type="button" className="send-btn" onClick={() => finish(true)} aria-label={t('chat.sendVoice')} title={t('chat.sendVoice')}><SendIcon /></button>
    </div>
  );
}

let playingNow = null; // only one voice message plays at a time

/** A voice message bubble. The audio is fetched with the login token only when played (so only the two people can hear it). */
export function VoiceMessage({ m, convId }) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const audio = useRef(null); const obj = useRef(null);
  const total = m.voice?.durationSec ?? 0;
  useEffect(() => () => { audio.current?.pause(); if (playingNow === audio.current) playingNow = null; if (obj.current) URL.revokeObjectURL(obj.current); }, []);

  const toggle = async () => {
    if (playing) { audio.current.pause(); return; }
    setFailed(false);
    try {
      if (!audio.current) {
        let src = m.localUrl;
        if (!src) {
          setBusy(true);
          const get = () => fetch(`/api/realtime/conversations/${convId}/voice/${m.voice.id}`, { headers: { Authorization: `Bearer ${getToken()}`, 'X-Requested-With': 'findit' }, credentials: 'include' });
          let r = await get();
          if (r.status === 401 && (await refresh())) r = await get();
          if (!r.ok) throw new Error('load');
          src = URL.createObjectURL(await r.blob());
          obj.current = src;
        }
        const a = new Audio(src);
        a.onplay = () => setPlaying(true);
        a.onpause = () => setPlaying(false);
        a.onended = () => { setPlaying(false); setPos(0); };
        a.ontimeupdate = () => setPos(a.currentTime);
        audio.current = a;
      }
      if (playingNow && playingNow !== audio.current) playingNow.pause();
      playingNow = audio.current;
      await audio.current.play();
    } catch { setFailed(true); audio.current = null; } finally { setBusy(false); }
  };

  const pct = total ? Math.min(100, (pos / total) * 100) : 0;
  const bars = barsFor(m.voice?.peaks, m.voice?.id ?? m.id);
  return (
    <span className="voice-msg">
      <button type="button" className="voice-play" onClick={toggle} disabled={busy} aria-label={playing ? t('chat.pauseVoice') : t('chat.playVoice')}>{busy ? <Loader2 size={18} className="spin" /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
      <span className="voice-body">
        <span className="voice-wave" aria-hidden="true">
          {bars.map((v, k) => <i key={k} className={((k + 0.5) / bars.length) * 100 <= pct ? 'done' : ''} style={{ height: `${14 + v * 9}%` }} />)}
          <b className="voice-dot" style={{ left: `${pct}%` }} />
        </span>
        <span className="voice-time">{failed ? t('chat.voiceUnavailable') : fmtDur(playing || pos ? pos : total)}</span>
      </span>
    </span>
  );
}
