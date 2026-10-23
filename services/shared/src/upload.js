import multer from 'multer';

/** In-memory upload with hard caps; files are validated by magic bytes in sanitizeImage(). */
export const imageUpload = ({ maxFiles = 5, maxSizeMb = 5 } = {}) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { files: maxFiles, fileSize: maxSizeMb * 1024 * 1024, fields: 20, fieldSize: 20 * 1024, parts: maxFiles + 20 },
  });
