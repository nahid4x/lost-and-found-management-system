import { mongoose } from '@findit/shared/db';
const { Schema } = mongoose;

// Projection of FOUND items (from events). Holds the private verification questions.
const foundSchema = new Schema({
  itemId: { type: String, required: true, unique: true },
  owner: { type: String, required: true }, ownerName: String,
  title: String, status: { type: String, default: 'open' }, questions: [String],
}, { timestamps: true });
export const FoundItem = mongoose.models.FoundItem || mongoose.model('FoundItem', foundSchema);

const claimSchema = new Schema({
  itemId: { type: String, required: true, index: true },
  itemTitle: String,
  finder: { type: String, required: true, index: true }, finderName: String,
  claimant: { type: String, required: true, index: true }, claimantName: String,
  questions: [String],
  answers: [{ _id: false, question: String, answer: { type: String, maxlength: 500 } }],
  proofImages: [{ _id: false, publicId: String }],
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'withdrawn'], default: 'pending', index: true },
  decisionBy: String, decidedAt: Date, returnedAt: Date, returnedBy: String,
  hiddenBy: { type: [String], default: [] }, // users who removed this finished claim from their own list
  history: [{ _id: false, from: String, to: String, actor: String, at: Date, ip: String, note: String }],
}, { timestamps: true });
claimSchema.index({ itemId: 1, claimant: 1 }, { unique: true });
export const Claim = mongoose.models.Claim || mongoose.model('Claim', claimSchema);

const auditSchema = new Schema({
  service: String, action: { type: String, index: true }, actor: { type: String, index: true },
  targetType: String, targetId: String, ip: String, meta: Schema.Types.Mixed, at: { type: Date, default: Date.now, index: true },
});
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);