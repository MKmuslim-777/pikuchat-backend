import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import { createChatSchema } from "../validators/chatValidator.js";
import { getChats, createChat, getMessages } from "../controllers/chatController.js";

const router = Router();

router.use(authMiddleware);

router.get("/", getChats);
router.post("/", validate(createChatSchema), createChat);
router.get("/:chatId/messages", getMessages);

export default router;
