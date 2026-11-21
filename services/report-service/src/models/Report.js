const mongoose = require('mongoose');
const { STATUSES, PRIORITIES, TARGET_TYPES } = require('../categories');

const Counter = mongoose.models.Counter || mongoose.model('Counter',
  new mongoose.Schema({ _id: String, seq: { type: Number, default: 1000 } }));

const timelineSchema = new mongoose.Schema({
  status: { type: String, enum: STATUSES },
  note: { type: String, maxlength: 1000 },          // visible to the reporter
  internalNote: { type: String, maxlength: 1000 },  // admin only, never sent to users
  by: String,
  at: { type: Date, default: Date.now }
}, { _id: false });

const reportSchema = new mongoose.Schema({
  ticketId: { type: String, unique: true, index: true },
  reporter: { type: String, required: true, index: true },
  targetType: { type: String, enum: TARGET_TYPES, required: true },
  targetId: { type: String },
  targetLabel: { type: String, maxlength: 120 },
  category: { type: String, required: true },
  subReason: { type: String, required: true },
  description: { type: String, required: true, maxlength: 1000 },
  images: [{ url: String, _id: false }],
  status: { type: String, enum: STATUSES, default: 'submitted', index: true },
  priority: { type: String, enum: PRIORITIES, default: 'medium' },
  timeline: [timelineSchema]
}, { timestamps: true });

reportSchema.index({ status: 1, priority: -1, createdAt: -1 });
reportSchema.index({ reporter: 1, targetType: 1, targetId: 1, createdAt: -1 });

reportSchema.statics.nextTicket = async function () {
  const c = await Counter.findByIdAndUpdate('report', { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `FR-${c.seq}`;
};

module.exports = mongoose.model('Report', reportSchema);
