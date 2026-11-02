import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getRedisClients } from "./redis.js";
import socketAuthMiddleware from "../sockets/authMiddleware.js";
import socketHandler from "../sockets/handler.js";
import logger from "../utils/logger.js";

let io = null;

export async function initSocketServer(httpServer) {
  const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, mobile apps)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        logger.warn(`Socket CORS blocked: ${origin}`);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Allow both transports — polling first for reliability, then upgrade to ws
    transports: ["polling", "websocket"],
    allowEIO3: true,
    pingTimeout: 30000,
    pingInterval: 10000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e8, // 100 MB (for file metadata)
  });

  // Redis adapter (optional, only if REDIS_URL is set)
  const { pubClient, subClient } = await getRedisClients();
  if (pubClient && subClient) {
    io.adapter(createAdapter(pubClient, subClient));
    logger.info("Socket.io Redis adapter attached");
  } else {
    logger.info("No REDIS_URL set — Socket.io running without Redis adapter (single instance)");
  }

  io.use(socketAuthMiddleware);
  io.on("connection", (socket) => socketHandler(io, socket));

  logger.info("Socket.io server initialized");
  return io;
}

export function getIO() {
  return io;
}

export default initSocketServer;
