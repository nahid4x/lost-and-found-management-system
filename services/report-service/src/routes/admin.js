const router = require('express').Router();
const Report = require('../models/Report');
const { auth, requireAdmin } = require('../middleware/auth');
const { notify } = require('../utils/notify');
const { clean, escapeRegex } = require('../utils/text');
const { STATUSES, PRIORITIES, CATEGORIES } = require('../categories');

router.use(auth, requireAdmin);

const LABEL = {
  submitted: 'Submitted', under_review: 'Under review', needs_info: 'More information needed',
  resolved: 'Resolved', rejected: 'Closed without action'
};
const NEEDS_NOTE = ['needs_info', 'resolved', 'rejected'];

router.get('/stats', async (_req, res, next) => {
  try {
    const rows = await Report.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    const out = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    rows.forEach((r) => { out[r._id] = r.n; });
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const { status, category, priority, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const f = {};
    if (STATUSES.includes(status)) f.status = status;
    if (CATEGORIES[category]) f.category = category;
    if (PRIORITIES.includes(priority)) f.priority = priority;
    if (q) f.ticketId = new RegExp(escapeRegex(String(q).slice(0, 20)), 'i');
    const [items, total] = await Promise.all([
      Report.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Report.countDocuments(f)
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const note = clean(req.body.note);
    const internalNote = clean(req.body.internalNote);
    if (NEEDS_NOTE.includes(status) && !note) {
      return res.status(400).json({ error: 'Write feedback for the user before saving this status.' });
    }
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ error: 'Report not found.' });
    const r = await Report.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Report not found.' });

    r.status = status;
    if (PRIORITIES.includes(req.body.priority)) r.priority = req.body.priority;
    r.timeline.push({ status, note, internalNote, by: req.user.id });
    await r.save();

    await notify({
      user: r.reporter,
      title: `Report ${r.ticketId}: ${LABEL[status]}`,
      message: note || 'Your report is now being reviewed.',
      link: `/reports/${r._id}`
    });
    res.json(r);
  } catch (e) { next(e); }
});

module.exports = router;
