import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDoNotDisturbActive } from "../src/utils/pushNotifier.js";

describe("Do Not Disturb expiration", () => {
  it("remains active until the selected end time and expires at that time", () => {
    const settings = { doNotDisturb: { enabled: true, until: "2026-01-02T08:00:00.000Z" } };
    assert.equal(isDoNotDisturbActive(settings, new Date("2026-01-02T07:59:59.999Z")), true);
    assert.equal(isDoNotDisturbActive(settings, new Date("2026-01-02T08:00:00.000Z")), false);
  });

  it("is inactive when disabled or the end time is missing", () => {
    const now = new Date("2026-01-02T07:00:00.000Z");
    assert.equal(isDoNotDisturbActive({ doNotDisturb: { enabled: false, until: "2026-01-02T08:00:00Z" } }, now), false);
    assert.equal(isDoNotDisturbActive({ doNotDisturb: { enabled: true, until: null } }, now), false);
  });
});
