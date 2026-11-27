import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Clock } from 'lucide-react';
import { Glass, Chip } from './ui.jsx';
import { CatIcon } from './Icons';
import PostActions from './PostActions.jsx';
import { catLabel, timeAgo, STATUS_FLOW } from '../lib/util.js';

export function ItemCard({ item }) {
  const { t } = useTranslation();
  return (
    <Glass hover className={`card card-${item.type}`}>
      <Link
        to={`/items/${item.id}`}
        className="card-link"
        aria-label={t('item.cardLabel', { type: t(`item.type_${item.type}`, { defaultValue: item.type }), title: item.title })}
      >
        <div className="thumb">
          {item.images?.[0] ? <img src={item.images[0]} alt="" loading="lazy" decoding="async" /> : <span aria-hidden><CatIcon category={item.category} size={40} strokeWidth={1.5} /></span>}
          <div className="thumb-shade" aria-hidden="true" />
          <div className="thumb-badges"><Chip kind={item.status} /></div>
          <span className="thumb-time"><Clock size={14} aria-hidden="true" /> {timeAgo(item.createdAt)}</span>
        </div>
        <div className="body">
          <h3>{item.title}</h3>
          <span className="card-cat"><CatIcon category={item.category} size={14} /> {catLabel(item.category)}</span>
          <div className="meta"><span><MapPin size={14} aria-hidden="true" /> {item.area?.label}</span></div>
        </div>
      </Link>
      <PostActions item={item} />
    </Glass>
  );
}

export function MatchRing({ score }) {
  const { t } = useTranslation();
  const c = score >= 75 ? 'var(--green)' : score >= 55 ? 'var(--teal)' : 'var(--amber)';
  return <div className="ring" style={{ '--p': score, '--c': c }} role="img" aria-label={t('item.match', { score: Math.round(score) })}>{Math.round(score)}%</div>;
}

/** Status timeline; with history (owner) it shows who/when, otherwise the generic progression. */
export function Timeline({ status, history }) {
  const { t } = useTranslation();
  const idx = STATUS_FLOW.indexOf(status);
  return (
    <ol className="timeline" aria-label={t('item.statusLabel')} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {STATUS_FLOW.map((s, i) => {
        const h = history?.find((x) => x.to === s);
        return (
          <li key={s} className={`tl ${i <= idx ? 'done' : ''} ${i === idx ? 'now' : ''}`} aria-current={i === idx ? 'step' : undefined}>
            <i />{t(`status.${s}`, { defaultValue: s })}{h && <div className="faint" style={{ fontSize: '0.7rem' }}>{timeAgo(h.at)}</div>}
          </li>
        );
      })}
    </ol>
  );
}