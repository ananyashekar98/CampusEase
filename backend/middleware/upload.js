const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Uploaded photos land in backend/uploads/photos/, served statically by
// server.js at /uploads/photos/<filename>. Created on first use if it
// doesn't exist yet.
const uploadDir = path.join(__dirname, '..', 'uploads', 'photos');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    // Prefixed with the target user's id + a timestamp so re-uploading a
    // photo for the same person never collides with their previous one.
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'));
  }
  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});