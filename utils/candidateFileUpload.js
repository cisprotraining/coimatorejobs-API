// utils/candidatefileupload.js
import multer from "multer";
import multerS3 from "multer-s3";
import { v4 as uuidv4 } from "uuid";
import { s3 } from "../config/aws-s3.js";

const allowedTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const fileFilter = (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) return cb(null, true);
  cb(new Error("Invalid file type"), false);
};

const storage = multerS3({
  s3,
  bucket: process.env.AWS_S3_BUCKET,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: (req, file, cb) => {
    let folder = "others";
    if (file.fieldname === "profilePhoto") folder = "profile-images";
    if (file.fieldname === "resume") folder = "resumes";
    if (file.fieldname === "portfolio") folder = "candidate-cvs";
    if (file.fieldname === "cv") folder = "candidate-cvs";

    // Sanitize filename (remove special chars)
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');

    const filename = `${folder}/${uuidv4()}-${safeOriginalName}`;
    console.log(`Uploading to S3: ${filename}`);  // Log for debug
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const candidateUpload = upload.fields([
  { name: "profilePhoto", maxCount: 1 },
  { name: "resume", maxCount: 1 },
  { name: "portfolio", maxCount: 1 },
]);

export const cvUpload = upload.single("cv");