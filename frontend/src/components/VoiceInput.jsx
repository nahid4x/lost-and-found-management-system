import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../context/Toast.jsx';

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
  </svg>
);

/** Mic button for the message box: press, speak, and the words are typed in. Hidden when the browser has no speech recognition. */
export default function VoiceInput({ value, onChange, disabled = false, max = 2000 }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [on, setOn] = useState(false);
  const rec = useRef(null);
  const base = useRef(''); // what was already in the box when listening started
  const latest = useRef(value); latest.current = value;
  const prev = useRef(value);

  useEffect(() => () => { rec.current?.abort(); }, []); // leaving the page turns the mic off
  useEffect(() => { if (disabled) rec.current?.abort(); }, [disabled]);
  useEffect(() => { // the message was sent (box emptied): stop, so old words do not come back
    if (rec.current && prev.current && value === '') rec.current.abort();
    prev.current = value;
  }, [value]);

  if (!Recognition) return null;

  const start = () => {
    const r = new Recognition();
    r.lang = i18n.language === 'bn' ? 'bn-BD' : 'en-US';
    r.continuous = true; r.interimResults = true;
    base.current = latest.current.trim();
    r.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i += 1) said += e.results[i][0].transcript;
      onChange(`${base.current} ${said}`.trim().slice(0, max));
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast.error(t('chat.voiceDenied'));
      else if (e.error === 'network') toast.error(t('chat.voiceNetwork'));
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast.error(t('chat.voiceFail'));
    };
    r.onend = () => { setOn(false); if (rec.current === r) rec.current = null; };
    rec.current = r; setOn(true);
    try { r.start(); } catch { setOn(false); rec.current = null; }
  };

  const label = on ? t('chat.voiceStop') : t('chat.voiceStart');
  return (
    <button type="button" className={`chat-btn mic-btn${on ? ' listening' : ''}`} disabled={disabled} aria-pressed={on} aria-label={label} title={label} onClick={() => (on ? rec.current?.stop() : start())}>
      <MicIcon />
    </button>
  );
}