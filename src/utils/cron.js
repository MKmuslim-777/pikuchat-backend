import cron from "node-cron";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Chat from "../models/Chat.js";
import logger from "./logger.js";

export function createExpiredChatFilter(cutoff, protectedUserIds) {
  return {
    participants: { $nin: protectedUserIds },
    $or: [
      { "lastMessage.updatedAt": { $lt: cutoff } },
      { "lastMessage.updatedAt": { $exists: false }, updatedAt: { $lt: cutoff } },
    ],
  };
}

export async function deleteExpiredChats(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const protectedUsers = await User.find({
    $or: [
      { role: { $in: ["super_admin", "elite_user"] } },
      { isProtectedFromDeletion: true },
    ],
  }).distinct("_id");
  const chatFilter = createExpiredChatFilter(cutoff, protectedUsers);
  let deletedChatCount = 0;
  let deletedMessageCount = 0;

  while (true) {
    const staleChats = await Chat.find(chatFilter).select("_id").limit(500).lean();
    if (!staleChats.length) break;
    const deletedChatIds = [];
    for (const chat of staleChats) {
      const result = await Chat.deleteOne({ _id: chat._id, ...chatFilter });
      if (result.deletedCount) deletedChatIds.push(chat._id);
    }
    if (deletedChatIds.length) {
      const result = await Message.deleteMany({ chatId: { $in: deletedChatIds } });
      deletedChatCount += deletedChatIds.length;
      deletedMessageCount += result.deletedCount;
    }
  }

  return { deletedChatCount, deletedMessageCount };
}

export function startCronJobs() {
  // Remove conversations inactive for 30 days, retaining any involving protected users.
  cron.schedule("0 2 * * *", async () => {
    try {
      const result = await deleteExpiredChats();
      logger.info(
        `[Cron Cleanup] Deleted ${result.deletedChatCount} chats and ${result.deletedMessageCount} messages inactive for over 30 days.`,
      );
    } catch (error) {
      logger.error("[Cron Cleanup Error]:", error.message);
    }
  });

  logger.info("Cron jobs started — inactive chat retention runs daily at 02:00 UTC");
}
