import User from "../models/User.js";
import Message from "../models/Message.js";
import { sendSuccess, sendError } from "../utils/helpers.js";
import { getIO } from "../config/socket.js";

// GET /api/users/search?query=
export async function searchUsers(req, res) {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 1) return sendSuccess(res, { users: [] });

    const currentUser = await User.findById(req.userId).select("blockedUsers");

    const users = await User.find({
      _id: { $ne: req.userId, $nin: currentUser?.blockedUsers || [] },
      username: { $regex: query.trim(), $options: "i" },
      "status.isBlocked": { $ne: true },
    })
      .select("name username photoURL bio isOnline lastSeen")
      .limit(20);

    sendSuccess(res, { users });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/users/:id
export async function getUserProfile(req, res) {
  try {
    const user = await User.findById(req.params.id)
      .select("-googleId -mutedChats -hiddenChats -blockedUsers -reportedBy");
    if (!user) return sendError(res, "USER_NOT_FOUND", "User not found", 404);
    sendSuccess(res, { user });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/users/profile — update name, username, photoURL, bio, readReceiptsEnabled
export async function updateProfile(req, res) {
  try {
    const { name, username, photoURL, bio, readReceiptsEnabled } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (photoURL !== undefined) updates.photoURL = photoURL;
    if (bio !== undefined) updates.bio = bio.slice(0, 150);
    if (readReceiptsEnabled !== undefined) updates.readReceiptsEnabled = readReceiptsEnabled;

    if (username) {
      const existing = await User.findOne({ username, _id: { $ne: req.userId } });
      if (existing) return sendError(res, "VALIDATION_ERROR", "Username already taken", 400);
      updates.username = username;
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true })
      .select("-googleId -mutedChats -hiddenChats -blockedUsers");

    sendSuccess(res, { user });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/users/me/settings — get privacy & notification settings
export async function getSettings(req, res) {
  try {
    const user = await User.findById(req.userId)
      .select("readReceiptsEnabled mutedChats hiddenChats blockedUsers bio");
    sendSuccess(res, { settings: user });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/users/chats/:chatId/mute — mute a chat
export async function muteChat(req, res) {
  try {
    const { chatId } = req.params;
    const { mutedUntil } = req.body; // null = forever, or ISO date string

    const user = await User.findById(req.userId);
    if (!user) return sendError(res, "USER_NOT_FOUND", "User not found", 404);

    // Remove existing mute entry for this chat, then add new one
    user.mutedChats = user.mutedChats.filter((m) => m.chatId.toString() !== chatId);
    user.mutedChats.push({ chatId, mutedUntil: mutedUntil ? new Date(mutedUntil) : null });
    await user.save();

    sendSuccess(res, { message: "Chat muted" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// DELETE /api/users/chats/:chatId/mute — unmute a chat
export async function unmuteChat(req, res) {
  try {
    const { chatId } = req.params;
    await User.findByIdAndUpdate(req.userId, {
      $pull: { mutedChats: { chatId } },
    });
    sendSuccess(res, { message: "Chat unmuted" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/users/chats/:chatId/hide — hide a chat from list
export async function hideChat(req, res) {
  try {
    const { chatId } = req.params;
    await User.findByIdAndUpdate(req.userId, {
      $addToSet: { hiddenChats: chatId },
    });
    sendSuccess(res, { message: "Chat hidden" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// DELETE /api/users/chats/:chatId/hide — unhide a chat
export async function unhideChat(req, res) {
  try {
    const { chatId } = req.params;
    await User.findByIdAndUpdate(req.userId, {
      $pull: { hiddenChats: chatId },
    });
    sendSuccess(res, { message: "Chat unhidden" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/users/blocked — get blocked users list
export async function getBlockedUsers(req, res) {
  try {
    const user = await User.findById(req.userId)
      .populate("blockedUsers", "name username photoURL isOnline");
    sendSuccess(res, { blockedUsers: user?.blockedUsers || [] });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/users/block/:userId — block a user by ID (direct, not via chat)
export async function blockUser(req, res) {
  try {
    const { userId } = req.params;
    if (userId === req.userId.toString()) {
      return sendError(res, "VALIDATION_ERROR", "Cannot block yourself", 400);
    }
    await User.findByIdAndUpdate(req.userId, { $addToSet: { blockedUsers: userId } });
    sendSuccess(res, { message: "User blocked" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// DELETE /api/users/block/:userId — unblock a user
export async function unblockUser(req, res) {
  try {
    const { userId } = req.params;
    await User.findByIdAndUpdate(req.userId, { $pull: { blockedUsers: userId } });
    sendSuccess(res, { message: "User unblocked" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// POST /api/users/messages/:messageId/report — report a message
export async function reportMessage(req, res) {
  try {
    const { messageId } = req.params;
    const { reason } = req.body;

    const message = await Message.findById(messageId);
    if (!message) return sendError(res, "NOT_FOUND", "Message not found", 404);

    // Add to reportedBy if not already there
    if (!message.reportedBy.includes(req.userId)) {
      message.reportedBy.push(req.userId);
      await message.save();
    }

    // Notify admins via socket
    const io = getIO();
    if (io) {
      io.emit("message_reported", {
        messageId,
        reportedBy: req.userId,
        reason: reason || "No reason provided",
        messagePreview: message.text?.slice(0, 100) || "📎 File",
      });
    }

    sendSuccess(res, { message: "Report submitted" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

export default {
  searchUsers, getUserProfile, updateProfile, getSettings,
  muteChat, unmuteChat, hideChat, unhideChat,
  getBlockedUsers, blockUser, unblockUser,
  reportMessage,
};
