import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long").optional(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-z0-9_]+$/, "Username must be lowercase alphanumeric + underscore")
    .optional(),
  photoURL: z.string().url().optional().or(z.literal("")),
  coverURL: z.string().url().optional().or(z.literal("")),
  bio: z.string().max(150, "Bio too long").optional(),
  readReceiptsEnabled: z.boolean().optional(),
  socialLinks: z
    .object({
      facebook:  z.string().optional().or(z.literal("")),
      instagram: z.string().optional().or(z.literal("")),
      twitter:   z.string().optional().or(z.literal("")),
      github:    z.string().optional().or(z.literal("")),
      linkedin:  z.string().optional().or(z.literal("")),
      tiktok:    z.string().optional().or(z.literal("")),
      whatsapp:  z.string().optional().or(z.literal("")),
      telegram:  z.string().optional().or(z.literal("")),
      youtube:   z.string().optional().or(z.literal("")),
      website:   z.string().optional().or(z.literal("")),
    })
    .optional(),
  phoneNumber: z.string().max(30).optional().or(z.literal("")),
  showPhoneNumber: z.boolean().optional(),
});

export const searchUserSchema = z.object({
  query: z.string().min(1).max(50),
});

export default { updateProfileSchema, searchUserSchema };
