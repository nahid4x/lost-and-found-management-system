import { mongoose } from '@findit/shared/db';
const { Schema } = mongoose;

export const CATEGORIES = ['electronics', 'wallet', 'keys', 'bags', 'clothing', 'documents', 'jewelry', 'pets', 'toys', 'sports', 'other'];
export const STATUSES = ['open', 'matched', 'claimed', 'verified', 'returned', 'closed'];

const itemSchema = new Schema({
  type: { type: String, enum: ['lost', 'found'], required: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
  description: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
  category: { type: String, enum: CATEGORIES, required: true },
  images: [{ _id: false, publicId: String, url: String }],
  date: { type: Date, required: true },
  location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], required: true } },
  areaLabel: { type: String, required: true, trim: true, maxlength: 80 },
  status: { type: String, enum: STATUSES, default: 'open' },
  owner: { type: String, required: true, index: true },
  ownerName: { type: String, required: true },
  // ---- private fields ----
  heldAt: { type: String, trim: true, maxlength: 200 },
  contactNote: { type: String, trim: true, maxlength: 200 },
  questions: { type: [String], default: undefined },
  approvedClaimant: { type: String, default: null },
  hidden: { type: Boolean, default: false },
  history: [{ _id: false, from: String, to: String, actor: String, at: Date }],
}, { timestamps: true });

itemSchema.index({ location: '2dsphere' });
itemSchema.index({ title: 'text', description: 'text' });
itemSchema.index({ type: 1, status: 1, createdAt: -1 });
itemSchema.index({ category: 1, date: -1 });

export const Item = mongoose.models.Item || mongoose.model('Item', itemSchema);
