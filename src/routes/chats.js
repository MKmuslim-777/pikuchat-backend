import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import { createChatSchema } from "../validators/chatValidator.js";
import {
  getChats, createChat, getMessages,
  clearChatMessages, blockUserInChat, unblockUserInChat, deleteChat,
} from "../controllers/chatController.js";

const router = Router();

router.use(authMiddleware);

router.get("/", getChats);
router.post("/", validate(createChatSchema), createChat);
router.get("/:chatId/messages", getMessages);
router.delete("/:chatId/messages", clearChatMessages);   // clear all messages
router.patch("/:chatId/block", blockUserInChat);         // block user
router.patch("/:chatId/unblock", unblockUserInChat);     // unblock user
router.delete("/:chatId", deleteChat);                   // delete chat entirely

export default router;
