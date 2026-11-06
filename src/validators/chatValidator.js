import { z } from "zod";

export const createChatSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(60, "Group name must be 60 characters or fewer"),
  userIds: z.array(z.string().regex(/^[0-9a-f]{24}$/i, "Invalid user ID"))
    .min(1, "Select at least one other person")
    .refine((userIds) => new Set(userIds).size === userIds.length, "Duplicate members are not allowed"),
});

export const addGroupMembersSchema = z.object({
  userIds: z.array(z.string().regex(/^[0-9a-f]{24}$/i, "Invalid user ID"))
    .min(1, "Select at least one person")
    .refine((userIds) => new Set(userIds).size === userIds.length, "Duplicate members are not allowed"),
});

export const updateGroupAdminSchema = z.object({
  isAdmin: z.boolean(),
});

export const updateGroupProfileSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(60, "Group name must be 60 characters or fewer").optional(),
  photoURL: z.string().url("Invalid group photo URL").or(z.literal("")).optional(),
}).refine((data) => data.name !== undefined || data.photoURL !== undefined, "At least one group profile field is required");

export const sendMessageSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  receiverId: z.string().min(1, "Receiver ID is required"),
  text: z.string().max(5000, "Message too long").optional(),
  clientMessageId: z.string().min(1).max(100).optional(),
  voiceDuration: z.number().nonnegative().optional(),
  replyTo: z.object({
    _id: z.string().optional(),
    text: z.string().max(5000).optional(),
    senderId: z.string().optional(),
    fileType: z.enum(["image", "video", "audio", "voice", "document", "other"]).nullable().optional(),
  }).optional(),
  fileUrl: z.string().url().optional(),
  fileType: z.enum(["image", "video", "audio", "voice", "document", "other"]).optional(),
  publicId: z.string().optional(),
});

export const editMessageSchema = z.object({
  text: z.string().min(1, "Text is required").max(5000, "Message too long"),
});

export default {
  createChatSchema,
  createGroupSchema,
  addGroupMembersSchema,
  updateGroupAdminSchema,
  updateGroupProfileSchema,
  sendMessageSchema,
  editMessageSchema,
};
