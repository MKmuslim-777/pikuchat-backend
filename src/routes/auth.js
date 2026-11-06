import { Router } from "express";
import {
  configurePassport, googleAuth, googleCallback, googleCallbackFromNextAuth, getMe, logout,
  listSessions, revokeSession, revokeAllSessions, updateNotificationSettings,
} from "../controllers/authController.js";
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
router.get("/sessions", authMiddleware, listSessions);
router.delete("/sessions/:sessionId", authMiddleware, revokeSession);
router.delete("/sessions", authMiddleware, revokeAllSessions);
router.patch("/notification-settings", authMiddleware, updateNotificationSettings);

export default router;
