import Chat from "../models/Chat.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { getIO } from "../config/socket.js";
import { sendSuccess, sendError } from "../utils/helpers.js";

// GET /api/chats — get all chats for current user
export async function getChats(req, res) {
  try {
    const chats = await Chat.find({ participants: req.userId })
      .populate({
        path: "participants",
        select: "name username photoURL isOnline lastSeen role status",
      })
      .sort({ "lastMessage.updatedAt": -1 });

    sendSuccess(res, { chats });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// POST /api/chats — create or get existing 1-on-1 chat
export async function createChat(req, res) {
  try {
    const { userId } = req.body;

    // Check if a chat already exists between these two users
    let chat = await Chat.findOne({
      participants: { $all: [req.userId, userId], $size: 2 },
    }).populate({
      path: "participants",
      select: "name username photoURL isOnline lastSeen role status",
    });

    if (!chat) {
      chat = await Chat.create({ participants: [req.userId, userId] });
      chat = await chat.populate({
        path: "participants",
        select: "name username photoURL isOnline lastSeen role status",
      });
    }

    sendSuccess(res, { chat });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// GET /api/chats/:chatId/messages?cursor=
export async function getMessages(req, res) {
  try {
    const { chatId } = req.params;
    const { cursor } = req.query;
    const limit = 50;

    // Verify chat belongs to user
    const chat = await Chat.findOne({
      _id: chatId,
      participants: req.userId,
    });

    if (!chat) {
      return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);
    }

    let query = { chatId };

    if (cursor) {
      const [createdAt, id] = cursor.split("_");
      query.createdAt = { $lt: new Date(createdAt) };
      query._id = { $lt: id };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);

    // Reverse to chronological order
    messages.reverse();

    // Build nextCursor
    let nextCursor = null;
    if (messages.length === limit) {
      const oldest = messages[0];
      nextCursor = `${oldest.createdAt.toISOString()}_${oldest._id}`;
    }

    sendSuccess(res, { messages, nextCursor });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

export default { getChats, createChat, getMessages };

// DELETE /api/chats/:chatId/messages — clear all messages in a chat (for the requesting user)
export async function clearChatMessages(req, res) {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findOne({ _id: chatId, participants: req.userId });
    if (!chat) return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);

    // Soft-delete all messages in this chat
    await Message.updateMany(
      { chatId },
      { isDeleted: true, text: "", fileUrl: null, publicId: null }
    );

    // Notify the other participant via socket
    const io = getIO();
    if (io) {
      const otherId = chat.participants.find(
        (p) => p.toString() !== req.userId.toString()
      );
      if (otherId) {
        io.to(otherId.toString()).emit("chat_cleared", { chatId });
      }
    }

    sendSuccess(res, { message: "Chat cleared" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/chats/:chatId/block — block the other user in this chat
export async function blockUserInChat(req, res) {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findOne({ _id: chatId, participants: req.userId });
    if (!chat) return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);

    const targetId = chat.participants.find(
      (p) => p.toString() !== req.userId.toString()
    );
    if (!targetId) return sendError(res, "USER_NOT_FOUND", "User not found", 404);

    // Add targetId to requester's blockedUsers list (stored on User model)
    await User.findByIdAndUpdate(req.userId, {
      $addToSet: { blockedUsers: targetId },
    });

    sendSuccess(res, { message: "User blocked" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/chats/:chatId/unblock — unblock the other user
export async function unblockUserInChat(req, res) {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findOne({ _id: chatId, participants: req.userId });
    if (!chat) return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);

    const targetId = chat.participants.find(
      (p) => p.toString() !== req.userId.toString()
    );

    await User.findByIdAndUpdate(req.userId, {
      $pull: { blockedUsers: targetId },
    });

    sendSuccess(res, { message: "User unblocked" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// DELETE /api/chats/:chatId — delete a chat entirely (both sides)
export async function deleteChat(req, res) {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findOne({ _id: chatId, participants: req.userId });
    if (!chat) return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);

    // Delete all messages
    await Message.deleteMany({ chatId });
    // Delete the chat
    await Chat.findByIdAndDelete(chatId);

    // Notify other participant
    const io = getIO();
    if (io) {
      const otherId = chat.participants.find(
        (p) => p.toString() !== req.userId.toString()
      );
      if (otherId) io.to(otherId.toString()).emit("chat_deleted", { chatId });
    }

    sendSuccess(res, { message: "Chat deleted" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}