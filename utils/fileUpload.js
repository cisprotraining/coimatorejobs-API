import multer from "multer";
import multerS3 from "multer-s3";
import { v4 as uuidv4 } from "uuid";
import { s3 } from "../config/aws-s3.js";

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error("Only images allowed"), false);
};

const storage = multerS3({
  s3,
  bucket: process.env.AWS_S3_BUCKET,
  // acl: "public-read",
  contentType: multerS3.AUTO_CONTENT_TYPE,

  key: (req, file, cb) => {
    let folder = "company-logos";

    if (file.fieldname === "coverImage") folder = "company-logos";

    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");

    cb(null, `${folder}/${uuidv4()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const companyUpload = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "coverImage", maxCount: 1 },
]);

export default companyUpload;