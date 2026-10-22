import { z } from "zod";

export const createChatSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export const sendMessageSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  receiverId: z.string().min(1, "Receiver ID is required"),
  text: z.string().max(5000, "Message too long").optional(),
  fileUrl: z.string().url().optional(),
  fileType: z.enum(["image", "video", "audio", "document", "other"]).optional(),
});

export const editMessageSchema = z.object({
  text: z.string().min(1, "Text is required").max(5000, "Message too long"),
});

export default { createChatSchema, sendMessageSchema, editMessageSchema };
