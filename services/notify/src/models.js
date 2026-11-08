import { mongoose } from '@findit/shared/db';
const { Schema } = mongoose;

const notifSchema = new Schema({
  user: { type: String, required: true },
  type: { type: String, enum: ['match', 'claim', 'message', 'item'], required: true },
  title: { type: String, maxlength: 140 }, body: { type: String, maxlength: 300 },
  payload: Schema.Types.Mixed, readAt: Date,
}, { timestamps: true });
notifSchema.index({ user: 1, readAt: 1, createdAt: -1 });
export const Notification = mongoose.models.Notification || mongoose.model('Notification', notifSchema);

const flags = (def) => ({ match: { type: Boolean, default: def }, claim: { type: Boolean, default: def }, message: { type: Boolean, default: def } });
const prefSchema = new Schema({
  user: { type: String, required: true, unique: true },
  inApp: flags(true), email: flags(true),
  emailWhenOnline: { type: Boolean, default: false }, // opt-in: also email while the user is online
}, { timestamps: true });
export const Preference = mongoose.models.Preference || mongoose.model('Preference', prefSchema);

export const notifView = (n) => ({ id: String(n._id), type: n.type, title: n.title, body: n.body, payload: n.payload, readAt: n.readAt ?? null, createdAt: n.createdAt });
export const prefView = (p) => ({ inApp: { match: p.inApp.match, claim: p.inApp.claim, message: p.inApp.message }, email: { match: p.email.match, claim: p.email.claim, message: p.email.message }, emailWhenOnline: p.emailWhenOnline });
