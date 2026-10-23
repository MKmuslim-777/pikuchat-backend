import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import { sendMessageSchema, editMessageSchema } from "../validators/chatValidator.js";
import { sendMessage, editMessage, deleteMessage } from "../controllers/messageController.js";

const router = Router();

router.use(authMiddleware);

router.post("/", validate(sendMessageSchema), sendMessage);
router.patch("/:id", validate(editMessageSchema), editMessage);
router.delete("/:id", deleteMessage);

export default router;
