import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './ui.jsx';

function EyeIcon({ off }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

/** Password input with a show/hide toggle (accessible: labelled button, aria-pressed, keyboard operable). */
export function PasswordField({ label, error, hint, className, type: _ignored, ...p }) {
  const { t } = useTranslation();
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div className={cx('field', error && 'invalid', className)}>
      {label && <label htmlFor={id}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input id={id} className="input" type={show ? 'text' : 'password'} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} style={{ paddingRight: 52 }} {...p} />
        <button type="button" className="icon-btn" aria-label={show ? t('pwField.hide') : t('pwField.show')} aria-pressed={show} onClick={() => setShow((s) => !s)}
          style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, display: 'grid', placeItems: 'center', color: 'inherit', opacity: 0.7 }}>
          <EyeIcon off={show} />
        </button>
      </div>
      {error ? <span id={`${id}-e`} className="err" role="alert">{error}</span> : hint ? <span id={`${id}-h`} className="hint">{hint}</span> : null}
    </div>
  );
}