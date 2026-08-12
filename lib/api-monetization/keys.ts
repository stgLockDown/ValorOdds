import crypto from 'crypto';
import { query, queryOne } from '@/lib/db';

const KEY_PREFIX = 'vok_';

// ---------------------------------------------------------------------------
// Key generation & hashing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Reversible encryption (AES-256-GCM)
//
// We store a SHA-256 hash for fast lookup/authentication AND an AES-256-GCM
// encrypted copy so the raw key can be revealed to the authenticated owner
// on demand without forcing a regeneration. The encryption key is derived
// from NEXTAUTH_SECRET (already a required, secret env var) so no new
// infrastructure is needed.
// ---------------------------------------------------------------------------

const ENC_KEY_ENV = 'NEXTAUTH_SECRET';

function encryptionKey(): Buffer {
  const secret = process.env[ENC_KEY_ENV] || 'fallback-dev-secret-change-me';
  // Derive a fixed 32-byte key via SHA-256 so any-length secret works.
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * Encrypts a raw API key with AES-256-GCM.
 * Returns a single string: `base64(iv):base64(authTag):base64(ciphertext)`
 */
export function encryptApiKey(raw: string): string {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Decrypts an encrypted API key string produced by `encryptApiKey`.
 * Returns the raw key, or null if decryption fails (tampered / wrong key).
 */
export function decryptApiKey(encrypted: string): string | null {
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');
    const key = encryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Key issuance & retrieval
// ---------------------------------------------------------------------------

/**
 * Issues a brand-new API key for a plan, revoking any prior active key for it
 * (one live key per plan, simpler to reason about + monitor).
 *
 * Stores both the SHA-256 hash (for auth lookups) and an AES-256-GCM encrypted
 * copy (so the owner can re-view/copy the key without regenerating).
 */
export async function issueApiKeyForPlan(planId: number, label = 'default'): Promise<string> {
  await query(
    `UPDATE customer_api_keys SET active = false, revoked_at = NOW() WHERE plan_id = $1 AND active = true`,
    [planId],
  );
  const raw = generateRawApiKey();
  const hash = hashApiKey(raw);
  const encrypted = encryptApiKey(raw);
  await query(
    `INSERT INTO customer_api_keys (plan_id, key_hash, key_prefix, key_encrypted, label)
     VALUES ($1, $2, $3, $4, $5)`,
    [planId, hash, displayPrefix(raw), encrypted, label],
  );
  return raw;
}

export async function getActiveKeyForPlan(planId: number) {
  return queryOne<{ id: string; key_prefix: string; created_at: string }>(
    `SELECT id::text, key_prefix, created_at FROM customer_api_keys WHERE plan_id = $1 AND active = true ORDER BY id DESC LIMIT 1`,
    [planId],
  );
}

/**
 * Retrieves and decrypts the active raw API key for a plan.
 * Used by the reveal endpoint so the authenticated owner can copy their key
 * without regenerating it.
 *
 * Returns the raw key string, or null if no active key exists or the
 * encrypted copy is missing/corrupt (e.g. key was issued before the
 * key_encrypted column was added).
 */
export async function getDecryptedActiveKeyForPlan(planId: number): Promise<string | null> {
  const row = await queryOne<{ key_encrypted: string | null }>(
    `SELECT key_encrypted FROM customer_api_keys WHERE plan_id = $1 AND active = true ORDER BY id DESC LIMIT 1`,
    [planId],
  );
  if (!row || !row.key_encrypted) return null;
  return decryptApiKey(row.key_encrypted);
}
