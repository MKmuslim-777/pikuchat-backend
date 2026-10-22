import User from "../models/User.js";
import { sendSuccess, sendError } from "../utils/helpers.js";

// GET /api/users/search?query=
export async function searchUsers(req, res) {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 1) {
      return sendSuccess(res, { users: [] });
    }

    const users = await User.find({
      _id: { $ne: req.userId },
      username: { $regex: query.trim(), $options: "i" },
      "status.isBlocked": { $ne: true },
    })
      .select("name username photoURL isOnline lastSeen")
      .limit(20);

    sendSuccess(res, { users });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/users/:id
export async function getUserProfile(req, res) {
  try {
    const user = await User.findById(req.params.id).select("-googleId");
    if (!user) {
      return sendError(res, "USER_NOT_FOUND", "User not found", 404);
    }
    sendSuccess(res, { user });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/users/profile
export async function updateProfile(req, res) {
  try {
    const { name, username, photoURL } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (photoURL) updates.photoURL = photoURL;

    if (username) {
      // Check if username is taken by another user
      const existing = await User.findOne({ username, _id: { $ne: req.userId } });
      if (existing) {
        return sendError(res, "VALIDATION_ERROR", "Username already taken", 400);
      }
      updates.username = username;
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
    }).select("-googleId");

    sendSuccess(res, { user });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

export default { searchUsers, getUserProfile, updateProfile };
