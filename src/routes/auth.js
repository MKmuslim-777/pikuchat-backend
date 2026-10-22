import { Router } from "express";
import passport from "passport";
import { configurePassport, googleAuth, googleCallback, getMe, logout } from "../controllers/authController.js";
import authMiddleware from "../middleware/auth.js";

configurePassport();

const router = Router();

// Google OAuth routes
router.get("/google", googleAuth);
router.get("/google/callback", googleCallback);

// Authenticated routes
router.get("/me", authMiddleware, getMe);
router.post("/logout", authMiddleware, logout);

export default router;
