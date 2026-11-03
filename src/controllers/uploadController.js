import multer from "multer";
import { uploadToCloudinary, uploadAudioToCloudinary } from "../config/cloudinary.js";
import { sendSuccess, sendError } from "../utils/helpers.js";

// Multer config — store in memory, max 25MB
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

// POST /api/upload
export async function uploadFile(req, res) {
  try {
    if (!req.file) {
      return sendError(res, "VALIDATION_ERROR", "No file provided", 400);
    }

    const isAudio =
      req.body.isVoice === "true" ||
      req.body.type === "voice" ||
      req.body.type === "audio" ||
      (req.file.mimetype && req.file.mimetype.startsWith("audio/")) ||
      req.file.originalname?.endsWith(".webm") ||
      req.file.originalname?.endsWith(".ogg") ||
      req.file.originalname?.endsWith(".m4a") ||
      req.file.originalname?.endsWith(".mp3") ||
      req.file.originalname?.endsWith(".wav");

    let result;
    if (isAudio) {
      // Audio & voice recordings are uploaded exclusively to the pikuchataudio account
      result = await uploadAudioToCloudinary(req.file.buffer, "piku_voice");
    } else {
      // Images, avatars, banners, and documents are uploaded to the primary account
      result = await uploadToCloudinary(req.file.buffer, "piku");
    }

    sendSuccess(res, {
      fileUrl: result.secure_url,
      fileType: isAudio ? "voice" : (result.resource_type === "image" ? "image" : result.resource_type),
      publicId: result.public_id,
      fileName: req.file.originalname,
      size: req.file.size,
      duration: result.duration ? Math.round(result.duration) : undefined,
    });
  } catch (error) {
    sendError(res, "UPLOAD_FAILED", error.message, 500);
  }
}

export default { uploadFile, upload };
