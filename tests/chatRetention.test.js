import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createExpiredChatFilter } from "../src/utils/cron.js";

describe("30-day chat retention filter", () => {
  it("selects only inactive chats without protected participants", () => {
    const cutoff = new Date("2026-10-07T00:00:00.000Z");
    const protectedUserIds = ["elite-user-id"];
    const filter = createExpiredChatFilter(cutoff, protectedUserIds);

    assert.deepEqual(filter.participants, { $nin: protectedUserIds });
    assert.deepEqual(filter.$or, [
      { "lastMessage.updatedAt": { $lt: cutoff } },
      { "lastMessage.updatedAt": { $exists: false }, updatedAt: { $lt: cutoff } },
    ]);
  });
});
