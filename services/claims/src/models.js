import { mongoose } from '@findit/shared/db';
const { Schema } = mongoose;

// Projection of FOUND items (from events). Holds the private verification questions.
const foundSchema = new Schema({
  itemId: { type: String, required: true, unique: true },
  owner: { type: String, required: true }, ownerName: String,
  title: String, status: { type: String, default: 'open' }, questions: [String],
  verification: { type: [{ _id: false, id: String, question: String, type: { type: String }, weight: Number }], default: undefined }, // metadata only: NO answers here
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
  message: { type: String, maxlength: 1000 },
  // Server-computed ownership-verification result. The correct answers are never stored on the claim.
  verification: { _id: false, scored: Boolean, score: Number, level: String, matched: Number, approximate: Number, total: Number, answered: Number, computedAt: Date,
    perQuestion: [{ _id: false, id: String, question: String, claimed: String, result: String, weight: Number }] },
  reviewState: { type: String, enum: ['pending_review', 'more_info_requested', 'info_provided'], default: 'pending_review' },
  infoRounds: { type: Number, default: 0 },
  moreInfo: { _id: false, message: String, at: Date },
  supplement: { _id: false, message: String, at: Date, proofImages: [{ _id: false, publicId: String }] },
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

// Every verification attempt is retained (including rejected/blocked ones) so guessing patterns can be investigated.
const attemptSchema = new Schema({
  itemId: { type: String, index: true }, claimant: { type: String, index: true }, ip: String,
  outcome: { type: String, maxlength: 40 }, at: { type: Date, default: Date.now, index: true },
});
export const VerificationAttempt = mongoose.models.VerificationAttempt || mongoose.model('VerificationAttempt', attemptSchema);