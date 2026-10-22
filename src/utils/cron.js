import cron from "node-cron";
import Message from "../models/Message.js";
import User from "../models/User.js";
import logger from "./logger.js";

export function startCronJobs() {
  // 30-day message cleanup — runs daily at 02:00 AM UTC
  cron.schedule("0 2 * * *", async () => {
    try {
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

      const protectedUsers = await User.find({
        $or: [
          { role: "super_admin" },
          { role: "elite_user" },
          { isProtectedFromDeletion: true },
        ],
      }).select("_id");

      const protectedIds = protectedUsers.map((u) => u._id);

      const result = await Message.deleteMany({
        createdAt: { $lt: oneMonthAgo },
        senderId: { $nin: protectedIds },
        receiverId: { $nin: protectedIds },
      });

      logger.info(`[Cron Cleanup] Deleted ${result.deletedCount} messages older than 30 days.`);
    } catch (error) {
      logger.error("[Cron Cleanup Error]:", error.message);
    }
  });

  logger.info("Cron jobs started — message retention runs daily at 02:00 UTC");
}
