import { verifyToken } from "../utils/helpers.js";
import User from "../models/User.js";

export default function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Authentication required"));
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error("Invalid or expired token"));
  }

  // Verify user exists and isn't blocked
  User.findById(decoded.userId)
    .select("-googleId")
    .then((user) => {
      if (!user) {
        return next(new Error("User not found"));
      }
      if (user.status.isBlocked) {
        return next(new Error("Account blocked"));
      }
      socket.userId = user._id.toString();
      socket.user = user;
      next();
    })
    .catch(() => next(new Error("Authentication failed")));
}
