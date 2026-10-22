import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import { getIO } from "../config/socket.js";
import logger from "../utils/logger.js";

export default function socketHandler(io, socket) {
  const userId = socket.userId;
  logger.info(`Socket connected: ${userId}`);

  // Join a personal room for targeted message delivery
  socket.join(userId);

  // Broadcast online status
  socket.broadcast.emit("user_online", { userId, isOnline: true });
  User.findByIdAndUpdate(userId, {
    isOnline: true,
    lastSeen: new Date(),
  }).exec();

  // Send message event
  socket.on("send_message", async (data) => {
    try {
      const { chatId, receiverId, text, fileUrl, fileType } = data;

      // Save message to DB
      const message = await Message.create({
        chatId,
        senderId: userId,
        receiverId,
        text: text || "",
        fileUrl: fileUrl || null,
        fileType: fileType || null,
      });

      // Update chat lastMessage
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: {
          text: text || (fileUrl ? "📎 File" : ""),
          senderId: userId,
          updatedAt: new Date(),
        },
      });

      // Emit to receiver
      io.to(receiverId).emit("receive_message", message);
      // Emit back to sender for confirmation
      socket.emit("receive_message", message);
    } catch (error) {
      logger.error("Socket send_message error:", error.message);
    }
  });

  // Typing events
  socket.on("typing_start", ({ chatId }) => {
    socket.to(getReceiverId(chatId)).emit("typing_start", {
      chatId,
      userId,
    });
  });

  socket.on("typing_stop", ({ chatId }) => {
    socket.to(getReceiverId(chatId)).emit("typing_stop", { chatId });
  });

  // Message delivered
  socket.on("message_delivered", ({ messageId }) => {
    // Find the sender and notify
    Message.findById(messageId).then((msg) => {
      if (msg) {
        io.to(msg.senderId.toString()).emit("message_delivered", { messageId });
      }
    });
  });

  // Message read
  socket.on("message_read", async ({ chatId, userId: readerId }) => {
    try {
      await Message.updateMany(
        {
          chatId,
          receiverId: readerId,
          isSeen: false,
        },
        { isSeen: true }
      );

      // Find the other participant to notify
      const chat = await Chat.findById(chatId);
      if (chat) {
        const otherUser = chat.participants.find(
          (p) => p.toString() !== readerId
        );
        if (otherUser) {
          io.to(otherUser.toString()).emit("message_read", { chatId, userId: readerId });
        }
      }
    } catch (error) {
      logger.error("Socket message_read error:", error.message);
    }
  });

  // Message edit
  socket.on("message_edit", async ({ messageId, text }) => {
    try {
      const message = await Message.findOneAndUpdate(
        { _id: messageId, senderId: userId },
        { text, isEdited: true },
        { new: true }
      );
      if (message) {
        io.to(message.receiverId.toString()).emit("message_edited", {
          messageId,
          text,
        });
      }
    } catch (error) {
      logger.error("Socket message_edit error:", error.message);
    }
  });

  // Message delete
  socket.on("message_delete", async ({ messageId }) => {
    try {
      const message = await Message.findOneAndUpdate(
        { _id: messageId, senderId: userId },
        { isDeleted: true, text: "", fileUrl: null },
        { new: true }
      );
      if (message) {
        io.to(message.receiverId.toString()).emit("message_deleted", {
          messageId,
        });
      }
    } catch (error) {
      logger.error("Socket message_delete error:", error.message);
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    logger.info(`Socket disconnected: ${userId}`);
    socket.broadcast.emit("user_online", { userId, isOnline: false });
    User.findByIdAndUpdate(userId, {
      isOnline: false,
      lastSeen: new Date(),
    }).exec();
  });
}

// Helper to find the other participant in a chat
async function getReceiverId(chatId) {
  const chat = await Chat.findById(chatId).populate("participants");
  if (!chat) return null;
  return chat.participants.map((p) => p._id.toString());
}
