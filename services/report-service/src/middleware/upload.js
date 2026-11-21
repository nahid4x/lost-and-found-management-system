const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const DIR = path.resolve(process.env.UPLOAD_DIR || './uploads/reports');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) =>
    /^image\/(jpeg|png|webp)$/.test(file.mimetype)
      ? cb(null, true)
      : cb(Object.assign(new Error('Only JPG, PNG or WebP images are allowed.'), { status: 400 }))
});

// Checks the real file signature, not the header the client sent
function looksLikeImage(b) {
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP';
  return jpg || png || webp;
}

// Re-encodes to WebP: strips EXIF/GPS and embedded payloads, uses a random filename
async function saveImages(files = []) {
  await fs.mkdir(DIR, { recursive: true });
  const out = [];
  for (const f of files) {
    if (!looksLikeImage(f.buffer)) {
      throw Object.assign(new Error('One of the files is not a valid image.'), { status: 400 });
    }
    const name = `${crypto.randomBytes(16).toString('hex')}.webp`;
    try {
      await sharp(f.buffer).rotate().resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 80 }).toFile(path.join(DIR, name));
    } catch {
      throw Object.assign(new Error('One of the images could not be processed.'), { status: 400 });
    }
    out.push({ url: `/uploads/reports/${name}` });
  }
  return out;
}

module.exports = { upload, saveImages, DIR };
