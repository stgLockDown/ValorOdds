import crypto from 'crypto';
import { query, queryOne } from '@/lib/db';

const KEY_PREFIX = 'vok_';

export function generateRawApiKey(): string {
  return KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
}

export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function displayPrefix(raw: string): string {
  // First 12 chars are safe to show in the dashboard, never the full key.
  return raw.slice(0, 12);
}

/** Issues a brand-new API key for a plan, revoking any prior active key for it (one live key per plan, simpler to reason about + monitor). */
export async function issueApiKeyForPlan(planId: number, label = 'default'): Promise<string> {
  await query(`UPDATE customer_api_keys SET active = false, revoked_at = NOW() WHERE plan_id = $1 AND active = true`, [
    planId,
  ]);
  const raw = generateRawApiKey();
  const hash = hashApiKey(raw);
  await query(
    `INSERT INTO customer_api_keys (plan_id, key_hash, key_prefix, label) VALUES ($1, $2, $3, $4)`,
    [planId, hash, displayPrefix(raw), label]
  );
  return raw;
}

export async function getActiveKeyForPlan(planId: number) {
  return queryOne<{ id: string; key_prefix: string; created_at: string }>(
    `SELECT id::text, key_prefix, created_at FROM customer_api_keys WHERE plan_id = $1 AND active = true ORDER BY id DESC LIMIT 1`,
    [planId]
  );
}
