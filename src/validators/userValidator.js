import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long").optional(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-z0-9_]+$/, "Username must be lowercase alphanumeric + underscore")
    .optional(),
  photoURL: z.string().url().optional(),
});

export const searchUserSchema = z.object({
  query: z.string().min(1).max(50),
});

export default { updateProfileSchema, searchUserSchema };
