import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import { getIO } from "../config/socket.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";
import { sendSuccess, sendError } from "../utils/helpers.js";
import { sendPushNotification } from "../utils/pushNotifier.js";
import { areSameSocketId } from "../utils/socketIds.js";
import { createMessageOnce } from "../utils/createMessage.js";

async function emitToChatMembers(io, chatId, event, payload) {
  if (!io) return;
  const chat = await Chat.findById(chatId).select("participants").lean();
  for (const participantId of chat?.participants || []) {
    io.to(participantId.toString()).emit(event, payload);
  }
}

// POST /api/messages — send message (REST fallback)
export async function sendMessage(req, res) {
  try {
    const {
      chatId,
      receiverId,
      text,
      fileUrl,
      fileType,
      voiceDuration,
      publicId,
      clientMessageId,
      replyTo,
    } = req.body;

    // Verify chat belongs to sender
    const chat = await Chat.findOne({
      _id: chatId,
      participants: req.userId,
    });

    if (!chat) {
      return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);
    }

    const recipientId = receiverId?.toString();
    const participantIds = chat.participants.map((participant) => participant.toString());
    if (
      !recipientId ||
      areSameSocketId(recipientId, req.userId) ||
      !participantIds.some((participantId) => areSameSocketId(participantId, recipientId))
    ) {
      return sendError(res, "VALIDATION_ERROR", "Invalid chat recipient", 400);
    }

    // Check if either user blocked the other
    const User = (await import("../models/User.js")).default;
    const [senderDoc, recipientDoc] = await Promise.all([
      User.findById(req.userId).select("blockedUsers"),
      User.findById(recipientId).select("blockedUsers"),
    ]);
    const isBlockedByReceiver = recipientDoc?.blockedUsers?.some((id) => areSameSocketId(id, req.userId));
    const isBlockedBySender = senderDoc?.blockedUsers?.some((id) => areSameSocketId(id, recipientId));
    if (isBlockedByReceiver || isBlockedBySender) {
      return sendError(
        res,
        "USER_BLOCKED",
        isBlockedByReceiver ? "You have been blocked by this user" : "You have blocked this user",
        403
      );
    }

    const { message, created } = await createMessageOnce({
      chatId,
      senderId: req.userId,
      receiverId: recipientId,
      text: text || "",
      fileUrl: fileUrl || null,
      fileType: fileType || null,
      voiceDuration: voiceDuration ? Number(voiceDuration) : 0,
      publicId: publicId || null,
      clientMessageId,
      replyTo: replyTo?._id || replyTo?.text
        ? {
            _id: replyTo._id,
            text: replyTo.text || "",
            senderId: replyTo.senderId,
            fileType: replyTo.fileType || null,
          }
        : undefined,
    });

    if (!created) {
      return sendSuccess(res, { message });
    }

    // Update chat lastMessage
    chat.lastMessage = {
      text: text || (fileType === "voice" || fileType === "audio" ? "🎤 Voice message" : (fileUrl ? "📎 File" : "")),
      senderId: req.userId,
      updatedAt: new Date(),
    };
    await chat.save();

    // Emit to all other members when sending into a group conversation.
    const io = getIO();
    if (io) {
      for (const participantId of participantIds) {
        if (!areSameSocketId(participantId, req.userId)) {
          io.to(participantId).emit("receive_message", message);
        }
      }
    }

    const notificationBody = text?.trim()
      ? text.trim().slice(0, 120)
      : fileType === "voice" || fileType === "audio"
        ? "Sent you a voice message"
        : fileType === "image"
          ? "Sent you a photo"
          : fileUrl
            ? "Sent you a file"
            : "Sent you a message";
    const notificationPayload = {
        title: req.user?.name || "New message",
        body: notificationBody,
        icon: req.user?.photoURL || "/favicon.ico",
        chatId: chatId.toString(),
        senderId: req.userId.toString(),
        tag: `piku-msg-${chatId}-${message._id}`,
        data: { url: `/chat/${chatId}`, chatId: chatId.toString() },
      };
    for (const participantId of participantIds) {
      if (!areSameSocketId(participantId, req.userId)) {
        void sendPushNotification(participantId, notificationPayload, io);
      }
    }

    sendSuccess(res, { message });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/messages/:id — edit own message
export async function editMessage(req, res) {
  try {
    const { text } = req.body;
    const message = await Message.findOne({
      _id: req.params.id,
      senderId: req.userId,
    });

    if (!message) {
      return sendError(res, "MESSAGE_NOT_FOUND", "Message not found", 404);
    }
    const chat = await Chat.findOne({ _id: message.chatId, participants: req.userId }).select("_id");
    if (!chat) return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);

    // Can only edit within 24 hours
    const hoursSinceCreated =
      (Date.now() - message.createdAt) / (1000 * 60 * 60);
    if (hoursSinceCreated > 24) {
      return sendError(
        res,
        "VALIDATION_ERROR",
        "Cannot edit messages older than 24 hours",
        400,
      );
    }

    message.text = text;
    message.isEdited = true;
    await message.save();

    // Emit via socket
    const io = getIO();
    await emitToChatMembers(io, message.chatId, "message_edited", {
      messageId: message._id,
      text: message.text,
    });

    sendSuccess(res, { message });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// DELETE /api/messages/:id — delete own message
export async function deleteMessage(req, res) {
  try {
    const message = await Message.findOne({
      _id: req.params.id,
      senderId: req.userId,
    });

    if (!message) {
      return sendError(res, "MESSAGE_NOT_FOUND", "Message not found", 404);
    }
    const chat = await Chat.findOne({ _id: message.chatId, participants: req.userId }).select("_id");
    if (!chat) return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);

    // Delete file from Cloudinary if present
    if (message.publicId) {
      deleteFromCloudinary(message.publicId).catch(() => {});
    }

    message.isDeleted = true;
    message.text = "";
    message.fileUrl = null;
    message.publicId = null;
    await message.save();

    // Emit via socket
    const io = getIO();
    await emitToChatMembers(io, message.chatId, "message_deleted", {
      messageId: message._id,
    });

    sendSuccess(res, { message: "Message deleted" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

// PATCH /api/messages/:id/react — add or remove emoji reaction
export async function reactToMessage(req, res) {
  try {
    const { emoji } = req.body;
    if (!emoji)
      return sendError(res, "VALIDATION_ERROR", "Emoji is required", 400);

    const message = await Message.findById(req.params.id);
    if (!message)
      return sendError(res, "MESSAGE_NOT_FOUND", "Message not found", 404);
    const chat = await Chat.findOne({ _id: message.chatId, participants: req.userId }).select("_id");
    if (!chat) return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);

    const existing = message.reactions.find(
      (r) => r.userId.toString() === req.userId.toString() && r.emoji === emoji,
    );

    if (existing) {
      // Toggle off — remove reaction
      message.reactions = message.reactions.filter(
        (r) =>
          !(r.userId.toString() === req.userId.toString() && r.emoji === emoji),
      );
    } else {
      // Remove any other reaction from this user on this message first (one reaction per user)
      message.reactions = message.reactions.filter(
        (r) => r.userId.toString() !== req.userId.toString(),
      );
      message.reactions.push({ userId: req.userId, emoji });
    }

    await message.save();

    // Emit the updated reaction to every conversation member.
    const io = getIO();
    await emitToChatMembers(io, message.chatId, "message_reaction", {
      messageId: message._id,
      reactions: message.reactions,
    });

    sendSuccess(res, { reactions: message.reactions });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

export default { sendMessage, editMessage, deleteMessage, reactToMessage };
