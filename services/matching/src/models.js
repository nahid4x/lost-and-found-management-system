import { mongoose } from '@findit/shared/db';
const { Schema } = mongoose;

// Local projection of items (built from events). Matching never reads the Items database.
const projSchema = new Schema({
  itemId: { type: String, required: true, unique: true },
  type: { type: String, enum: ['lost', 'found'], required: true },
  title: String, description: String, category: String, date: Date, areaLabel: String,
  location: { lat: Number, lng: Number },
  owner: { type: String, index: true }, ownerName: String,
  status: { type: String, default: 'open' },
}, { timestamps: true });
projSchema.index({ type: 1, status: 1, createdAt: -1 });
export const ItemProjection = mongoose.models.ItemProjection || mongoose.model('ItemProjection', projSchema);

const matchSchema = new Schema({
  lostItemId: { type: String, required: true, index: true },
  foundItemId: { type: String, required: true, index: true },
  lostOwner: { type: String, required: true },
  foundOwner: { type: String, required: true },
  score: { type: Number, required: true },
  reasons: [{ _id: false, factor: String, points: Number, max: Number, detail: String }],
  status: { type: String, enum: ['suggested', 'dismissed', 'confirmed'], default: 'suggested' },
}, { timestamps: true });
matchSchema.index({ lostItemId: 1, foundItemId: 1 }, { unique: true });
export const Match = mongoose.models.Match || mongoose.model('Match', matchSchema);
