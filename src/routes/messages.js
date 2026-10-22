import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import { sendMessage, editMessage, deleteMessage } from "../controllers/messageController.js";

const router = Router();

router.use(authMiddleware);

router.post("/", sendMessage);
router.patch("/:id", editMessage);
router.delete("/:id", deleteMessage);

export default router;
