const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const { upload, saveImages } = require('../middleware/upload');
const { notify } = require('../utils/notify');
const { clean } = require('../utils/text');
const { CATEGORIES, TARGET_TYPES } = require('../categories');

router.use(auth);

const createLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'You reached the limit of 10 reports per day. Try again tomorrow.' }
});

const view = (doc, isAdmin) => {
  const r = doc.toObject();
  // eslint-disable-next-line no-unused-vars
  if (!isAdmin) r.timeline = r.timeline.map(({ internalNote, by, ...t }) => t);
  return r;
};
const bad = (res, msg) => res.status(400).json({ error: msg });

// Create a report
router.post('/', createLimiter, upload.array('images', 3), async (req, res, next) => {
  try {
    const { targetType, targetId, targetLabel, category, subReason } = req.body;
    if (!TARGET_TYPES.includes(targetType)) return bad(res, 'Choose what you are reporting.');
    const cat = CATEGORIES[category];
    if (!cat) return bad(res, 'Choose a category.');
    if (!cat.subs.includes(subReason)) return bad(res, 'Choose a reason from the list.');
    const description = clean(req.body.description);
    if (description.length < 10) return bad(res, 'Describe the problem in at least 10 characters.');
    if (targetType === 'user' && targetId === req.user.id) return bad(res, 'You cannot report yourself.');

    if (targetId) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const dup = await Report.findOne({
        reporter: req.user.id, targetType, targetId: String(targetId), createdAt: { $gte: since }
      });
      if (dup) return res.status(409).json({ error: `You already reported this today (${dup.ticketId}).` });
    }

    const images = await saveImages(req.files);
    const report = await Report.create({
      ticketId: await Report.nextTicket(),
      reporter: req.user.id,
      targetType, targetId: targetId ? String(targetId) : undefined,
      targetLabel: clean(targetLabel, 120),
      category, subReason, description, images,
      priority: ['harassment', 'privacy', 'scam'].includes(category) ? 'high' : 'medium',
      timeline: [{ status: 'submitted', note: 'We received your report.' }]
    });

    await notify({
      user: req.user.id, title: `Report ${report.ticketId} received`,
      message: 'We will review it and update you here.', link: `/reports/${report._id}`
    });
    res.status(201).json(view(report, false));
  } catch (e) { next(e); }
});

// My reports
router.get('/mine', async (req, res, next) => {
  try {
    const list = await Report.find({ reporter: req.user.id }).sort({ createdAt: -1 }).limit(100);
    res.json(list.map((r) => view(r, false)));
  } catch (e) { next(e); }
});

// Notification fallback (used only when NOTIFICATION_URL is not set)
router.get('/notifications', async (req, res, next) => {
  try { res.json(await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50)); }
  catch (e) { next(e); }
});
router.patch('/notifications/read', async (req, res, next) => {
  try { await Notification.updateMany({ user: req.user.id, read: false }, { read: true }); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// One report (owner or admin)
router.get('/:id', async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ error: 'Report not found.' });
    const r = await Report.findById(req.params.id);
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);
    if (!r || (r.reporter !== req.user.id && !isAdmin)) return res.status(404).json({ error: 'Report not found.' });
    res.json(view(r, isAdmin));
  } catch (e) { next(e); }
});

module.exports = router;