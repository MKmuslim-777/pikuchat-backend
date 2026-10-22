import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import { getIO } from "../config/socket.js";
import { sendSuccess, sendError } from "../utils/helpers.js";

// POST /api/messages — send message (REST fallback)
export async function sendMessage(req, res) {
  try {
    const { chatId, receiverId, text, fileUrl, fileType } = req.body;

    // Verify chat belongs to sender
    const chat = await Chat.findOne({
      _id: chatId,
      participants: req.userId,
    });

    if (!chat) {
      return sendError(res, "CHAT_NOT_FOUND", "Chat not found", 404);
    }

    const message = await Message.create({
      chatId,
      senderId: req.userId,
      receiverId,
      text: text || "",
      fileUrl: fileUrl || null,
      fileType: fileType || null,
    });

    // Update chat lastMessage
    chat.lastMessage = {
      text: text || (fileUrl ? "📎 File" : ""),
      senderId: req.userId,
      updatedAt: new Date(),
    };
    await chat.save();

    // Emit via socket
    const io = getIO();
    if (io) {
      io.to(receiverId).emit("receive_message", message);
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

    // Can only edit within 24 hours
    const hoursSinceCreated = (Date.now() - message.createdAt) / (1000 * 60 * 60);
    if (hoursSinceCreated > 24) {
      return sendError(res, "VALIDATION_ERROR", "Cannot edit messages older than 24 hours", 400);
    }

    message.text = text;
    message.isEdited = true;
    await message.save();

    // Emit via socket
    const io = getIO();
    if (io) {
      io.to(message.receiverId.toString()).emit("message_edited", {
        messageId: message._id,
        text: message.text,
      });
    }

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

    message.isDeleted = true;
    message.text = "";
    message.fileUrl = null;
    await message.save();

    // Emit via socket
    const io = getIO();
    if (io) {
      io.to(message.receiverId.toString()).emit("message_deleted", {
        messageId: message._id,
      });
    }

    sendSuccess(res, { message: "Message deleted" });
  } catch (error) {
    sendError(res, "SERVER_ERROR", error.message, 500);
  }
}

export default { sendMessage, editMessage, deleteMessage };
