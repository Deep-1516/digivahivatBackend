/**
 * middlewares/upload.middleware.js
 *
 * Multer middleware configured with Cloudinary storage.
 * Files are streamed directly to Cloudinary — no local disk writes.
 *
 * Folder structure in Cloudinary:
 *   falo/receipts  ← expense bill/receipt photos
 */
const multer                  = require('multer');
const { CloudinaryStorage }   = require('multer-storage-cloudinary');
const cloudinary              = require('../config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'falo/receipts',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    // Cloudinary public_id: timestamp + original filename (without extension)
    public_id: (_req, file) =>
      `receipt_${Date.now()}_${file.originalname.replace(/\.[^/.]+$/, '')}`,
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images (JPG/PNG/WEBP) and PDF files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

module.exports = upload;
