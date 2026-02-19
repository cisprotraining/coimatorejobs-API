import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

// Create uploads directory if not exists
const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'candidate');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

// File filter for images and PDFs (for photo and resume)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(new Error('Only images (jpeg, jpg, png, gif, webp) and PDFs are allowed!'), false);
};

// Configure Multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Middleware for candidate profile photo and resume
const candidateUpload = upload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
  { name: 'portfolio', maxCount: 1 }
]);

// For CV Manager - single CV upload
const cvUpload = upload.single('cv');

export { candidateUpload, cvUpload };