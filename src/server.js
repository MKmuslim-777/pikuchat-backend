import "dotenv/config";
import express from "express";
import http from "http";
import passport from "passport";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { connectDB } from "./config/db.js";
import { initSocketServer } from "./config/socket.js";
import { startCronJobs } from "./utils/cron.js";
import logger from "./utils/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

// Routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import chatRoutes from "./routes/chats.js";
import messageRoutes from "./routes/messages.js";
import uploadRoutes from "./routes/upload.js";
import adminRoutes from "./routes/admin.js";

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(
  morgan("dev", {
    skip: (req) => req.url.startsWith("/socket.io"),
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/admin", adminRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Piku server running" });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  await initSocketServer(server);
  startCronJobs();

  server.listen(PORT, () => {
    logger.info(`Piku server running on port ${PORT}`);
    logger.info(`Client URL: ${process.env.CLIENT_URL || "http://localhost:3000"}`);
  });
}

start().catch((err) => {
  logger.error("Failed to start server:", err);
  process.exit(1);
});
