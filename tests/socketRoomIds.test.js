import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  areSameSocketId,
  normalizeSocketId,
  getSocketRoomTargets,
} from "../src/utils/socketIds.js";

describe("socket room ID normalization", () => {
  it("stringifies object ids and keeps chat ids valid for room targeting", () => {
    const userId = { toString: () => "64f0a1c7b7a1d32a5a9c2d8f" };
    const chatId = "64f0a1c7b7a1d32a5a9c2d90";

    assert.equal(normalizeSocketId(userId), "64f0a1c7b7a1d32a5a9c2d8f");
    assert.deepEqual(getSocketRoomTargets(userId, chatId), [
      "64f0a1c7b7a1d32a5a9c2d8f",
      "64f0a1c7b7a1d32a5a9c2d90",
    ]);
  });

  it("ignores empty ids while preserving valid room names", () => {
    assert.equal(normalizeSocketId(null), "");
    assert.deepEqual(getSocketRoomTargets(null, "chat-123"), ["chat-123"]);
  });

  it("compares user IDs case-insensitively and rejects empty IDs", () => {
    assert.equal(areSameSocketId("64F0A1C7B7A1D32A5A9C2D8F", "64f0a1c7b7a1d32a5a9c2d8f"), true);
    assert.equal(areSameSocketId("", null), false);
  });
});
