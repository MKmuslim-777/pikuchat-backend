import { z } from "zod";

export const upsertNoteSchema = z.object({
  text: z.string().trim().min(1, "Note cannot be empty").max(60, "Note must be 60 characters or fewer"),
});
