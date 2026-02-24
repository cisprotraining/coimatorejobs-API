import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/aws-s3.js";

export const getPrivateFileUrl = async (key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });

    // expires in 5 minutes
    return await getSignedUrl(s3, command, { expiresIn: 300 });
  } catch (error) {
    console.error("Signed URL error:", error);
    throw error;
  }
};
