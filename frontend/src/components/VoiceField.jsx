import { Field } from './ui.jsx';
import VoiceInput from './VoiceInput.jsx';
import '../styles/voice.css';

/** A text field with a mic button inside it: press, speak, and the words are typed in. */
export default function VoiceField({ value, onText, maxLength = 100, ...p }) {
  return (
    <div className="voice-field">
      <Field {...p} value={value} maxLength={maxLength} onChange={(e) => onText(e.target.value)} />
      <VoiceInput value={value} onChange={onText} max={maxLength} />
    </div>
  );
}
