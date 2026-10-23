import User from "../models/User.js";
import Chat from "../models/Chat.js";
import Message from "../models/Message.js";
import BannedKeyword from "../models/BannedKeyword.js";
import { getIO } from "../config/socket.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";
import { sendSuccess, sendError } from "../utils/helpers.js";

// GET /api/admin/stats
export async function getStats(req, res) {
  try {
    const [totalUsers, totalChats, totalMessages, blockedUsers, onlineUsers, recentUsers] =
      await Promise.all([
        User.countDocuments(),
        Chat.countDocuments(),
        Message.countDocuments(),
        User.countDocuments({ "status.isBlocked": true }),
        User.countDocuments({ isOnline: true }),
        User.find().sort({ createdAt: -1 }).limit(5).select("name username photoURL createdAt isOnline"),
      ]);

    sendSuccess(res, {
      totalUsers,
      totalChats,
      totalMessages,
      blockedUsers,
      onlineUsers,
      recentUsers,
    });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/admin/users — list all users with filters
export async function getAllUsers(req, res) {
  try {
    const { search, role, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (role) filter.role = role;
    if (status === "blocked") filter["status.isBlocked"] = true;
    if (status === "muted") filter["status.isMuted"] = true;
    if (status === "active") {
      filter["status.isBlocked"] = { $ne: true };
      filter["status.isMuted"] = { $ne: true };
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-googleId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    sendSuccess(res, { users, totalPages, currentPage: parseInt(page), total });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/admin/users/:id/block
export async function blockUser(req, res) {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        "status.isBlocked": true,
        "status.blockReason": reason || "Blocked by admin",
      },
      { new: true }
    ).select("-googleId");

    if (!user) return sendError(res, "USER_NOT_FOUND", "User not found", 404);

    // Force socket disconnect
    const io = getIO();
    if (io) {
      io.to(req.params.id).emit("account_status_changed", {
        status: "blocked",
        reason: user.status.blockReason,
      });
    }

    sendSuccess(res, { user });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/admin/users/:id/unblock
export async function unblockUser(req, res) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        "status.isBlocked": false,
        "status.blockReason": "",
      },
      { new: true }
    ).select("-googleId");

    if (!user) return sendError(res, "USER_NOT_FOUND", "User not found", 404);

    sendSuccess(res, { user });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/admin/users/:id/mute
export async function muteUser(req, res) {
  try {
    const { mutedUntil } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        "status.isMuted": true,
        "status.mutedUntil": mutedUntil ? new Date(mutedUntil) : null,
      },
      { new: true }
    ).select("-googleId");

    if (!user) return sendError(res, "USER_NOT_FOUND", "User not found", 404);

    // Notify via socket
    const io = getIO();
    if (io) {
      io.to(req.params.id).emit("account_status_changed", {
        status: "muted",
        mutedUntil: user.status.mutedUntil,
      });
    }

    sendSuccess(res, { user });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/admin/users/:id/unmute
export async function unmuteUser(req, res) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        "status.isMuted": false,
        "status.mutedUntil": null,
      },
      { new: true }
    ).select("-googleId");

    if (!user) return sendError(res, "USER_NOT_FOUND", "User not found", 404);

    sendSuccess(res, { user });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/admin/chats — list all chats
export async function getAllChats(req, res) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = {};
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { username: { $regex: search, $options: "i" } },
        ],
      }).select("_id");
      const userIds = users.map((u) => u._id);
      filter = { participants: { $in: userIds } };
    }

    const [chats, total] = await Promise.all([
      Chat.find(filter)
        .populate({
          path: "participants",
          select: "name username photoURL isOnline lastSeen role",
        })
        .sort({ "lastMessage.updatedAt": -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Chat.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    sendSuccess(res, { chats, totalPages, currentPage: parseInt(page), total });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/admin/chats/:chatId — get a specific chat
export async function getChatDetails(req, res) {
  try {
    const chat = await Chat.findById(req.params.chatId).populate({
      path: "participants",
      select: "name username photoURL isOnline lastSeen role",
    });

    if (!chat) return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);

    sendSuccess(res, { chat });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/admin/chats/:chatId/messages — get messages for admin viewer
export async function getChatMessages(req, res) {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total] = await Promise.all([
      Message.find({ chatId: req.params.chatId })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Message.countDocuments({ chatId: req.params.chatId }),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    sendSuccess(res, { messages, totalPages, currentPage: parseInt(page), total });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/admin/keywords — list all banned keywords
export async function getKeywords(req, res) {
  try {
    const keywords = await BannedKeyword.find()
      .populate("addedBy", "name username")
      .sort({ createdAt: -1 });

    sendSuccess(res, { keywords });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// POST /api/admin/keywords — add banned keyword
export async function addKeyword(req, res) {
  try {
    const { word } = req.body;

    const existing = await BannedKeyword.findOne({ word: word.toLowerCase() });
    if (existing) {
      return sendError(res, "VALIDATION_ERROR", "Keyword already exists", 400);
    }

    const keyword = await BannedKeyword.create({
      word: word.toLowerCase(),
      addedBy: req.userId,
    });

    sendSuccess(res, { keyword });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// DELETE /api/admin/keywords/:id — remove banned keyword
export async function deleteKeyword(req, res) {
  try {
    const keyword = await BannedKeyword.findByIdAndDelete(req.params.id);
    if (!keyword) return sendError(res, "NOT_FOUND", "Keyword not found", 404);

    sendSuccess(res, { message: "Keyword removed" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// POST /api/admin/audit — run safety audit scan
export async function runAudit(req, res) {
  try {
    const keywords = await BannedKeyword.find().select("word");
    const keywordList = keywords.map((k) => k.word);

    if (keywordList.length === 0) {
      return sendSuccess(res, { matches: [], totalScanned: 0, keywordsCount: 0 });
    }

    // Escape regex special characters to prevent crash on keywords like "." or "+"
    const escapedKeywords = keywordList.map((kw) =>
      kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const regexPattern = escapedKeywords.join("|");

    // Find all non-deleted text messages containing banned keywords
    const messages = await Message.find({
      text: { $ne: "", $regex: regexPattern, $options: "i" },
      isDeleted: false,
    })
      .populate("senderId", "name username photoURL")
      .populate("receiverId", "name username")
      .limit(500)
      .lean();

    const matches = messages
      .filter((msg) => msg.senderId && msg.receiverId)
      .map((msg) => {
        const matchedKeyword = keywordList.find((kw) =>
          msg.text?.toLowerCase().includes(kw.toLowerCase())
        );
        return {
          messageId: msg._id,
          messageText: msg.text,
          createdAt: msg.createdAt,
          sender: msg.senderId,
          receiver: msg.receiverId,
          keyword: matchedKeyword || "",
        };
      })
      .filter((m) => m.keyword);

    sendSuccess(res, {
      matches,
      totalScanned: messages.length,
      keywordsCount: keywordList.length,
    });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/admin/gallery — list all shared images (paginated)
export async function getGallery(req, res) {
  try {
    const { page = 1, limit = 40, fileType = "image" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {
      fileUrl: { $ne: null },
      isDeleted: false,
    };
    if (fileType && fileType !== "all") {
      filter.fileType = fileType;
    } else {
      filter.fileType = { $in: ["image", "video", "audio", "document", "other"] };
    }

    const [files, total] = await Promise.all([
      Message.find(filter)
        .populate("senderId", "name username photoURL")
        .populate("receiverId", "name username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Message.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));
    sendSuccess(res, { files, totalPages, currentPage: parseInt(page), total });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// DELETE /api/admin/gallery/:id — admin delete a shared file message
export async function adminDeleteFile(req, res) {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) return sendError(res, "NOT_FOUND", "File not found", 404);

    // Delete file from Cloudinary if present
    if (message.publicId) {
      deleteFromCloudinary(message.publicId).catch(() => {});
    }

    message.isDeleted = true;
    message.fileUrl = null;
    message.fileType = null;
    message.publicId = null;
    message.text = "";
    await message.save();

    const io = getIO();
    if (io) {
      io.to(message.receiverId.toString()).emit("message_deleted", { messageId: message._id });
      io.to(message.senderId.toString()).emit("message_deleted", { messageId: message._id });
    }

    sendSuccess(res, { message: "File deleted" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// DELETE /api/admin/messages/:id — admin delete any message
export async function adminDeleteMessage(req, res) {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) return sendError(res, "MESSAGE_NOT_FOUND", "Message not found", 404);

    // Delete file from Cloudinary if present
    if (message.publicId) {
      deleteFromCloudinary(message.publicId).catch(() => {});
    }

    message.isDeleted = true;
    message.text = "";
    message.fileUrl = null;
    message.publicId = null;
    await message.save();

    const io = getIO();
    if (io) {
      io.to(message.receiverId.toString()).emit("message_deleted", {
        messageId: message._id,
      });
      io.to(message.senderId.toString()).emit("message_deleted", {
        messageId: message._id,
      });
    }

    sendSuccess(res, { message: "Message deleted" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

export default {
  getStats,
  getAllUsers,
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
  getAllChats,
  getChatDetails,
  getChatMessages,
  getKeywords,
  addKeyword,
  deleteKeyword,
  runAudit,
  adminDeleteMessage,
  getGallery,
  adminDeleteFile,
};
