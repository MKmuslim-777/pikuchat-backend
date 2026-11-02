import { verifyToken } from "../utils/helpers.js";
import User from "../models/User.js";

export default function socketAuthMiddleware(socket, next) {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace("Bearer ", "");

  if (!token) {
    return next(new Error("Authentication required — no token"));
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error("Invalid or expired token"));
  }

  User.findById(decoded.userId)
    .select("-googleId")
    .lean()                              // plain JS object — faster
    .then((user) => {
      if (!user) return next(new Error("User not found"));
      if (user.status?.isBlocked) return next(new Error("Account blocked"));

      // Attach to socket so handler can use it
      socket.userId   = user._id.toString();  // always a string
      socket.userDoc  = user;
      next();
    })
    .catch((err) => next(new Error("Auth DB error: " + err.message)));
}
