import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import { getIO } from "../config/socket.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";
import logger from "../utils/logger.js";

export default function socketHandler(io, socket) {
  const userId = socket.userId;
  logger.info(`Socket connected: ${userId}`);

  // Join personal room for direct messaging
  socket.join(userId);

  // Update online status
  User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() }).exec();
  // Notify all other clients this user is online
  socket.broadcast.emit("user_status", { userId, isOnline: true });

  // ─── send_message ─────────────────────────────────────────────────────────
  socket.on("send_message", async (data, ack) => {
    try {
      const { chatId, receiverId, text, fileUrl, fileType, publicId } = data;

      if (!chatId || !receiverId) {
        if (ack) ack({ success: false, error: "chatId and receiverId required" });
        return;
      }

      // Verify chat exists and user is participant
      const chat = await Chat.findOne({ _id: chatId, participants: userId });
      if (!chat) {
        if (ack) ack({ success: false, error: "Chat not found" });
        return;
      }

      const message = await Message.create({
        chatId,
        senderId: userId,
        receiverId,
        text: text?.trim() || "",
        fileUrl: fileUrl || null,
        fileType: fileType || null,
        publicId: publicId || null,
      });

      // Update chat lastMessage
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: {
          text: text?.trim() || (fileUrl ? "📎 File" : ""),
          senderId: userId,
          updatedAt: new Date(),
        },
      });

      const messageObj = message.toObject();

      // Deliver to receiver's room
      io.to(receiverId).emit("receive_message", messageObj);
      // Echo back to sender (other tabs / confirmation)
      socket.emit("receive_message", messageObj);

      // Acknowledge
      if (ack) ack({ success: true, message: messageObj });
    } catch (error) {
      logger.error("Socket send_message error:", error.message);
      if (ack) ack({ success: false, error: error.message });
    }
  });

  // ─── typing_start ─────────────────────────────────────────────────────────
  socket.on("typing_start", async ({ chatId }) => {
    try {
      const chat = await Chat.findById(chatId).select("participants");
      if (!chat) return;
      const receiverId = chat.participants
        .map((p) => p.toString())
        .find((id) => id !== userId);
      if (receiverId) {
        io.to(receiverId).emit("typing_start", { chatId, userId });
      }
    } catch (error) {
      logger.error("Socket typing_start error:", error.message);
    }
  });

  // ─── typing_stop ──────────────────────────────────────────────────────────
  socket.on("typing_stop", async ({ chatId }) => {
    try {
      const chat = await Chat.findById(chatId).select("participants");
      if (!chat) return;
      const receiverId = chat.participants
        .map((p) => p.toString())
        .find((id) => id !== userId);
      if (receiverId) {
        io.to(receiverId).emit("typing_stop", { chatId, userId });
      }
    } catch (error) {
      logger.error("Socket typing_stop error:", error.message);
    }
  });

  // ─── message_read ─────────────────────────────────────────────────────────
  socket.on("message_read", async ({ chatId }) => {
    try {
      await Message.updateMany(
        { chatId, receiverId: userId, isSeen: false },
        { isSeen: true }
      );

      const chat = await Chat.findById(chatId).select("participants");
      if (!chat) return;
      const senderId = chat.participants
        .map((p) => p.toString())
        .find((id) => id !== userId);
      if (senderId) {
        io.to(senderId).emit("message_read", { chatId, readBy: userId });
      }
    } catch (error) {
      logger.error("Socket message_read error:", error.message);
    }
  });

  // ─── message_edit ─────────────────────────────────────────────────────────
  socket.on("message_edit", async ({ messageId, text }, ack) => {
    try {
      const msg = await Message.findOne({ _id: messageId, senderId: userId });
      if (!msg) {
        if (ack) ack({ success: false, error: "Message not found" });
        return;
      }
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (msg.createdAt < cutoff) {
        if (ack) ack({ success: false, error: "Cannot edit messages older than 24 hours" });
        return;
      }
      msg.text = text.trim();
      msg.isEdited = true;
      await msg.save();

      io.to(msg.receiverId.toString()).emit("message_edited", {
        messageId,
        text: msg.text,
      });
      socket.emit("message_edited", { messageId, text: msg.text });
      if (ack) ack({ success: true });
    } catch (error) {
      logger.error("Socket message_edit error:", error.message);
      if (ack) ack({ success: false, error: error.message });
    }
  });

  // ─── message_delete ───────────────────────────────────────────────────────
  socket.on("message_delete", async ({ messageId }, ack) => {    try {
      const msg = await Message.findOne({ _id: messageId, senderId: userId });
      if (!msg) {
        if (ack) ack({ success: false, error: "Message not found" });
        return;
      }
      // Delete file from Cloudinary if present
      if (msg.publicId) {
        deleteFromCloudinary(msg.publicId).catch((err) =>
          logger.error("Cloudinary delete error:", err.message)
        );
      }
      msg.isDeleted = true;
      msg.text = "";
      msg.fileUrl = null;
      msg.publicId = null;
      await msg.save();

      io.to(msg.receiverId.toString()).emit("message_deleted", { messageId });
      socket.emit("message_deleted", { messageId });
      if (ack) ack({ success: true });
    } catch (error) {
      logger.error("Socket message_delete error:", error.message);
      if (ack) ack({ success: false, error: error.message });
    }
  });

  // ─── message_react ────────────────────────────────────────────────────────
  socket.on("message_react", async ({ messageId, emoji }, ack) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) { if (ack) ack({ success: false, error: "Message not found" }); return; }

      const existing = msg.reactions.find(
        (r) => r.userId.toString() === userId && r.emoji === emoji
      );
      if (existing) {
        msg.reactions = msg.reactions.filter(
          (r) => !(r.userId.toString() === userId && r.emoji === emoji)
        );
      } else {
        msg.reactions = msg.reactions.filter((r) => r.userId.toString() !== userId);
        msg.reactions.push({ userId, emoji });
      }
      await msg.save();

      const payload = { messageId: msg._id, reactions: msg.reactions };
      io.to(msg.receiverId.toString()).emit("message_reaction", payload);
      socket.emit("message_reaction", payload);
      if (ack) ack({ success: true, reactions: msg.reactions });
    } catch (error) {
      logger.error("Socket message_react error:", error.message);
      if (ack) ack({ success: false, error: error.message });
    }
  });

  // ─── disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    logger.info(`Socket disconnected: ${userId} (${reason})`);
    User.findByIdAndUpdate(userId, {
      isOnline: false,
      lastSeen: new Date(),
    }).exec();
    socket.broadcast.emit("user_status", { userId, isOnline: false });
  });

  // ─── error ────────────────────────────────────────────────────────────────
  socket.on("error", (err) => {
    logger.error(`Socket error for ${userId}:`, err.message);
  });
}
