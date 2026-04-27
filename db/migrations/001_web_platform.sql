-- ============================================================================
-- Valor Odds Web Platform — Initial Schema
-- Applied once, after the bot's existing tables are already in place.
-- All tables are additive; nothing existing is modified.
-- ============================================================================

-- ---------- Users (web-native accounts) ----------
CREATE TABLE IF NOT EXISTS web_users (
    id                BIGSERIAL PRIMARY KEY,
    email             TEXT NOT NULL UNIQUE,
    email_verified_at TIMESTAMPTZ,
    password_hash     TEXT,                    -- null if Discord-only signup
    discord_id        TEXT UNIQUE,             -- linked Discord user ID, nullable
    display_name      TEXT,
    avatar_url        TEXT,
    is_admin          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_web_users_email ON web_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_web_users_discord_id ON web_users (discord_id);

-- ---------- Email verification tokens ----------
CREATE TABLE IF NOT EXISTS web_email_verifications (
    token       TEXT PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verif_user ON web_email_verifications (user_id);

-- ---------- Password reset tokens ----------
CREATE TABLE IF NOT EXISTS web_password_resets (
    token       TEXT PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pwd_resets_user ON web_password_resets (user_id);

-- ---------- Discord account link codes ----------
-- User generates a 6-8 char code on the website, runs /link <code> in Discord.
CREATE TABLE IF NOT EXISTS web_account_link_tokens (
    token      TEXT PRIMARY KEY,               -- short human-friendly code
    user_id    BIGINT NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_link_tokens_user ON web_account_link_tokens (user_id);

-- ---------- Subscriptions (Stripe-backed) ----------
-- One row per Stripe subscription. tier/status drive the app's entitlement checks.
CREATE TABLE IF NOT EXISTS web_subscriptions (
    id                    BIGSERIAL PRIMARY KEY,
    user_id               BIGINT REFERENCES web_users(id) ON DELETE SET NULL,
    discord_id            TEXT,                   -- denormalized for faster bot lookups
    stripe_customer_id    TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE,
    tier                  TEXT NOT NULL CHECK (tier IN ('free', 'premium', 'vip')),
    status                TEXT NOT NULL,          -- active, trialing, past_due, canceled, incomplete, etc.
    current_period_start  TIMESTAMPTZ,
    current_period_end    TIMESTAMPTZ,
    cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON web_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subs_customer ON web_subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subs_discord ON web_subscriptions (discord_id);
CREATE INDEX IF NOT EXISTS idx_subs_status ON web_subscriptions (status);

-- ---------- Stripe webhook idempotency ----------
CREATE TABLE IF NOT EXISTS web_stripe_events (
    event_id    TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload     JSONB
);

-- ---------- Usage / analytics events ----------
CREATE TABLE IF NOT EXISTS web_usage_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES web_users(id) ON DELETE SET NULL,
    discord_id  TEXT,
    event_type  TEXT NOT NULL,      -- signup, login, checkout_started, checkout_completed, dashboard_visit, chat_sent, ...
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_hash     TEXT,               -- sha256 of IP — privacy-friendly
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_user_time ON web_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_type_time ON web_usage_events (event_type, created_at DESC);

-- ---------- Updated-at trigger helper ----------
CREATE OR REPLACE FUNCTION web_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_web_users_touch ON web_users;
CREATE TRIGGER trg_web_users_touch BEFORE UPDATE ON web_users
  FOR EACH ROW EXECUTE FUNCTION web_touch_updated_at();

DROP TRIGGER IF EXISTS trg_web_subs_touch ON web_subscriptions;
CREATE TRIGGER trg_web_subs_touch BEFORE UPDATE ON web_subscriptions
  FOR EACH ROW EXECUTE FUNCTION web_touch_updated_at();