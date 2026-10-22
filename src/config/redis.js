import { createClient } from "redis";
import logger from "../utils/logger.js";

let pubClient = null;
let subClient = null;

export async function getRedisClients() {
  const redisUrl = process.env.REDIS_URL;

  // If no Redis URL, return nulls — Socket.io works without adapter in single instance
  if (!redisUrl) {
    logger.info("No REDIS_URL set — Socket.io running without Redis adapter (single instance)");
    return { pubClient: null, subClient: null };
  }

  if (pubClient && subClient) {
    return { pubClient, subClient };
  }

  pubClient = createClient({ url: redisUrl });
  subClient = createClient({ url: redisUrl });

  pubClient.on("error", (err) => logger.error("Redis pub error:", err.message));
  subClient.on("error", (err) => logger.error("Redis sub error:", err.message));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  logger.info("Redis connected for Socket.io adapter");

  return { pubClient, subClient };
}

export default getRedisClients;
