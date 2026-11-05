import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import {
  addGroupMembersSchema,
  createChatSchema,
  createGroupSchema,
  updateGroupAdminSchema,
  updateGroupProfileSchema,
} from "../validators/chatValidator.js";
import {
  getChats, createChat, createGroup, addGroupMembers, removeGroupMember,
  updateGroupAdmin, updateGroupProfile, getMessages,
  clearChatMessages, blockUserInChat, unblockUserInChat, deleteChat, exportChat,
} from "../controllers/chatController.js";

const router = Router();

router.use(authMiddleware);

router.get("/", getChats);
router.post("/", validate(createChatSchema), createChat);
router.post("/group", validate(createGroupSchema), createGroup);
router.post("/:chatId/members", validate(addGroupMembersSchema), addGroupMembers);
router.delete("/:chatId/members/:userId", removeGroupMember);
router.patch("/:chatId/members/:userId/admin", validate(updateGroupAdminSchema), updateGroupAdmin);
router.patch("/:chatId/group-profile", validate(updateGroupProfileSchema), updateGroupProfile);
router.get("/:chatId/messages", getMessages);
router.delete("/:chatId/messages", clearChatMessages);   // clear all messages
router.patch("/:chatId/block", blockUserInChat);         // block user
router.patch("/:chatId/unblock", unblockUserInChat);     // unblock user
router.delete("/:chatId", deleteChat);
router.get("/:chatId/export", exportChat);                   // delete chat entirely

export default router;
