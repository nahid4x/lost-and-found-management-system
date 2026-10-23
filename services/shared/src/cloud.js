import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { v2 as cloudinary } from 'cloudinary';
import { badRequest } from './errors.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Magic-byte check (never trust the extension or client MIME), re-encode to strip EXIF/GPS. */
export async function sanitizeImage(buffer) {
  const ft = await fileTypeFromBuffer(buffer);
  if (!ft || !ALLOWED.has(ft.mime)) throw badRequest('Only JPEG, PNG or WebP images are allowed', 'bad_image');
  // sharp drops all metadata (EXIF, GPS) unless withMetadata() is called.
  return sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}

/** Profile pictures: same magic-byte check, then a 256x256 square WebP with all metadata removed. */
export async function makeAvatar(buffer) {
  const ft = await fileTypeFromBuffer(buffer);
  if (!ft || !ALLOWED.has(ft.mime)) throw badRequest('Only JPEG, PNG or WebP images are allowed', 'bad_image');
  try {
    return await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().resize(256, 256, { fit: 'cover', position: 'attention' }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw badRequest('That image could not be read. Try a different file.', 'bad_image');
  }
}

/**
 * Storage with two modes: public photos and private proof images (type "authenticated",
 * only reachable through short-lived signed URLs). Server-side credentials only.
 */
export function createCloudStorage(env) {
  cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
  const up = (buffer, { folder, type }) =>
    new Promise((resolve, reject) => {
      const s = cloudinary.uploader.upload_stream(
        { folder, type, resource_type: 'image', public_id: crypto.randomUUID(), overwrite: false },
        (err, r) => (err ? reject(err) : resolve({ publicId: r.public_id, url: r.secure_url, type })),
      );
      s.end(buffer);
    });
  return {
    uploadPublic: async (buf, folder = 'findit/items') => up(await sanitizeImage(buf), { folder, type: 'upload' }),
    uploadPrivate: async (buf, folder = 'findit/proof') => up(await sanitizeImage(buf), { folder, type: 'authenticated' }),
    signedPrivateUrl: (publicId, ttlSeconds = 300) =>
      cloudinary.url(publicId, { type: 'authenticated', sign_url: true, secure: true, resource_type: 'image', expires_at: Math.floor(Date.now() / 1000) + ttlSeconds, format: 'webp' }),
    destroy: (publicId, type = 'upload') => cloudinary.uploader.destroy(publicId, { type, resource_type: 'image' }).catch(() => null),
  };
}