/**
 * Client for the Discord bot's internal REST API.
 * All calls go over HTTPS to BOT_API_BASE_URL with a shared INTERNAL_API_KEY Bearer.
 */
import { env, type Tier } from './env';

type BotApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
};

async function botFetch<T = unknown>(path: string, opts: BotApiOptions = {}): Promise<T> {
  const url = `${env.botApiBaseUrl().replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const resp = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.internalApiKey()}`,
        'X-Internal-Caller': 'valorodds-web',
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await resp.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON ok */ }
    if (!resp.ok) {
      const msg = (json && (json.error || json.message)) || resp.statusText;
      throw new Error(`Bot API ${resp.status}: ${msg}`);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Role sync ----------

export async function syncDiscordRole(discordId: string, tier: Tier): Promise<{ ok: boolean; applied: string[]; removed: string[] }> {
  return botFetch('/api/internal/sync-role', {
    method: 'POST',
    body: { discordId, tier },
  });
}

// ---------- Dashboard data (forwarded from bot) ----------

export async function getDashboardSummary(discordId: string) {
  return botFetch(`/api/internal/dashboard/summary?discordId=${encodeURIComponent(discordId)}`);
}

export async function getChatStatus() {
  return botFetch('/api/chat/status');
}

// ---------- Account link verification ----------

/**
 * Bot creates a record when a user runs /link <code>. Website polls or is notified.
 * This helper asks the bot to consume a link token + associate the discord id to the web user.
 */
export async function confirmAccountLink(token: string, userId: string) {
  return botFetch('/api/internal/account-link', {
    method: 'POST',
    body: { token, webUserId: userId },
  });
}