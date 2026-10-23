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

// Trust Railway/Heroku proxy for accurate IPs
app.set("trust proxy", 1);

// CORS — allow configured client URLs (comma-separated in production)
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    skip: (req) => req.url.startsWith("/socket.io"),
    stream: {
      write: (msg) => logger.info(msg.trimEnd()),
    },
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
  res.json({
    success: true,
    message: "Piku server running",
    version: "3.0.0",
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
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

  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`Piku server running on port ${PORT} [${process.env.NODE_ENV}]`);
    logger.info(`Allowed origins: ${allowedOrigins.join(", ")}`);
  });
}

start().catch((err) => {
  logger.error("Failed to start server:", err);
  process.exit(1);
});
