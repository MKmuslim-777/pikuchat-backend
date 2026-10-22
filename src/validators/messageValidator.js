import { z } from "zod";

export const bannedKeywordSchema = z.object({
  word: z
    .string()
    .min(1, "Keyword is required")
    .max(50, "Keyword too long")
    .transform((v) => v.toLowerCase().trim()),
});

export const muteUserSchema = z.object({
  mutedUntil: z.string().datetime().optional(),
});

export const blockUserSchema = z.object({
  reason: z.string().max(200, "Reason too long").optional(),
});

export default { bannedKeywordSchema, muteUserSchema, blockUserSchema };
