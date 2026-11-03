import { v2 as cloudinary } from "cloudinary";
import logger from "../utils/logger.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function uploadToCloudinary(fileBuffer, folder = "piku") {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto", // auto-detect image/video/raw
        transformation: [
          { quality: "auto" },
          { fetch_format: "auto" },
        ],
      },
      (error, result) => {
        if (error) {
          logger.error("Cloudinary upload error:", error.message);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(fileBuffer);
  });
}

export function deleteFromCloudinary(publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        logger.error("Cloudinary delete error:", error.message);
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Extracts the public_id from a Cloudinary image URL.
 * e.g., "https://res.cloudinary.com/pikuchat/image/upload/v179408250/piku/die/apyvczp11l3z49tbw.jpg"
 * -> "piku/die/apyvczp11l3z49tbw"
 */
export function extractCloudinaryPublicId(url) {
  if (!url || typeof url !== "string") return null;
  if (!url.includes("cloudinary.com")) return null;

  try {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const match = cleanUrl.match(/\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch (err) {
    logger.error("Failed to parse Cloudinary public_id from URL:", url, err);
  }
  return null;
}

/**
 * Automatically deletes an image from Cloudinary given its full URL.
 * If the URL is not from Cloudinary (e.g. Google avatar), it safely does nothing.
 */
export async function deleteCloudinaryUrl(url) {
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return null;
  try {
    const res = await deleteFromCloudinary(publicId);
    logger.info(`Successfully deleted old Cloudinary image: ${publicId}`);
    return res;
  } catch (err) {
    logger.warn(`Could not delete old Cloudinary image (${publicId}):`, err.message);
    return null;
  }
}

export default cloudinary;
