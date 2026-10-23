import { useState } from 'react';
import { catEmoji } from '../lib/util.js';

export function Gallery({ images, category }) {
  const [i, setI] = useState(0);
  if (!images?.length) return <div className="gallery"><div className="main" style={{ display: 'grid', placeItems: 'center', fontSize: '4rem' }} aria-hidden>{catEmoji(category)}</div></div>;
  return (
    <div className="gallery">
      <div className="main"><img src={images[i]} alt={`Photo ${i + 1} of ${images.length}`} /></div>
      {images.length > 1 && (
        <div className="thumbs">{images.map((src, k) => <button key={src + k} aria-label={`Show photo ${k + 1}`} aria-current={k === i} onClick={() => setI(k)}><img src={src} alt="" loading="lazy" /></button>)}</div>
      )}
    </div>
  );
}
