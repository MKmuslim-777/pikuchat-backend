import webpush from "web-push";
import User from "../models/User.js";
import logger from "./logger.js";

const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:support@pikuchat.app";

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);
} else {
  logger.warn("VAPID keys not configured; push notifications disabled.");
}

/**
 * Send a web push notification to a user across all their registered devices
 * @param {string} userId
 * @param {{ title: string, body: string, icon?: string, data?: object, tag?: string }} payload
 */
export async function sendPushNotification(userId, payload) {
  if (!publicVapidKey || !privateVapidKey) return;

  try {
    const user = await User.findById(userId).select("pushSubscriptions status");
    if (!user || user.status?.isBlocked || !user.pushSubscriptions?.length) {
      return;
    }

    const notificationPayload = JSON.stringify({
      title: payload.title || "pikuchat",
      body: payload.body || "New message received",
      icon: payload.icon || "/favicon.ico",
      badge: "/favicon.ico",
      tag: payload.tag || "piku-msg",
      data: payload.data || { url: "/chat" },
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

