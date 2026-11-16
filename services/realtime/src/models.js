import { mongoose } from '@findit/shared/db';
const { Schema } = mongoose;

const convSchema = new Schema({
  participants: { type: [String], required: true, validate: { validator: (v) => v.length === 2 && v[0] !== v[1], message: 'exactly two distinct participants' } },
  names: { type: Schema.Types.Mixed, default: {} },
  itemId: String, itemTitle: String,
  pairKey: { type: String, required: true, unique: true },
  lastMessageAt: { type: Date, default: Date.now },
  hiddenFor: { type: [String], default: [] }, // people who deleted the chat from their own list
  clearedAt: { type: Schema.Types.Mixed, default: {} }, // userId -> when they cleared it (older messages stay hidden for them)
}, { timestamps: true });
convSchema.index({ participants: 1, lastMessageAt: -1 });
export const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', convSchema);

const msgSchema = new Schema({
  conversation: { type: String, required: true },
  sender: { type: String, required: true },
  text: { type: String, required: true, maxlength: 2000 },
  kind: { type: String, enum: ['text', 'call', 'image', 'voice'], default: 'text' },
  call: { type: Schema.Types.Mixed },
  image: { type: Schema.Types.Mixed },
  voice: { type: Schema.Types.Mixed },
  clientId: { type: String, required: true },
  deliveredAt: Date, readAt: Date, deletedAt: Date,
}, { timestamps: true });
msgSchema.index({ conversation: 1, clientId: 1 }, { unique: true });
msgSchema.index({ conversation: 1, _id: 1 });
export const Message = mongoose.models.Message || mongoose.model('Message', msgSchema);

// Chat photos are private: stored here (never on a public URL) and only served to the two participants.
const imageSchema = new Schema({
  conversation: { type: String, required: true, index: true },
  uploader: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true, select: false },
}, { timestamps: true });
export const ChatImage = mongoose.models.ChatImage || mongoose.model('ChatImage', imageSchema);

// Voice messages are private too: same idea as photos (stored here, only served to the two participants).
const voiceSchema = new Schema({
  conversation: { type: String, required: true, index: true },
  uploader: { type: String, required: true },
  mime: { type: String, enum: ['audio/webm', 'audio/ogg', 'audio/mp4'], required: true },
  size: { type: Number, required: true },
  durationSec: { type: Number, required: true },
  data: { type: Buffer, required: true, select: false },
}, { timestamps: true });
export const ChatVoice = mongoose.models.ChatVoice || mongoose.model('ChatVoice', voiceSchema);

const callSchema = new Schema({
  conversation: { type: String, required: true, index: true },
  caller: { type: String, required: true }, callee: { type: String, required: true },
  callType: { type: String, enum: ['audio', 'video'], default: 'audio' },
  status: { type: String, enum: ['ringing', 'active', 'rejected', 'ended', 'missed'], default: 'ringing' },
  startedAt: Date, endedAt: Date,
}, { timestamps: true }); // metadata only; media never touches the server
export const Call = mongoose.models.Call || mongoose.model('Call', callSchema);

export const pairKey = (a, b, itemId) => `${[a, b].sort().join(':')}:${itemId ?? ''}`;
export const messageView = (m) => ({ id: String(m._id), conversation: m.conversation, sender: m.sender, text: m.text, clientId: m.clientId, deliveredAt: m.deliveredAt ?? null, readAt: m.readAt ?? null, createdAt: m.createdAt, kind: m.kind ?? 'text', call: m.call ?? null, image: m.image ?? null, voice: m.voice ?? null, deleted: Boolean(m.deletedAt) });