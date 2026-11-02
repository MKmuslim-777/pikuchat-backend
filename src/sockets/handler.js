import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";
import logger from "../utils/logger.js";

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

  // ── Helper: get the OTHER participant's userId string ─────────────────────
  async function getOtherUserId(chatId) {
    const chat = await Chat.findById(chatId).select("participants").lean();
    if (!chat) return null;
    return chat.participants.map((p) => p.toString()).find((id) => id !== userId) || null;
  }

  // ── send_message ──────────────────────────────────────────────────────────
  socket.on("send_message", async (data, ack) => {
    try {
      const { chatId, receiverId, text, fileUrl, fileType, publicId, replyTo } = data;

      if (!chatId || !receiverId) {
        return ack?.({ success: false, error: "chatId and receiverId are required" });
      }

      // Verify sender is a participant
      const chat = await Chat.findOne({ _id: chatId, participants: userId }).lean();
      if (!chat) {
        return ack?.({ success: false, error: "Chat not found or access denied" });
      }

      // Persist message
      const message = await Message.create({
        chatId,
        senderId:   userId,
        receiverId: receiverId.toString(),
        text:       text?.trim() || "",
        fileUrl:    fileUrl  || null,
        fileType:   fileType || null,
        publicId:   publicId || null,
        replyTo:    replyTo?.text || replyTo?._id
          ? {
              _id:      replyTo._id,
              text:     replyTo.text     || "",
              senderId: replyTo.senderId || userId,
              fileType: replyTo.fileType || null,
            }
          : undefined,
      });

      // Update chat's lastMessage
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: {
          text:      text?.trim() || (fileUrl ? "📎 File" : ""),
          senderId:  userId,
          updatedAt: new Date(),
        },
      });

      const msgObj = message.toObject();

      // Deliver to receiver
      io.to(receiverId.toString()).emit("receive_message", msgObj);
      // Echo back to sender's other sessions/tabs
      socket.emit("receive_message", msgObj);

      ack?.({ success: true, message: msgObj });
    } catch (err) {
      logger.error("send_message error:", err.message);
      ack?.({ success: false, error: err.message });
    }
  });

  // ── typing_start ──────────────────────────────────────────────────────────
  socket.on("typing_start", async ({ chatId }) => {
    try {
      const otherId = await getOtherUserId(chatId);
      if (otherId) io.to(otherId).emit("typing_start", { chatId, userId });
    } catch (err) {
      logger.error("typing_start error:", err.message);
    }
  });

  // ── typing_stop ───────────────────────────────────────────────────────────
  socket.on("typing_stop", async ({ chatId }) => {
    try {
      const otherId = await getOtherUserId(chatId);
      if (otherId) io.to(otherId).emit("typing_stop", { chatId, userId });
    } catch (err) {
      logger.error("typing_stop error:", err.message);
    }
  });

  // ── message_read ──────────────────────────────────────────────────────────
  socket.on("message_read", async ({ chatId }) => {
    try {
      await Message.updateMany(
        { chatId, receiverId: userId, isSeen: false },
        { isSeen: true }
      );
      const otherId = await getOtherUserId(chatId);
      if (otherId) io.to(otherId).emit("message_read", { chatId, readBy: userId });
    } catch (err) {
      logger.error("message_read error:", err.message);
    }
  });

  // ── message_edit ──────────────────────────────────────────────────────────
  socket.on("message_edit", async ({ messageId, text }, ack) => {
    try {
      const msg = await Message.findOne({ _id: messageId, senderId: userId });
      if (!msg) return ack?.({ success: false, error: "Message not found" });

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (msg.createdAt < cutoff) {
        return ack?.({ success: false, error: "Cannot edit messages older than 24 hours" });
      }

      msg.text     = text.trim();
      msg.isEdited = true;
      await msg.save();

      const payload = { messageId, text: msg.text };
      io.to(msg.receiverId.toString()).emit("message_edited", payload);
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
      io.to(msg.receiverId.toString()).emit("message_deleted", payload);
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
      io.to(msg.receiverId.toString()).emit("message_reaction", payload);
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
