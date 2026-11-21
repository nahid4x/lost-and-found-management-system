import { useState } from 'react';
import ReportModal from './ReportModal';

/** Drop into any item card, claim, chat message or profile:
 *  <ReportButton type="item" id={item._id} label={item.title} /> */
export default function ReportButton({ type, id, label, children = 'Report' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="rp-link-btn" onClick={() => setOpen(true)}>{children}</button>
      <ReportModal open={open} onClose={() => setOpen(false)} target={{ type, id, label }} />
    </>
  );
}
