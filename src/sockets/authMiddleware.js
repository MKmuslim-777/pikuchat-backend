import { verifyToken } from "../utils/helpers.js";
import User from "../models/User.js";
import { registerLegacySession } from "../utils/sessions.js";

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
    .then(async (user) => {
      if (!user) return next(new Error("User not found"));
      if (user.status?.isBlocked) return next(new Error("Account blocked"));
      const sessionId = decoded.sessionId || await registerLegacySession(
        user._id,
        token,
        socket.handshake.headers?.["user-agent"] || "",
      );
      if (!user.sessions?.some((session) => session.sessionId === sessionId)) {
        const activeSession = await User.exists({ _id: user._id, "sessions.sessionId": sessionId });
        if (!activeSession) return next(new Error("Session revoked"));
      }

      // Attach to socket so handler can use it
      socket.userId   = user._id.toString();  // always a string
      socket.sessionId = sessionId;
      socket.data.sessionId = sessionId;
      socket.userDoc  = user;
      next();
    })
    .catch((err) => next(new Error("Auth DB error: " + err.message)));
}
