import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import { updateProfileSchema, searchUserSchema } from "../validators/userValidator.js";
import { searchUsers, getUserProfile, updateProfile } from "../controllers/userController.js";

const router = Router();

router.get("/search", authMiddleware, validate(searchUserSchema, "query"), searchUsers);
router.get("/:id", authMiddleware, getUserProfile);
router.patch("/profile", authMiddleware, validate(updateProfileSchema), updateProfile);

export default router;
