import { verifyToken } from "../utils/helpers.js";
import User from "../models/User.js";

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

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: "Server error" },
    });
  }
}

export default authMiddleware;
