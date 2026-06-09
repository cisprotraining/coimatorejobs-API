import multer from "multer";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { s3 } from "../config/aws-s3.js";
import { BadRequestError } from "./errors.js";

const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;

const sanitizeFileName = (name = "") =>
  String(name || "file")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "file";

const getExtension = (name = "") => {
  const parts = String(name).toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
};

const getOutputExtension = (mimeType = "") => {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "application/msword") return "doc";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return "jpg";
};

const buildS3Url = (key) => {
  const region = process.env.AWS_REGION || "ap-south-1";
  const bucket = process.env.AWS_S3_BUCKET;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const matchesAllowedType = (file, allowedTypes = []) => {
  if (!file) return false;
  const mimeType = String(file.mimetype || "").toLowerCase();
  const extension = getExtension(file.originalname);

  return allowedTypes.some((allowedType) => {
    const normalized = String(allowedType || "").toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith(".")) return extension === normalized.slice(1);
    if (normalized.endsWith("/*")) return mimeType.startsWith(normalized.slice(0, -1));
    return mimeType === normalized;
  });
};

const createUploadKey = ({ folder, originalName, outputMimeType }) => {
  const safeName = sanitizeFileName(originalName);
  const extension = getOutputExtension(outputMimeType || "");
  return `${folder}/${uuidv4()}-${safeName}.${extension}`;
};

const uploadBufferToS3 = async ({ buffer, key, contentType }) => {
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return {
    key,
    location: buildS3Url(key),
    contentType,
    size: buffer.length,
  };
};

const processImageBuffer = async (file, options = {}) => {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    webpQuality = 82,
    jpegQuality = 80,
    pngQuality = 82,
  } = options;

  let metadata;
  try {
    metadata = await sharp(file.buffer, { failOn: "error" }).metadata();
  } catch {
    throw new BadRequestError(`Invalid image file: ${file.originalname}`);
  }

  if (!metadata?.width || !metadata?.height) {
    throw new BadRequestError(`Invalid image dimensions: ${file.originalname}`);
  }

  const createBasePipeline = () =>
    sharp(file.buffer, { failOn: "error" })
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      });

  const candidates = [];

  try {
    const webpBuffer = await createBasePipeline()
      .webp({ quality: webpQuality })
      .toBuffer();
    candidates.push({ buffer: webpBuffer, mimeType: "image/webp" });
  } catch {
    // Ignore failed candidate and try the next format.
  }

  try {
    const jpegBuffer = await createBasePipeline()
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toBuffer();
    candidates.push({ buffer: jpegBuffer, mimeType: "image/jpeg" });
  } catch {
    // Ignore failed candidate and try the next format.
  }

  if (metadata.hasAlpha) {
    try {
      const pngBuffer = await createBasePipeline()
        .png({ quality: pngQuality, compressionLevel: 9, palette: true })
        .toBuffer();
      candidates.push({ buffer: pngBuffer, mimeType: "image/png" });
    } catch {
      // Ignore failed candidate and use the best available result.
    }
  }

  if (!candidates.length) {
    throw new BadRequestError(`Failed to process image: ${file.originalname}`);
  }

  const bestCandidate = candidates.reduce((smallest, current) =>
    current.buffer.length < smallest.buffer.length ? current : smallest,
  );

  if (bestCandidate.buffer.length >= file.buffer.length) {
    return {
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalSize: file.size,
      optimizedSize: file.size,
      reduced: false,
      width: metadata.width,
      height: metadata.height,
    };
  }

  return {
    buffer: bestCandidate.buffer,
    mimeType: bestCandidate.mimeType,
    originalSize: file.size,
    optimizedSize: bestCandidate.buffer.length,
    reduced: true,
    width: metadata.width,
    height: metadata.height,
  };
};

const toUploadedFileShape = (file, uploadResult, extra = {}) => ({
  ...file,
  ...uploadResult,
  bucket: process.env.AWS_S3_BUCKET,
  size: uploadResult.size,
  etag: undefined,
  ...extra,
});

const processSingleFile = async (file, fieldConfig) => {
  const folder = fieldConfig.folder;
  if (!folder) {
    throw new BadRequestError(`Upload folder is missing for field "${file.fieldname}"`);
  }

  if (fieldConfig.type === "image") {
    const processed = await processImageBuffer(file, fieldConfig.imageOptions || {});
    const key = createUploadKey({
      folder,
      originalName: file.originalname,
      outputMimeType: processed.mimeType,
    });
    const uploadResult = await uploadBufferToS3({
      buffer: processed.buffer,
      key,
      contentType: processed.mimeType,
    });

    return toUploadedFileShape(file, uploadResult, {
      mimetype: processed.mimeType,
      originalSize: processed.originalSize,
      optimizedSize: processed.optimizedSize,
      compressionApplied: processed.reduced,
    });
  }

  const key = createUploadKey({
    folder,
    originalName: file.originalname,
    outputMimeType: file.mimetype,
  });
  const uploadResult = await uploadBufferToS3({
    buffer: file.buffer,
    key,
    contentType: file.mimetype,
  });

  return toUploadedFileShape(file, uploadResult);
};

const createBaseMulter = ({ allowedTypes, maxFileSize = DEFAULT_MAX_FILE_SIZE }) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileSize },
    fileFilter: (req, file, cb) => {
      if (matchesAllowedType(file, allowedTypes)) {
        cb(null, true);
        return;
      }
      cb(new BadRequestError(`Invalid file type for ${file.fieldname}`), false);
    },
  });

export const createFieldsUploadMiddleware = ({
  fields,
  fieldConfig,
  allowedTypes,
  maxFileSize,
}) => {
  const parser = createBaseMulter({ allowedTypes, maxFileSize }).fields(fields);

  return (req, res, next) => {
    parser(req, res, async (error) => {
      if (error) {
        next(error);
        return;
      }

      try {
        const parsedFiles = req.files || {};
        const nextFiles = {};

        for (const [fieldName, files] of Object.entries(parsedFiles)) {
          const config = fieldConfig[fieldName];
          if (!config) {
            nextFiles[fieldName] = files;
            continue;
          }

          nextFiles[fieldName] = await Promise.all(
            files.map((file) => processSingleFile(file, config)),
          );
        }

        req.files = nextFiles;
        next();
      } catch (processingError) {
        next(processingError);
      }
    });
  };
};

export const createSingleUploadMiddleware = ({
  fieldName,
  fieldConfig,
  allowedTypes,
  maxFileSize,
}) => {
  const parser = createBaseMulter({ allowedTypes, maxFileSize }).single(fieldName);

  return (req, res, next) => {
    parser(req, res, async (error) => {
      if (error) {
        next(error);
        return;
      }

      try {
        if (req.file && fieldConfig) {
          req.file = await processSingleFile(req.file, fieldConfig);
        }
        next();
      } catch (processingError) {
        next(processingError);
      }
    });
  };
};
