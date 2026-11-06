import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDoNotDisturbActive } from "../src/utils/pushNotifier.js";

describe("scheduled Do Not Disturb", () => {
  const schedule = {
    enabled: true,
    start: "22:00",
    end: "08:00",
    timeZone: "UTC",
  };

  it("covers the overnight interval across midnight", () => {
    const settings = { doNotDisturb: schedule };
    assert.equal(isDoNotDisturbActive(settings, new Date("2026-01-01T23:00:00Z")), true);
    assert.equal(isDoNotDisturbActive(settings, new Date("2026-01-02T07:59:00Z")), true);
  });

  it("does not include the end time or daytime hours", () => {
    const settings = { doNotDisturb: schedule };
    assert.equal(isDoNotDisturbActive(settings, new Date("2026-01-02T08:00:00Z")), false);
    assert.equal(isDoNotDisturbActive(settings, new Date("2026-01-02T12:00:00Z")), false);
  });

  it("does nothing when disabled or when both endpoints are equal", () => {
    assert.equal(isDoNotDisturbActive({ doNotDisturb: { ...schedule, enabled: false } }, new Date("2026-01-01T23:00:00Z")), false);
    assert.equal(isDoNotDisturbActive({ doNotDisturb: { ...schedule, start: "22:00", end: "22:00" } }, new Date("2026-01-01T23:00:00Z")), false);
  });
});
