-- ============================================================================
-- Valor Odds Web Platform — Marketing Studio
--
-- Admin-only hub that turns an admin's brief ("what to promote today") into
-- ready-to-review marketing posts. Generation harvests live platform data
-- (top arbitrage opportunities, upcoming games, ESPN news, published
-- ValorOdds articles) and produces channel-specific copy via the AI ladder.
-- An admin reviews/edits, approves, then ships to Discord via the bot's
-- internal API.
--
--   web_marketing_posts — one row per generated campaign:
--     * brief           — the admin's ask (topic + audience + notes)
--     * context         — snapshot of platform data used at generation time
--     * variants        — per-channel copy (discord, x, blog…) keyed by id
--     * status          — draft → approved → posted (or rejected)
-- ============================================================================
-- NOTE: generated content is stored raw; Discord delivery is plain-text,
-- so no sanitization needed on this table (nothing renders as HTML).

-- ---------- Campaigns ----------

CREATE TABLE IF NOT EXISTS web_marketing_posts (
    id              BIGSERIAL PRIMARY KEY,
    brief_topic     TEXT NOT NULL,                  -- admin's topic ("Promote tonight's NFL arbs")
    audience        VARCHAR(30) NOT NULL DEFAULT 'mixed',  -- casual | sharp | mixed
    tone            VARCHAR(30) NOT NULL DEFAULT 'hype',   -- hype | analytical | playful | urgent
    extra_notes     TEXT,                           -- free-form admin guidance
    focus_sports    TEXT[] NOT NULL DEFAULT '{}',   -- [] = all sports
    context         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- platform data snapshot
    variants        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {variantId: {channel, label, body, model}}
    generator_model TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','rejected','posted')),
    review_notes    TEXT,
    -- Discord delivery results, keyed by variant id (one row per send):
    posted_variants JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{variantId, channelId, messageId, at}]
    created_by      BIGINT REFERENCES web_users(id) ON DELETE SET NULL,
    created_by_name TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_marketing_posts_status ON web_marketing_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_marketing_posts_created_by ON web_marketing_posts (created_by);

-- ---------- History view: everything ever shipped, newest first ----------
CREATE OR REPLACE VIEW v_web_marketing_history AS
SELECT id, brief_topic, status, posted_variants,
       generator_model, created_by_name, created_at, updated_at
  FROM web_marketing_posts
 ORDER BY created_at DESC;
