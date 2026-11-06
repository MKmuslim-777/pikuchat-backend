import passport from "passport";
import { randomUUID } from "node:crypto";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";
import { generateToken, generateUsername, sendSuccess, sendError } from "../utils/helpers.js";
import logger from "../utils/logger.js";
import { getIO } from "../config/socket.js";

function getSafeUser(user) {
  const result = user.toObject();
  delete result.sessions;
  delete result.revokedLegacySessions;
  return result;
}

async function createSessionToken(user, req) {
  const userAgent = String(req.get("user-agent") || "").slice(0, 300);
  const device = userAgent.match(/(iPhone|iPad|Android|Windows|Macintosh|Linux)/i)?.[0] || "Browser";
  const sessionId = randomUUID();
  await User.updateOne(
    { _id: user._id },
    { $push: { sessions: { $each: [{ sessionId, device, userAgent, createdAt: new Date() }], $slice: -20 } } },
  );
  return generateToken(user._id, sessionId);
}

export function configurePassport() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    logger.warn("Google OAuth credentials not set — /api/auth/google will not work until configured");
    return;
  }
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ email: profile.emails[0].value });

          if (!user) {
            user = await User.create({
              name: profile.displayName,
              email: profile.emails[0].value,
              username: generateUsername(profile.displayName),
              photoURL: profile.photos[0]?.value,
              googleId: profile.id,
            });
            logger.info(`New user registered: ${user.email}`);
          }

          done(null, user);
        } catch (error) {
          done(error, null);
        }
      }
    )
  );
}

// GET /api/auth/google — redirect to Google OAuth
export function googleAuth(req, res, next) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: "Google OAuth not configured" },
    });
  }
  const auth = passport.authenticate("google", { scope: ["profile", "email"] });
  auth(req, res, next);
}

// GET /api/auth/google/callback — OAuth callback
export function googleCallback(req, res, next) {
  passport.authenticate("google", { session: false }, async (err, user) => {
    if (err || !user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
    }

    try {
      const token = await createSessionToken(user, req);
      const userObj = {
        _id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        photoURL: user.photoURL,
        role: user.role,
        isProtectedFromDeletion: user.isProtectedFromDeletion,
        status: user.status,
        notificationSettings: user.notificationSettings,
      };

      const encodedUser = encodeURIComponent(JSON.stringify(userObj));
      res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}&user=${encodedUser}`);
    } catch (error) {
      logger.error(`Could not create login session: ${error.message}`);
      res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
    }
  })(req, res, next);
}

// POST /api/auth/google-callback — called by NextAuth frontend
export async function googleCallbackFromNextAuth(req, res) {
  try {
    const { name, email, photoURL, googleId } = req.body;

    if (!email) {
      return sendError(res, "VALIDATION_ERROR", "Email is required", 400);
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: name || "User",
        email,
        username: generateUsername(name || email.split("@")[0]),
        photoURL: photoURL || null,
        googleId,
      });
      logger.info(`New user registered via NextAuth: ${email}`);
    } else {
      // Update photo if changed
      if (photoURL && user.photoURL !== photoURL) {
        user.photoURL = photoURL;
        await user.save();
      }
    }

    const token = await createSessionToken(user, req);
    sendSuccess(res, { token, user: getSafeUser(user) });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

export async function getMe(req, res) {
  sendSuccess(res, { user: getSafeUser(req.user) });
}

// POST /api/auth/logout
export async function logout(req, res) {
  try {
    if (req.sessionId) {
      const update = { $pull: { sessions: { sessionId: req.sessionId } } };
      if (req.sessionId.startsWith("legacy-")) {
        update.$addToSet = { revokedLegacySessions: req.sessionId };
      }
      await User.updateOne({ _id: req.userId }, update);
    }
    sendSuccess(res, { message: "Logged out successfully" });
  } catch (error) {
    logger.error(`Could not revoke session on logout: ${error.message}`);
    sendError(res, "SERVER_ERROR", "Could not log out", 500);
  }
}

export function listSessions(req, res) {
  const sessions = (req.user.sessions || [])
    .map((session) => ({
      sessionId: session.sessionId,
      device: session.device,
      createdAt: session.createdAt,
      current: session.sessionId === req.sessionId,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  sendSuccess(res, { sessions });
}

async function disconnectSessions(userId, sessionIds) {
  const io = getIO();
  if (!io) return;
  try {
    const sockets = await io.in(String(userId)).fetchSockets();
    for (const socket of sockets) {
      if (sessionIds.includes(socket.data?.sessionId || socket.sessionId)) socket.disconnect(true);
    }
  } catch (error) {
    logger.warn(`Could not disconnect revoked sockets for ${userId}: ${error.message}`);
  }
}

export async function revokeSession(req, res) {
  const sessionId = String(req.params.sessionId || "");
  try {
    const update = { $pull: { sessions: { sessionId } } };
    if (sessionId.startsWith("legacy-")) update.$addToSet = { revokedLegacySessions: sessionId };
    const result = await User.updateOne({ _id: req.userId }, update);
    if (!result.modifiedCount) return sendError(res, "SESSION_NOT_FOUND", "Session not found", 404);
    await disconnectSessions(req.userId, [sessionId]);
    sendSuccess(res, { message: "Session revoked" });
  } catch (error) {
    logger.error(`Could not revoke session: ${error.message}`);
    sendError(res, "SERVER_ERROR", "Could not revoke session", 500);
  }
}

export async function revokeAllSessions(req, res) {
  try {
    const sessionIds = (req.user.sessions || []).map((session) => session.sessionId);
    const legacySessionIds = sessionIds.filter((sessionId) => sessionId.startsWith("legacy-"));
    const update = { $set: { sessions: [] } };
    if (legacySessionIds.length) update.$addToSet = { revokedLegacySessions: { $each: legacySessionIds } };
    await User.updateOne({ _id: req.userId }, update);
    await disconnectSessions(req.userId, sessionIds);
    sendSuccess(res, { message: "All sessions revoked" });
  } catch (error) {
    logger.error(`Could not revoke all sessions: ${error.message}`);
    sendError(res, "SERVER_ERROR", "Could not revoke sessions", 500);
  }
}

export async function updateNotificationSettings(req, res) {
  const { enabled, start, end, timeZone } = req.body?.doNotDisturb || {};
  const validTime = (value) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (typeof enabled !== "boolean" || !validTime(start) || !validTime(end) || typeof timeZone !== "string") {
    return sendError(res, "VALIDATION_ERROR", "Invalid Do Not Disturb settings", 400);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    return sendError(res, "VALIDATION_ERROR", "Invalid time zone", 400);
  }
  try {
    req.user.notificationSettings = { doNotDisturb: { enabled, start, end, timeZone } };
    await req.user.save();
    getIO()?.to(req.userId.toString()).emit(
      "notification_settings_updated",
      req.user.notificationSettings.doNotDisturb,
    );
    sendSuccess(res, { notificationSettings: req.user.notificationSettings });
  } catch (error) {
    logger.error(`Could not save notification settings: ${error.message}`);
    sendError(res, "SERVER_ERROR", "Could not save notification settings", 500);
  }
}

export default { configurePassport, googleAuth, googleCallback, getMe, logout };
