import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import { searchUsers, getUserProfile, updateProfile } from "../controllers/userController.js";

const router = Router();

router.get("/search", authMiddleware, searchUsers);
router.get("/:id", authMiddleware, getUserProfile);
router.patch("/profile", authMiddleware, updateProfile);

export default router;
