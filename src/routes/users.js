import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import { updateProfileSchema, searchUserSchema } from "../validators/userValidator.js";
import {
  searchUsers, getUserProfile, updateProfile, getSettings,
  muteChat, unmuteChat, hideChat, unhideChat,
  getBlockedUsers, blockUser, unblockUser,
  reportMessage,
} from "../controllers/userController.js";

const router = Router();

// Public-ish (auth required)
router.get("/search", authMiddleware, validate(searchUserSchema, "query"), searchUsers);

// Settings
router.get("/me/settings", authMiddleware, getSettings);
router.patch("/profile", authMiddleware, validate(updateProfileSchema), updateProfile);

// Blocked users
router.get("/blocked", authMiddleware, getBlockedUsers);
router.patch("/block/:userId", authMiddleware, blockUser);
router.delete("/block/:userId", authMiddleware, unblockUser);

// Chat-level mute / hide
router.patch("/chats/:chatId/mute", authMiddleware, muteChat);
router.delete("/chats/:chatId/mute", authMiddleware, unmuteChat);
router.patch("/chats/:chatId/hide", authMiddleware, hideChat);
router.delete("/chats/:chatId/hide", authMiddleware, unhideChat);

// Report
router.post("/messages/:messageId/report", authMiddleware, reportMessage);

// Profile lookup (last to avoid matching above patterns)
router.get("/:id", authMiddleware, getUserProfile);

export default router;
