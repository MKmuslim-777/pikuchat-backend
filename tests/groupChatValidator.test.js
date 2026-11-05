import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGroupSchema } from "../src/validators/chatValidator.js";

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
