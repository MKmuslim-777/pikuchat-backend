import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addGroupMembersSchema,
  createGroupSchema,
  sendMessageSchema,
  updateGroupAdminSchema,
  updateGroupProfileSchema,
} from "../src/validators/chatValidator.js";

const userId = (digit) => digit.repeat(24);

describe("group chat creation validation", () => {
  it("accepts a named group with at least one other member", () => {
    const result = createGroupSchema.safeParse({
      name: "  Project team  ",
      userIds: [userId("a")],
    });

    assert.equal(result.success, true);
    assert.equal(result.data.name, "Project team");
  });

  it("accepts multiple members without imposing an extra group-size limit", () => {
    const result = createGroupSchema.safeParse({
      name: "Team",
      userIds: Array.from({ length: 51 }, (_, index) =>
        index.toString(16).padStart(24, "0")
      ),
    });

    assert.equal(result.success, true);
  });

  it("rejects repeated IDs and malformed user IDs", () => {
    assert.equal(
      createGroupSchema.safeParse({ name: "Team", userIds: [userId("a"), userId("a")] }).success,
      false,
    );
    assert.equal(createGroupSchema.safeParse({ name: "Team", userIds: ["not-an-id"] }).success, false);
  });
});

describe("message send validation", () => {
  it("accepts a bounded idempotency key and reply metadata", () => {
    const result = sendMessageSchema.safeParse({
      chatId: userId("a"),
      receiverId: userId("b"),
      text: "Queued while offline",
      clientMessageId: "client-generated-id",
      replyTo: { _id: userId("c"), text: "Earlier message", senderId: userId("b") },
    });

    assert.equal(result.success, true);
  });

  it("rejects oversized client message IDs", () => {
    assert.equal(
      sendMessageSchema.safeParse({
        chatId: userId("a"),
        receiverId: userId("b"),
        clientMessageId: "x".repeat(101),
      }).success,
      false,
    );
  });
});

describe("group member and profile validation", () => {
  it("accepts unique member IDs and rejects duplicates", () => {
    assert.equal(addGroupMembersSchema.safeParse({ userIds: [userId("a"), userId("b")] }).success, true);
    assert.equal(addGroupMembersSchema.safeParse({ userIds: [userId("a"), userId("a")] }).success, false);
  });

  it("requires a boolean when changing admin status", () => {
    assert.equal(updateGroupAdminSchema.safeParse({ isAdmin: true }).success, true);
    assert.equal(updateGroupAdminSchema.safeParse({ isAdmin: "true" }).success, false);
  });

  it("accepts group names or photo URLs and rejects empty updates", () => {
    assert.equal(updateGroupProfileSchema.safeParse({ name: "Study group" }).success, true);
    assert.equal(updateGroupProfileSchema.safeParse({ photoURL: "https://example.com/group.png" }).success, true);
    assert.equal(updateGroupProfileSchema.safeParse({}).success, false);
    assert.equal(updateGroupProfileSchema.safeParse({ photoURL: "not-a-url" }).success, false);
  });
});
