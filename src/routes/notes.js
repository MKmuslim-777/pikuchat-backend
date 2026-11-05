import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import { deleteNote, getNotes, upsertNote } from "../controllers/noteController.js";
import { upsertNoteSchema } from "../validators/noteValidator.js";

const router = Router();

router.use(authMiddleware);
router.get("/", getNotes);
router.put("/", validate(upsertNoteSchema), upsertNote);
router.delete("/me", deleteNote);

export default router;
