import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";
import { generateToken, generateUsername, sendSuccess, sendError } from "../utils/helpers.js";
import logger from "../utils/logger.js";

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
  passport.authenticate("google", { session: false }, (err, user) => {
    if (err || !user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
    }

    const token = generateToken(user._id);
    const userObj = {
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      photoURL: user.photoURL,
      role: user.role,
      isProtectedFromDeletion: user.isProtectedFromDeletion,
      status: user.status,
    };

    const encodedUser = encodeURIComponent(JSON.stringify(userObj));
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}&user=${encodedUser}`);
  })(req, res, next);
}

// GET /api/auth/me — get current user
export async function getMe(req, res) {
  sendSuccess(res, { user: req.user });
}

// POST /api/auth/logout
export function logout(req, res) {
  sendSuccess(res, { message: "Logged out successfully" });
}

export default { configurePassport, googleAuth, googleCallback, getMe, logout };
