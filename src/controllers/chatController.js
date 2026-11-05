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
    const targetUserId = req.body.userId || req.body.recipientId;
    if (!targetUserId) {
      return sendError(res, "VALIDATION_ERROR", "userId is required", 400);
    }
    const userId = targetUserId;

    // Check if a chat already exists between these two users
    let chat = await Chat.findOne({
      isGroup: { $ne: true },
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

// POST /api/chats/group — create a group chat (users may belong to at most 3)
export async function createGroup(req, res) {
  const memberIds = [...new Set([req.userId.toString(), ...req.body.userIds])];
  if (memberIds.length < 2) {
    return sendError(res, "VALIDATION_ERROR", "Select at least one other person", 400);
  }
  const reservedIds = [];
  let createdChat;

  try {
    const members = await User.find({
      _id: { $in: memberIds },
      "status.isBlocked": { $ne: true },
    }).select("_id blockedUsers");

    if (members.length !== memberIds.length) {
      return sendError(res, "USER_NOT_FOUND", "One or more selected users are unavailable", 400);
    }

    const memberIdSet = new Set(memberIds);
    const hasBlockedPair = members.some((member) =>
      (member.blockedUsers || []).some((blockedId) =>
        memberIdSet.has(blockedId.toString()) &&
        blockedId.toString() !== member._id.toString()
      )
    );
    if (hasBlockedPair) {
      return sendError(res, "GROUP_MEMBER_BLOCKED", "A selected member cannot be added to this group", 400);
    }

    for (const memberId of memberIds) {
      const reserved = await User.findOneAndUpdate(
        {
          _id: memberId,
          $or: [
            { groupChatCount: { $lt: 3 } },
            { groupChatCount: { $exists: false } },
          ],
        },
        { $inc: { groupChatCount: 1 } },
        { new: true, projection: { _id: 1 } },
      );

      if (!reserved) {
        await User.updateMany(
          { _id: { $in: reservedIds } },
          { $inc: { groupChatCount: -1 } },
        );
        reservedIds.length = 0;
        return sendError(
          res,
          "GROUP_LIMIT_REACHED",
          "Every member can be in at most 3 groups. Remove someone from a group before creating another.",
          409,
        );
      }
      reservedIds.push(memberId);
    }

    createdChat = await Chat.create({
      name: req.body.name,
      isGroup: true,
      participants: memberIds,
    });

    const chat = await Chat.findById(createdChat._id).populate({
      path: "participants",
      select: "name username photoURL isOnline lastSeen role status",
    });
    const io = getIO();
    if (io) {
      for (const memberId of memberIds) {
        if (memberId !== req.userId.toString()) {
          io.to(memberId).emit("group_created", { chat });
        }
      }
    }
    sendSuccess(res, { chat }, 201);
  } catch (error) {
    if (createdChat) await Chat.findByIdAndDelete(createdChat._id);
    if (reservedIds.length) {
      await User.updateMany(
        { _id: { $in: reservedIds } },
        { $inc: { groupChatCount: -1 } },
      );
    }
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

// GET /api/chats/:chatId/export — export chat as plain text (PDF generated client-side)
export async function exportChat(req, res) {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findOne({ _id: chatId, participants: req.userId }).populate(
      "participants", "name username"
    );
    if (!chat) return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);

    const messages = await Message.find({ chatId, isDeleted: false })
      .sort({ createdAt: 1 })
      .lean();

    // Build a JSON payload — client renders it as PDF
    const participants = chat.participants.map((p) => ({
      id: p._id.toString(), name: p.name, username: p.username,
    }));

    const formatted = messages.map((m) => ({
      sender:    participants.find((p) => p.id === m.senderId.toString())?.name || "Unknown",
      text:      m.text || (m.fileUrl ? `[${m.fileType || "file"}: ${m.fileUrl}]` : ""),
      createdAt: m.createdAt,
      isEdited:  m.isEdited,
    }));

    sendSuccess(res, {
      chatId,
      participants,
      messages: formatted,
      exportedAt: new Date(),
    });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

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

    // Notify every other participant, including all group members.
    const io = getIO();
    if (io) {
      for (const participantId of chat.participants) {
        if (participantId.toString() !== req.userId.toString()) {
          io.to(participantId.toString()).emit("chat_cleared", { chatId });
        }
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

    const io = getIO();
    if (chat.isGroup) {
      const updatedChat = await Chat.findOneAndUpdate(
        { _id: chatId, participants: req.userId },
        { $pull: { participants: req.userId } },
        { new: true },
      );
      if (!updatedChat) return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);
      await User.updateOne(
        { _id: req.userId, groupChatCount: { $gt: 0 } },
        { $inc: { groupChatCount: -1 } },
      );

      if (updatedChat.participants.length === 0) {
        await Message.deleteMany({ chatId });
        await Chat.findByIdAndDelete(chatId);
      } else {
        for (const participantId of updatedChat.participants) {
          io?.to(participantId.toString()).emit("group_member_left", {
            chatId,
            userId: req.userId.toString(),
          });
        }
      }
      io?.to(req.userId.toString()).emit("chat_deleted", { chatId });
      return sendSuccess(res, { message: "You left the group" });
    }

    await Message.deleteMany({ chatId });
    await Chat.findByIdAndDelete(chatId);
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