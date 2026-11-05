import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import { createChatSchema, createGroupSchema } from "../validators/chatValidator.js";
import {
  getChats, createChat, createGroup, getMessages,
  clearChatMessages, blockUserInChat, unblockUserInChat, deleteChat, exportChat,
} from "../controllers/chatController.js";

const router = Router();

router.use(authMiddleware);

router.get("/", getChats);
router.post("/", validate(createChatSchema), createChat);
router.post("/group", validate(createGroupSchema), createGroup);
router.get("/:chatId/messages", getMessages);
router.delete("/:chatId/messages", clearChatMessages);   // clear all messages
router.patch("/:chatId/block", blockUserInChat);         // block user
router.patch("/:chatId/unblock", unblockUserInChat);     // unblock user
router.delete("/:chatId", deleteChat);
router.get("/:chatId/export", exportChat);                   // delete chat entirely

export default router;
