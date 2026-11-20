import { STATUS_META } from '../../pages/reports/reportUtils';

export default function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.submitted;
  return <span className={`rp-badge rp-badge--${m.tone}`}>{m.label}</span>;
}
