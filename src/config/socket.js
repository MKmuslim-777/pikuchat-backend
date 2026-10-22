import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getRedisClients } from "./redis.js";
import socketAuthMiddleware from "../sockets/authMiddleware.js";
import socketHandler from "../sockets/handler.js";
import logger from "../utils/logger.js";

let io = null;

export async function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket"],
  });

  // Attach Redis adapter if available
  const { pubClient, subClient } = await getRedisClients();
  if (pubClient && subClient) {
    io.adapter(createAdapter(pubClient, subClient));
    logger.info("Socket.io Redis adapter attached");
  }

  // Auth middleware
  io.use(socketAuthMiddleware);

  // Event handler
  io.on("connection", (socket) => socketHandler(io, socket));

  logger.info("Socket.io server initialized");
  return io;
}

export function getIO() {
  return io;
}

export default initSocketServer;
