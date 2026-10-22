import multer from "multer";
import { uploadToCloudinary } from "../config/cloudinary.js";
import { sendSuccess, sendError } from "../utils/helpers.js";

// Multer config — store in memory, max 15MB
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

// POST /api/upload
export async function uploadFile(req, res) {
  try {
    if (!req.file) {
      return sendError(res, "VALIDATION_ERROR", "No file provided", 400);
    }

    const result = await uploadToCloudinary(req.file.buffer, "piku");

    sendSuccess(res, {
      fileUrl: result.secure_url,
      fileType: result.resource_type === "image" ? "image" : result.resource_type,
      publicId: result.public_id,
      fileName: req.file.originalname,
      size: req.file.size,
    });
  } catch (error) {
    sendError(res, "UPLOAD_FAILED", error.message, 500);
  }
}

export default { uploadFile, upload };
