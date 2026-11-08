import { mongoose } from '@findit/shared/db';
const { Schema } = mongoose;

const convSchema = new Schema({
  participants: { type: [String], required: true, validate: { validator: (v) => v.length === 2 && v[0] !== v[1], message: 'exactly two distinct participants' } },
  names: { type: Schema.Types.Mixed, default: {} },
  itemId: String, itemTitle: String,
  pairKey: { type: String, required: true, unique: true },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });
convSchema.index({ participants: 1, lastMessageAt: -1 });
export const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', convSchema);

const msgSchema = new Schema({
  conversation: { type: String, required: true },
  sender: { type: String, required: true },
  text: { type: String, required: true, maxlength: 2000 },
  clientId: { type: String, required: true },
  deliveredAt: Date, readAt: Date,
}, { timestamps: true });
msgSchema.index({ conversation: 1, clientId: 1 }, { unique: true });
msgSchema.index({ conversation: 1, _id: 1 });
export const Message = mongoose.models.Message || mongoose.model('Message', msgSchema);

const callSchema = new Schema({
  conversation: { type: String, required: true, index: true },
  caller: { type: String, required: true }, callee: { type: String, required: true },
  callType: { type: String, enum: ['audio', 'video'], default: 'audio' },
  status: { type: String, enum: ['ringing', 'active', 'rejected', 'ended', 'missed'], default: 'ringing' },
  startedAt: Date, endedAt: Date,
}, { timestamps: true }); // metadata only; media never touches the server
export const Call = mongoose.models.Call || mongoose.model('Call', callSchema);

export const pairKey = (a, b, itemId) => `${[a, b].sort().join(':')}:${itemId ?? ''}`;
export const messageView = (m) => ({ id: String(m._id), conversation: m.conversation, sender: m.sender, text: m.text, clientId: m.clientId, deliveredAt: m.deliveredAt ?? null, readAt: m.readAt ?? null, createdAt: m.createdAt });
