import { v2 as cloudinary } from "cloudinary";
import logger from "../utils/logger.js";

// Default Cloudinary configuration (images, avatars, banners, general files)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "pikuchat",
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Dedicated Cloudinary configuration for voice & audio messages only
export const AUDIO_CLOUDINARY_CONFIG = {
  cloud_name: process.env.CLOUDINARY_AUDIO_CLOUD_NAME || "pikuchataudio",
  api_key: process.env.CLOUDINARY_AUDIO_API_KEY || "197129336961838",
  api_secret: process.env.CLOUDINARY_AUDIO_API_SECRET || "_tkAS9Vww3-gFsUDPmagJxpJenU",
};

/**
 * Uploads images, banners, attachments to the primary Cloudinary account ("pikuchat")
 */
export function uploadToCloudinary(fileBuffer, folder = "piku") {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
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

/**
 * Uploads voice and audio messages exclusively to the dedicated audio Cloudinary account ("pikuchataudio")
 */
export async function uploadAudioToCloudinary(fileBuffer, folder = "piku_voice") {
  try {
    return await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          ...AUDIO_CLOUDINARY_CONFIG,
          folder,
          resource_type: "video", // Cloudinary processes audio under the video resource_type
        },
        (error, result) => {
          if (error) {
            logger.error("Dedicated audio Cloudinary error:", error.message);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      uploadStream.end(fileBuffer);
    });
  } catch (audioErr) {
    logger.warn("Falling back to primary Cloudinary for audio message due to:", audioErr.message);
    return await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "video",
        },
        (error, result) => {
          if (error) {
            logger.error("Primary Cloudinary audio upload fallback failed:", error.message);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      uploadStream.end(fileBuffer);
    });
  }
}

export function deleteFromCloudinary(publicId, isAudio = false) {
  return new Promise((resolve, reject) => {
    const options = isAudio
      ? { ...AUDIO_CLOUDINARY_CONFIG, resource_type: "video" }
      : {};

    cloudinary.uploader.destroy(publicId, options, (error, result) => {
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
 * Extracts the public_id from a Cloudinary image or audio URL.
 * e.g., "https://res.cloudinary.com/pikuchataudio/video/upload/v179408250/piku_voice/audio_1.webm"
 * -> "piku_voice/audio_1"
 */
export function extractCloudinaryPublicId(url) {
  if (!url || typeof url !== "string") return null;
  if (!url.includes("cloudinary.com")) return null;

  try {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const match = cleanUrl.match(/\/(?:image|video|raw)\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch (err) {
    logger.error("Failed to parse Cloudinary public_id from URL:", url, err);
  }
  return null;
}

/**
 * Automatically deletes an image or voice message from Cloudinary given its full URL.
 */
export async function deleteCloudinaryUrl(url) {
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return null;

  const isAudio = url.includes("pikuchataudio") || url.includes("/video/upload/");
  try {
    const res = await deleteFromCloudinary(publicId, isAudio);
    logger.info(`Successfully deleted Cloudinary asset: ${publicId}`);
    return res;
  } catch (err) {
    logger.warn(`Could not delete Cloudinary asset (${publicId}):`, err.message);
    return null;
  }
}

export default cloudinary;
