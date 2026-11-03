import User from "../models/User.js";
import Message from "../models/Message.js";
import { sendSuccess, sendError } from "../utils/helpers.js";
import { getIO } from "../config/socket.js";
import { deleteCloudinaryUrl } from "../config/cloudinary.js";

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
    const { id } = req.params;
    let query;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query = { _id: id };
    } else {
      query = { username: id.toLowerCase() };
    }
    const user = await User.findOne(query)
      .select("-googleId -mutedChats -hiddenChats -blockedUsers -reportedBy -pushSubscriptions");
    if (!user) return sendError(res, "USER_NOT_FOUND", "User not found", 404);

    const userObj = user.toObject();
    const isOwner = req.userId && req.userId.toString() === user._id.toString();
    if (!userObj.showPhoneNumber && !isOwner) {
      delete userObj.phoneNumber;
    }

    sendSuccess(res, { user: userObj });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/users/profile — update name, username, photoURL, bio, readReceiptsEnabled, lastSeenVisibility
export async function updateProfile(req, res) {
  try {
    const { name, username, photoURL, coverURL, bio, socialLinks, phoneNumber, showPhoneNumber, readReceiptsEnabled, lastSeenVisibility } = req.body;
    const updates = {};

    // Fetch existing user to handle Cloudinary cleanup and username rules
    const currentUser = await User.findById(req.userId).select("username usernameHistory photoURL coverURL");
    if (!currentUser) return sendError(res, "USER_NOT_FOUND", "User not found", 404);

    if (name !== undefined) updates.name = name;
    if (socialLinks !== undefined) updates.socialLinks = socialLinks;
    if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
    if (showPhoneNumber !== undefined) updates.showPhoneNumber = Boolean(showPhoneNumber);
    if (bio !== undefined) updates.bio = bio.slice(0, 150);
    if (readReceiptsEnabled !== undefined) updates.readReceiptsEnabled = readReceiptsEnabled;
    if (lastSeenVisibility !== undefined && ["everyone", "nobody"].includes(lastSeenVisibility)) {
      updates.lastSeenVisibility = lastSeenVisibility;
    }

    // Automatically delete old Cloudinary profile pic when a new one is uploaded
    if (photoURL !== undefined) {
      updates.photoURL = photoURL;
      if (currentUser.photoURL && currentUser.photoURL !== photoURL) {
        deleteCloudinaryUrl(currentUser.photoURL).catch(() => {});
      }
    }

    // Automatically delete old Cloudinary cover banner when a new one is uploaded
    if (coverURL !== undefined) {
      updates.coverURL = coverURL;
      if (currentUser.coverURL && currentUser.coverURL !== coverURL) {
        deleteCloudinaryUrl(currentUser.coverURL).catch(() => {});
      }
    }

    if (username) {

      // Don't count as change if username is the same
      if (username !== currentUser.username) {
        // Check uniqueness
        const existing = await User.findOne({ username, _id: { $ne: req.userId } });
        if (existing) return sendError(res, "VALIDATION_ERROR", "Username already taken", 400);

        // Enforce max 3 username changes in 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentChanges = (currentUser.usernameHistory || []).filter(
          (h) => new Date(h.changedAt) > thirtyDaysAgo
        );
        if (recentChanges.length >= 3) {
          return sendError(
            res,
            "RATE_LIMITED",
            "You can only change your username 3 times in 30 days",
            429
          );
        }

        updates.username = username;
        // Push old username to history
        updates.$push = {
          usernameHistory: { username: currentUser.username, changedAt: new Date() },
        };
      }
    }

    // Separate $set from $push for mongoose
    const { $push: pushOp, ...setOp } = updates;
    let user;
    if (pushOp) {
      user = await User.findByIdAndUpdate(
        req.userId,
        { $set: setOp, $push: pushOp },
        { new: true }
      ).select("-googleId -mutedChats -hiddenChats -blockedUsers");
    } else {
      user = await User.findByIdAndUpdate(req.userId, setOp, { new: true })
        .select("-googleId -mutedChats -hiddenChats -blockedUsers");
    }

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

// GET /api/users/me/activity — message count per day (last 30 days) for graph
export async function getActivityStats(req, res) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const stats = await Message.aggregate([
      {
        $match: {
          senderId: new (await import("mongoose")).default.Types.ObjectId(req.userId),
          createdAt: { $gte: thirtyDaysAgo },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill in missing days with 0
    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const found = stats.find((s) => s._id === key);
      result.push({ date: key, count: found ? found.count : 0 });
    }

    const totalMessages = result.reduce((a, b) => a + b.count, 0);
    const totalChats = await Message.distinct("chatId", { senderId: req.userId }).then((r) => r.length);

    sendSuccess(res, { daily: result, totalMessages, totalChats });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}


// POST /api/users/push-subscribe
export async function subscribePush(req, res) {
  try {
    const { subscription, device } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return sendError(res, "VALIDATION_ERROR", "Invalid subscription payload", 400);
    }

    const user = await User.findById(req.userId);
    if (!user) return sendError(res, "USER_NOT_FOUND", "User not found", 404);

    const exists = user.pushSubscriptions?.some((s) => s.endpoint === subscription.endpoint);
    if (!exists) {
      user.pushSubscriptions.push({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        device: device || "browser",
      });
      await user.save();
    }

    sendSuccess(res, { subscribed: true });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// POST /api/users/push-unsubscribe
export async function unsubscribePush(req, res) {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return sendError(res, "VALIDATION_ERROR", "Endpoint required", 400);
    }

    await User.findByIdAndUpdate(req.userId, {
      $pull: { pushSubscriptions: { endpoint } },
    });

    sendSuccess(res, { unsubscribed: true });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

export default {
  searchUsers, getUserProfile, updateProfile, getSettings,
  muteChat, unmuteChat, hideChat, unhideChat,
  getBlockedUsers, blockUser, unblockUser,
  reportMessage, getActivityStats, subscribePush, unsubscribePush,

};