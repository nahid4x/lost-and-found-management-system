import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkImages, IMG_TYPES, MAX_IMG_MB } from '../lib/util.js';

/** Drag & drop image picker with client-side type/size checks (the server re-validates by magic bytes). */
export function Dropzone({ files, onChange, max = 5, label }) {
  const { t } = useTranslation();
  const text = label ?? t('dz.label');
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState([]);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  const add = (list) => {
    const r = checkImages([...files, ...list], max);
    setErrors(r.errors); onChange(r.files);
  };
  return (
    <div>
      <div className={`drop ${over ? 'over' : ''}`} role="button" tabIndex={0} aria-label={text}
        onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}>
        <div style={{ fontSize: '2rem' }} aria-hidden>🖼️</div><strong>{text}</strong>
        <div className="hint">{t('dz.hint', { mb: MAX_IMG_MB, max })}</div>
        <input ref={input} type="file" accept={IMG_TYPES.join(',')} multiple hidden onChange={(e) => { add([...e.target.files]); e.target.value = ''; }} />
      </div>
      {errors.map((e) => <div key={e} className="err" role="alert">{e}</div>)}
      {!!files.length && (
        <div className="previews">
          {files.map((f, i) => (
            <div key={f.name + i}><img src={previews[i]} alt={t('dz.selected', { n: i + 1 })} />
              <button type="button" className="icon-btn" style={{ width: 28, height: 28, fontSize: 12 }} aria-label={t('dz.remove', { n: i + 1 })} onClick={() => onChange(files.filter((_, k) => k !== i))}>✕</button></div>
          ))}
        </div>
      )}
    </div>
  );
}