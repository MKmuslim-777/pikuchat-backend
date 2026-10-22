import { Router } from "express";
import authMiddleware from "../middleware/auth.js";
import { upload, uploadFile } from "../controllers/uploadController.js";

const router = Router();

router.use(authMiddleware);

router.post("/", upload.single("file"), uploadFile);

export default router;
