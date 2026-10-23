import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/admin.js";
import validate from "../middleware/validate.js";
import { bannedKeywordSchema, muteUserSchema, blockUserSchema } from "../validators/messageValidator.js";
import {
  getStats,
  getAllUsers,
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
  getAllChats,
  getChatDetails,
  getChatMessages,
  getKeywords,
  addKeyword,
  deleteKeyword,
  runAudit,
  adminDeleteMessage,
  getGallery,
  adminDeleteFile,
} from "../controllers/adminController.js";

const router = Router();

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

// Dashboard stats
router.get("/stats", getStats);

// User management
router.get("/users", getAllUsers);
router.patch("/users/:id/block", validate(blockUserSchema), blockUser);
router.patch("/users/:id/unblock", unblockUser);
router.patch("/users/:id/mute", validate(muteUserSchema), muteUser);
router.patch("/users/:id/unmute", unmuteUser);

// Chat management
router.get("/chats", getAllChats);
router.get("/chats/:chatId", getChatDetails);
router.get("/chats/:chatId/messages", getChatMessages);

// Banned keywords
router.get("/keywords", getKeywords);
router.post("/keywords", validate(bannedKeywordSchema), addKeyword);
router.delete("/keywords/:id", deleteKeyword);

// Safety audit
router.post("/audit", runAudit);

// Admin message delete
router.delete("/messages/:id", adminDeleteMessage);

// Media gallery
router.get("/gallery", getGallery);
router.delete("/gallery/:id", adminDeleteFile);

export default router;
