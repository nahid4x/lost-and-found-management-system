import { mongoose } from '@findit/shared/db';

const { Schema } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive: { type: Boolean, default: true },
  emailVerified: { type: Boolean, default: false },
  bio: { type: String, trim: true, maxlength: 280, default: '' },
  avatarUrl: { type: String, maxlength: 500, default: '' },
  // Account deletion: requested -> 7-day grace period -> purged by the background job. Cancelling unsets both.
  deletionRequestedAt: { type: Date },
  deletionScheduledFor: { type: Date, index: true },
  tokenVersion: { type: Number, default: 0, select: false },
  failedLogins: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
}, { timestamps: true });
export const User = mongoose.models.User || mongoose.model('User', userSchema);

const refreshSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, index: true },
  family: { type: String, required: true, index: true },
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: Date,
  replacedBy: String,
}, { timestamps: true });
export const RefreshToken = mongoose.models.RefreshToken || mongoose.model('RefreshToken', refreshSchema);

const tokenSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, index: true },
  kind: { type: String, enum: ['verify', 'reset'], required: true },
  hash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: Date,
}, { timestamps: true });
export const OneTimeToken = mongoose.models.OneTimeToken || mongoose.model('OneTimeToken', tokenSchema);

/** Email-verification OTP: one live code per user, stored as an HMAC (never the raw 6 digits). */
const otpSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, unique: true },
  hash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });
export const EmailOtp = mongoose.models.EmailOtp || mongoose.model('EmailOtp', otpSchema);

/** Pending email change: the code is sent to the NEW address; the current email stays until it is confirmed. */
const emailChangeSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, unique: true },
  newEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  hash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });
export const EmailChange = mongoose.models.EmailChange || mongoose.model('EmailChange', emailChangeSchema);

/** Profile picture: a 256x256 WebP (about 10-25 KB) kept in the auth database and served by GET /avatar/:id. */
const avatarSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, unique: true },
  data: { type: Buffer, required: true },
  contentType: { type: String, default: 'image/webp' },
}, { timestamps: true });
export const Avatar = mongoose.models.Avatar || mongoose.model('Avatar', avatarSchema);

/** Explicit response shape: never return the raw document. */
export const userView = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  emailVerified: u.emailVerified,
  isActive: u.isActive,
  createdAt: u.createdAt,
  bio: u.bio ?? '',
  avatarUrl: u.avatarUrl ?? '',
  deletionScheduledFor: u.deletionScheduledFor ?? null,
});