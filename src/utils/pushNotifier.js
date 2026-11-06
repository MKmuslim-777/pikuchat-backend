import webpush from "web-push";
import User from "../models/User.js";
import logger from "./logger.js";
import { areSameSocketId } from "./socketIds.js";

const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:support@pikuchat.app";

export function isDoNotDisturbActive(settings, now = new Date()) {
  const dnd = settings?.doNotDisturb;
  if (!dnd?.enabled || dnd.start === dnd.end) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: dnd.timeZone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const localMinutes = Number(parts.find((part) => part.type === "hour")?.value) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value);
  const toMinutes = (time) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  };
  const start = toMinutes(dnd.start);
  const end = toMinutes(dnd.end);
  return start < end
    ? localMinutes >= start && localMinutes < end
    : localMinutes >= start || localMinutes < end;
}

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);
} else {
  logger.warn("VAPID keys not configured; push notifications disabled.");
}

/**
 * Send a web push notification to a user across all their registered devices
 * @param {string} userId
 * @param {{ title: string, body: string, icon?: string, data?: object, tag?: string, chatId?: string }} payload
 * @param {import("socket.io").Server} [io]
 */
export async function sendPushNotification(userId, payload, io) {
  if (!publicVapidKey || !privateVapidKey) return;
  if (
    payload.senderId &&
    areSameSocketId(payload.senderId, userId)
  ) {
    return;
  }

  try {
    const user = await User.findById(userId).select("pushSubscriptions status mutedChats notificationSettings");
    if (!user || user.status?.isBlocked || !user.pushSubscriptions?.length) {
      return;
    }
    if (isDoNotDisturbActive(user.notificationSettings, new Date())) return;

    if (payload.chatId) {
      const isMuted = user.mutedChats?.some((mute) => {
        const mutedChatId = mute.chatId?._id || mute.chatId;
        return (
          mutedChatId?.toString() === payload.chatId.toString() &&
          (!mute.mutedUntil || new Date(mute.mutedUntil) > new Date())
        );
      });
      if (isMuted) return;
    }

    if (io?.in) {
      try {
        const connectedSockets = await io.in(userId.toString()).fetchSockets();
        if (connectedSockets.length > 0) return;
      } catch (error) {
        logger.warn(`Could not check active sessions for push recipient ${userId}: ${error.message}`);
      }
    }

    const notificationPayload = JSON.stringify({
      title: payload.title || "pikuchat",
      body: payload.body || "New message received",
      icon: payload.icon || "/favicon.ico",
      badge: "/favicon.ico",
      tag: payload.tag || "piku-msg",
      data: payload.data || { url: payload.chatId ? `/chat/${payload.chatId}` : "/chat" },
      vibrate: [100, 50, 100],
    });

    const deadEndpoints = [];

    await Promise.all(
      user.pushSubscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
              },
            },
            notificationPayload
          );
        } catch (err) {
          // 404 or 410 Gone means the subscription has expired or user revoked it
          if (err.statusCode === 404 || err.statusCode === 410) {
            deadEndpoints.push(sub.endpoint);
          } else {
            logger.warn(`Push delivery error to ${sub.endpoint.slice(0, 30)}...: ${err.message}`);
          }
        }
      })
    );

    // Clean up expired subscriptions
    if (deadEndpoints.length > 0) {
      await User.findByIdAndUpdate(userId, {
        $pull: {
          pushSubscriptions: { endpoint: { $in: deadEndpoints } },
        },
      });
    }
  } catch (err) {
    logger.error(`Error in sendPushNotification for ${userId}: ${err.message}`);
  }
}
