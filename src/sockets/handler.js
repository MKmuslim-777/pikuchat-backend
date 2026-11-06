import { sendPushNotification } from "../utils/pushNotifier.js";
import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";
import logger from "../utils/logger.js";
import { areSameSocketId } from "../utils/socketIds.js";
import { createMessageOnce } from "../utils/createMessage.js";

/*
 * Room strategy: each user joins a room named by their userId string.
 * To deliver to a user → io.to(userId).emit(...)
 * This is always reliable because ObjectId.toString() is idempotent.
 */

export default function socketHandler(io, socket) {
  const userId = socket.userId; // guaranteed string by authMiddleware

  logger.info(`Socket connected: ${userId} (socket ${socket.id})`);

  // ── Join personal room ────────────────────────────────────────────────────
  socket.join(userId);

  // ── Online status ─────────────────────────────────────────────────────────
  User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() }).exec();
  socket.broadcast.emit("user_status", { userId, isOnline: true });

  // ── Helper: notify every other member of a conversation ───────────────────
  async function emitToOtherMembers(chatId, event, payload) {
    const chat = await Chat.findOne({ _id: chatId, participants: userId })
      .select("participants")
      .lean();
    if (!chat) return;
    for (const participantId of chat.participants) {
      const targetId = participantId.toString();
      if (targetId !== userId) io.to(targetId).emit(event, payload);
    }
  }

  // ── send_message ──────────────────────────────────────────────────────────
  socket.on("send_message", async (data, ack) => {
    try {
      const {
        chatId,
        receiverId,
        text,
        fileUrl,
        fileType,
        publicId,
        replyTo,
        voiceDuration,
        isViewOnce,
        clientMessageId,
      } = data;

      if (!chatId || !receiverId) {
        return ack?.({ success: false, error: "chatId and receiverId are required" });
      }

      // Verify sender is a participant
      const chat = await Chat.findOne({ _id: chatId, participants: userId })
        .select("participants")
        .lean();
      if (!chat) {
        return ack?.({ success: false, error: "Chat not found or access denied" });
      }

      const chatParticipants = chat.participants.map((participant) => participant.toString());
      if (
        areSameSocketId(receiverId, userId) ||
        !chatParticipants.some((participantId) => areSameSocketId(participantId, receiverId))
      ) {
        return ack?.({ success: false, error: "Invalid chat recipient" });
      }

      // Persist message
      const { message, created } = await createMessageOnce({
        chatId,
        senderId:   userId,
        receiverId: receiverId.toString(),
        text:       text?.trim() || "",
        fileUrl:    fileUrl  || null,
        fileType:   fileType || null,
        voiceDuration: voiceDuration ? Number(voiceDuration) : 0,
        publicId:   publicId || null,
        clientMessageId,
        isViewOnce: !!isViewOnce,
        isViewed:   false,
        replyTo:    replyTo?.text || replyTo?._id
          ? {
              _id:      replyTo._id,
              text:     replyTo.text     || "",
              senderId: replyTo.senderId || userId,
              fileType: replyTo.fileType || null,
            }
          : undefined,
      });

      if (!created) {
        return ack?.({ success: true, message: message.toObject() });
      }

      // Update chat's lastMessage
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: {
          text:      text?.trim() || (fileType === "voice" || fileType === "audio" ? "🎤 Voice message" : (fileUrl ? "📎 File" : "")),
          senderId:  userId,
          updatedAt: new Date(),
        },
      });

      const msgObj = message.toObject();

      // Deliver to every other member, including all group members.
      for (const participantId of chatParticipants) {
        if (!areSameSocketId(participantId, userId)) {
          io.to(participantId).emit("receive_message", msgObj);
        }
      }
      // Echo back to sender's other sessions/tabs
      socket.emit("receive_message", { ...msgObj, isSenderEcho: true });

      const notificationBody = isViewOnce
        ? "Sent you a view-once message"
        : text?.trim()
          ? text.trim().slice(0, 120)
          : fileType === "voice" || fileType === "audio"
            ? "Sent you a voice message"
            : fileType === "image"
              ? "Sent you a photo"
              : fileUrl
                ? "Sent you a file"
                : "Sent you a message";
      const notificationPayload = {
          title: socket.userDoc?.name || "New message",
          body: notificationBody,
          icon: socket.userDoc?.photoURL || "/favicon.ico",
          chatId: chatId.toString(),
          senderId: userId,
          tag: `piku-msg-${chatId}-${message._id}`,
          data: { url: `/chat/${chatId}`, chatId: chatId.toString() },
        };
      for (const participantId of chatParticipants) {
        if (!areSameSocketId(participantId, userId)) {
          void sendPushNotification(participantId, notificationPayload, io);
        }
      }

      ack?.({ success: true, message: msgObj });
    } catch (err) {
      logger.error("send_message error:", err.message);
      ack?.({ success: false, error: err.message });
    }
  });

  // ── typing_start ──────────────────────────────────────────────────────────
  socket.on("typing_start", async ({ chatId }) => {
    try {
      await emitToOtherMembers(chatId, "typing_start", { chatId, userId });
    } catch (err) {
      logger.error("typing_start error:", err.message);
    }
  });

  // ── typing_stop ───────────────────────────────────────────────────────────
  socket.on("typing_stop", async ({ chatId }) => {
    try {
      await emitToOtherMembers(chatId, "typing_stop", { chatId, userId });
    } catch (err) {
      logger.error("typing_stop error:", err.message);
    }
  });

  // ── message_read ──────────────────────────────────────────────────────────
  socket.on("message_read", async ({ chatId }) => {
    try {
      const chat = await Chat.findOne({ _id: chatId, participants: userId })
        .select("isGroup")
        .lean();
      if (!chat) return;
      if (!chat.isGroup) {
        await Message.updateMany(
          { chatId, receiverId: userId, isSeen: false },
          { isSeen: true }
        );
      }
      await emitToOtherMembers(chatId, "message_read", { chatId, readBy: userId });
    } catch (err) {
      logger.error("message_read error:", err.message);
    }
  });

  // ── message_viewed_once ───────────────────────────────────────────────────
  socket.on("message_viewed_once", async ({ messageId }, ack) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return ack?.({ success: false, error: "Message not found" });
      if (!msg.isViewOnce) return ack?.({ success: false, error: "Not a view-once message" });
      const chat = await Chat.findOne({ _id: msg.chatId, participants: userId }).select("_id");
      if (!chat) return ack?.({ success: false, error: "Chat access denied" });

      msg.isViewed = true;
      await msg.save();

      const payload = { messageId: msg._id, chatId: msg.chatId, isViewed: true };
      await emitToOtherMembers(msg.chatId, "message_viewed_once", payload);
      socket.emit("message_viewed_once", payload);
      ack?.({ success: true });
    } catch (err) {
      logger.error("message_viewed_once error:", err.message);
      ack?.({ success: false, error: err.message });
    }
  });

  // ── message_edit ──────────────────────────────────────────────────────────
  socket.on("message_edit", async ({ messageId, text }, ack) => {
    try {
      const msg = await Message.findOne({ _id: messageId, senderId: userId });
      if (!msg) return ack?.({ success: false, error: "Message not found" });
      const chat = await Chat.findOne({ _id: msg.chatId, participants: userId }).select("_id");
      if (!chat) return ack?.({ success: false, error: "Chat access denied" });

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (msg.createdAt < cutoff) {
        return ack?.({ success: false, error: "Cannot edit messages older than 24 hours" });
      }

      msg.text     = text.trim();
      msg.isEdited = true;
      await msg.save();

      const payload = { messageId, text: msg.text };
      await emitToOtherMembers(msg.chatId, "message_edited", payload);
      socket.emit("message_edited", payload);
      ack?.({ success: true });
    } catch (err) {
      logger.error("message_edit error:", err.message);
      ack?.({ success: false, error: err.message });
    }
  });

  // ── message_delete ────────────────────────────────────────────────────────
  socket.on("message_delete", async ({ messageId }, ack) => {
    try {
      const msg = await Message.findOne({ _id: messageId, senderId: userId });
      if (!msg) return ack?.({ success: false, error: "Message not found" });
      const chat = await Chat.findOne({ _id: msg.chatId, participants: userId }).select("_id");
      if (!chat) return ack?.({ success: false, error: "Chat access denied" });

      if (msg.publicId) {
        deleteFromCloudinary(msg.publicId).catch((e) =>
          logger.error("Cloudinary delete error:", e.message)
        );
      }

      msg.isDeleted = true;
      msg.text      = "";
      msg.fileUrl   = null;
      msg.publicId  = null;
      await msg.save();

      const payload = { messageId };
      await emitToOtherMembers(msg.chatId, "message_deleted", payload);
      socket.emit("message_deleted", payload);
      ack?.({ success: true });
    } catch (err) {
      logger.error("message_delete error:", err.message);
      ack?.({ success: false, error: err.message });
    }
  });

  // ── message_react ─────────────────────────────────────────────────────────
  socket.on("message_react", async ({ messageId, emoji }, ack) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return ack?.({ success: false, error: "Message not found" });
      const chat = await Chat.findOne({ _id: msg.chatId, participants: userId }).select("_id");
      if (!chat) return ack?.({ success: false, error: "Chat access denied" });

      const existing = msg.reactions.find(
        (r) => r.userId.toString() === userId && r.emoji === emoji
      );
      if (existing) {
        msg.reactions = msg.reactions.filter(
          (r) => !(r.userId.toString() === userId && r.emoji === emoji)
        );
      } else {
        // One reaction per user — replace previous
        msg.reactions = msg.reactions.filter((r) => r.userId.toString() !== userId);
        msg.reactions.push({ userId, emoji });
      }
      await msg.save();

      const payload = { messageId: msg._id, reactions: msg.reactions };
      await emitToOtherMembers(msg.chatId, "message_reaction", payload);
      socket.emit("message_reaction", payload);
      ack?.({ success: true, reactions: msg.reactions });
    } catch (err) {
      logger.error("message_react error:", err.message);
      ack?.({ success: false, error: err.message });
    }
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    logger.info(`Socket disconnected: ${userId} (${reason})`);
    User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() }).exec();
    socket.broadcast.emit("user_status", { userId, isOnline: false });
  });

  // ── error ─────────────────────────────────────────────────────────────────
  socket.on("error", (err) => {
    logger.error(`Socket error for ${userId}:`, err.message);
  });
}
