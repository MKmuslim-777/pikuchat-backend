import { Router } from "express";
import { configurePassport, googleAuth, googleCallback, googleCallbackFromNextAuth, getMe, logout } from "../controllers/authController.js";
import authMiddleware from "../middleware/auth.js";

configurePassport();

const router = Router();

// Google OAuth routes
router.get("/google", googleAuth);
router.get("/google/callback", googleCallback);

// NextAuth callback — upsert user from frontend NextAuth
router.post("/google-callback", googleCallbackFromNextAuth);

// Authenticated routes
router.get("/me", authMiddleware, getMe);
router.post("/logout", authMiddleware, logout);

export default router;
