/**
 * Web Push sender.
 *
 * Wraps `web-push` with our VAPID credentials and provides helpers to deliver
 * a notification payload to every device a user has subscribed. Subscriptions
 * that have expired or been revoked (404/410 from the push service) are
 * removed so we don't keep paying for dead endpoints.
 */

import webpush from 'web-push';
import { env } from './env';
import { query } from './db';

let configured = false;

function ensureConfigured(): boolean {
  const pub = env.vapidPublicKey();
  const priv = env.vapidPrivateKey();
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(env.vapidSubject(), pub, priv);
    configured = true;
  }
  return true;
}

/** True when VAPID keys are present and push delivery is possible. */
export function isPushConfigured(): boolean {
  return Boolean(env.vapidPublicKey() && env.vapidPrivateKey());
}

export type PushPayload = {
  title: string;
  body: string;
  /** URL to open when the notification is tapped. */
  url?: string;
  /** Collapse/tag key — notifications with the same tag replace each other. */
  tag?: string;
  /** Optional structured data passed through to the service worker. */
  data?: Record<string, any>;
};

type SubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Send a push payload to all of a user's subscribed devices.
 * Returns the number of devices the notification was delivered to.
 */
export async function sendPushToUser(userId: number | string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const result = await query<SubscriptionRow>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId],
  );
  const subs = result.rows;
  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 5 },
        );
        delivered += 1;
      } catch (err: any) {
        const status = err?.statusCode;
        // 404/410 => subscription is gone; prune it.
        if (status === 404 || status === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]).catch(() => {});
        }
      }
    }),
  );

  return delivered;
}
