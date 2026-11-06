import { createHash } from "node:crypto";
import User from "../models/User.js";

export async function registerLegacySession(userId, token, userAgent = "") {
  const sessionId = `legacy-${createHash("sha256").update(token).digest("hex")}`;
  const revoked = await User.exists({ _id: userId, revokedLegacySessions: sessionId });
  if (revoked) return sessionId;
  const existing = await User.exists({ _id: userId, "sessions.sessionId": sessionId });
  if (!existing) {
    const device = String(userAgent).match(/(iPhone|iPad|Android|Windows|Macintosh|Linux)/i)?.[0] || "Browser";
    await User.updateOne(
      {
        _id: userId,
        "sessions.sessionId": { $ne: sessionId },
        revokedLegacySessions: { $ne: sessionId },
      },
      {
        $push: {
          sessions: {
            $each: [{ sessionId, device, userAgent: String(userAgent).slice(0, 300), createdAt: new Date() }],
            $slice: -20,
          },
        },
      },
    );
  }
  return sessionId;
}
