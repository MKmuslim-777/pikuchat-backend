import { verifyToken } from "../utils/helpers.js";
import User from "../models/User.js";
import { registerLegacySession } from "../utils/sessions.js";

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: { code: "INVALID_TOKEN", message: "Authentication required" },
    });
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: { code: "INVALID_TOKEN", message: "Invalid or expired token" },
    });
  }

  try {
    const user = await User.findById(decoded.userId).select("-googleId");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    if (user.status.isBlocked) {
      return res.status(403).json({
        success: false,
        error: {
          code: "USER_BLOCKED",
          message: `Account blocked${user.status.blockReason ? `: ${user.status.blockReason}` : ""}`,
        },
      });
    }

    const sessionId = decoded.sessionId || await registerLegacySession(
      user._id,
      token,
      req.get("user-agent") || "",
    );
    if (!user.sessions?.some((session) => session.sessionId === sessionId)) {
      const activeSession = await User.exists({ _id: user._id, "sessions.sessionId": sessionId });
      if (!activeSession) {
        return res.status(401).json({
          success: false,
          error: { code: "SESSION_REVOKED", message: "This session is no longer active" },
        });
      }
      user.sessions.push({ sessionId, device: "Current device", createdAt: new Date() });
    }

    req.user = user;
    req.userId = user._id;
    req.sessionId = sessionId;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: "Server error" },
    });
  }
}

export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) return next();

  try {
    const user = await User.findById(decoded.userId).select("-googleId");
    if (user && !user.status?.isBlocked) {
      const sessionId = decoded.sessionId || await registerLegacySession(
        user._id,
        token,
        req.get("user-agent") || "",
      );
      const activeSession = user.sessions?.some((session) => session.sessionId === sessionId) ||
        await User.exists({ _id: user._id, "sessions.sessionId": sessionId });
      if (!activeSession) return next();
      req.user = user;
      req.userId = user._id;
      req.sessionId = sessionId;
    }
  } catch {}
  next();
}

export default authMiddleware;
