/**
 * Short-lived single-use token utilities for email verification,
 * password resets, and Discord account linking.
 */
import crypto from 'crypto';
import { query, queryOne } from './db';

type TokenTable =
  | 'web_email_verifications'
  | 'web_password_resets'
  | 'web_account_link_tokens';

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function randomLinkCode(): string {
  // Human-friendly: 8 chars from an unambiguous alphabet
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i += 1) s += alpha[crypto.randomInt(alpha.length)];
  return s;
}

export async function createEmailVerification(userId: string, ttlHours = 24) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await query(
    `INSERT INTO web_email_verifications (token, user_id, expires_at) VALUES ($1, $2::bigint, $3)`,
    [token, userId, expiresAt]
  );
  return { token, expiresAt };
}

export async function consumeEmailVerification(token: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE web_email_verifications SET consumed_at = NOW()
     WHERE token = $1 AND consumed_at IS NULL AND expires_at > NOW()
     RETURNING user_id::text`,
    [token]
  );
  if (!row) return null;
  await query(`UPDATE web_users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1::bigint`, [
    row.user_id,
  ]);
  return row.user_id;
}

export async function createPasswordReset(userId: string, ttlMinutes = 60) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await query(
    `INSERT INTO web_password_resets (token, user_id, expires_at) VALUES ($1, $2::bigint, $3)`,
    [token, userId, expiresAt]
  );
  return { token, expiresAt };
}

export async function consumePasswordReset(token: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE web_password_resets SET consumed_at = NOW()
     WHERE token = $1 AND consumed_at IS NULL AND expires_at > NOW()
     RETURNING user_id::text`,
    [token]
  );
  return row?.user_id ?? null;
}

export async function createAccountLinkCode(userId: string, ttlMinutes = 15): Promise<{ code: string; expiresAt: Date }> {
  // Regenerate until unique (practically one attempt).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomLinkCode();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    try {
      await query(
        `INSERT INTO web_account_link_tokens (token, user_id, expires_at)
         VALUES ($1, $2::bigint, $3)`,
        [code, userId, expiresAt]
      );
      return { code, expiresAt };
    } catch (err: any) {
      if (err?.code !== '23505') throw err; // unique violation, retry
    }
  }
  throw new Error('Could not generate unique link code');
}

export async function consumeAccountLinkCode(code: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE web_account_link_tokens SET consumed_at = NOW()
     WHERE token = $1 AND consumed_at IS NULL AND expires_at > NOW()
     RETURNING user_id::text`,
    [code]
  );
  return row?.user_id ?? null;
}