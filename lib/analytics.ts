import { headers } from 'next/headers';
import crypto from 'crypto';
import { query } from './db';

export type UsageEventType =
  | 'signup'
  | 'login'
  | 'logout'
  | 'checkout_started'
  | 'checkout_completed'
  | 'checkout_failed'
  | 'subscription_canceled'
  | 'subscription_upgraded'
  | 'dashboard_visit'
  | 'chat_sent'
  | 'chat_export'
  | 'account_linked'
  | 'page_view';

export async function logEvent(opts: {
  userId?: string | null;
  discordId?: string | null;
  eventType: UsageEventType;
  metadata?: Record<string, unknown>;
}) {
  try {
    let ipHash: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = headers();
      const ip =
        h.get('x-forwarded-for')?.split(',')[0].trim() ||
        h.get('x-real-ip') ||
        null;
      userAgent = h.get('user-agent');
      if (ip) {
        ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
      }
    } catch {
      /* headers() not available in this context */
    }
    await query(
      `INSERT INTO web_usage_events (user_id, discord_id, event_type, metadata, ip_hash, user_agent)
       VALUES ($1::bigint, $2, $3, $4::jsonb, $5, $6)`,
      [
        opts.userId ?? null,
        opts.discordId ?? null,
        opts.eventType,
        JSON.stringify(opts.metadata ?? {}),
        ipHash,
        userAgent,
      ]
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[analytics] logEvent failed', err);
  }
}