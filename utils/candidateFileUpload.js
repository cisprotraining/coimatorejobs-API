import { createFieldsUploadMiddleware, createSingleUploadMiddleware } from "./uploadPipeline.js";

const allowedTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/bmp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const candidateUpload = createFieldsUploadMiddleware({
  allowedTypes,
  maxFileSize: 5 * 1024 * 1024,
  fields: [
    { name: "profilePhoto", maxCount: 1 },
    { name: "resume", maxCount: 1 },
    { name: "portfolio", maxCount: 1 },
  ],
  fieldConfig: {
    profilePhoto: {
      type: "image",
      folder: "profile-images",
      imageOptions: {
        maxWidth: 1600,
        maxHeight: 1600,
      },
    },
    resume: {
      type: "raw",
      folder: "resumes",
    },
    portfolio: {
      type: "raw",
      folder: "candidate-cvs",
    },
  },
});

export const cvUpload = createSingleUploadMiddleware({
  fieldName: "cv",
  allowedTypes,
  maxFileSize: 5 * 1024 * 1024,
  fieldConfig: {
    type: "raw",
    folder: "candidate-cvs",
  },
});
