import { createFieldsUploadMiddleware } from "./uploadPipeline.js";

const allowedTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/bmp",
];

const companyUpload = createFieldsUploadMiddleware({
  allowedTypes,
  maxFileSize: 5 * 1024 * 1024,
  fields: [
    { name: "logo", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ],
  fieldConfig: {
    logo: {
      type: "image",
      folder: "company-logos",
      imageOptions: {
        maxWidth: 1600,
        maxHeight: 1600,
      },
    },
    coverImage: {
      type: "image",
      folder: "company-logos",
      imageOptions: {
        maxWidth: 2000,
        maxHeight: 2000,
      },
    },
  },
});

export default companyUpload;
