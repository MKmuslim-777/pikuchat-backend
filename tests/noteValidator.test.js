import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { upsertNoteSchema } from "../src/validators/noteValidator.js";

describe("24-hour note validation", () => {
  it("trims and accepts a note within the 60-character limit", () => {
    const result = upsertNoteSchema.safeParse({ text: "  Out for coffee  " });

    assert.equal(result.success, true);
    assert.equal(result.data.text, "Out for coffee");
  });

  it("rejects empty notes and notes longer than 60 characters", () => {
    assert.equal(upsertNoteSchema.safeParse({ text: "   " }).success, false);
    assert.equal(upsertNoteSchema.safeParse({ text: "a".repeat(61) }).success, false);
  });
});
