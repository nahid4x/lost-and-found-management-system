import { useState } from 'react';
import { CatIcon } from './Icons';

export function Gallery({ images, category }) {
  const [i, setI] = useState(0);
  if (!images?.length) {
    return (
      <div className="gallery">
        <div className="main" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted, #8b93c9)' }} aria-hidden>
          <CatIcon category={category} size={72} strokeWidth={1.25} />
        </div>
      </div>
    );
  }
  return (
    <div className="gallery">
      <div className="main"><img src={images[i]} alt={`Photo ${i + 1} of ${images.length}`} /></div>
      {images.length > 1 && (
        <div className="thumbs">{images.map((src, k) => <button key={src + k} aria-label={`Show photo ${k + 1}`} aria-current={k === i} onClick={() => setI(k)}><img src={src} alt="" loading="lazy" /></button>)}</div>
      )}
    </div>
  );
}