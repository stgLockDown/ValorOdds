-- ============================================================================
-- Valor Odds Web Platform — News Platform
--
-- Adds a self-hosted editorial layer on top of the ESPN news the bot already
-- harvests into the shared `news` table:
--
--   web_articles      — every ValorOdds article: AI-generated (needs admin
--                       approval), admin-written, or writer-submitted (needs
--                       admin approval). Markdown body, sanitized on render.
--   web_users.is_writer — grants the "writer" role. Writers author and submit
--                       articles from the dashboard; admins approve before
--                       anything is published.
--
-- Design notes:
--   * Statuses: draft → in_review → pending_review (AI) → approved →
--     published / rejected. 'pending_review' marks AI-generated drafts that
--     an admin must explicitly approve; 'in_review' marks writer submissions.
--   * AI articles carry provenance (generator model, prompt subject, source
--     links) so editorial review can check the machine's homework.
--   * The bot's `news` table is untouched — it remains the ingest record.
-- ============================================================================

-- ---------- Writer role ----------
ALTER TABLE web_users ADD COLUMN IF NOT EXISTS is_writer BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_web_users_writer ON web_users (is_writer) WHERE is_writer;

-- ---------- Articles ----------
CREATE TABLE IF NOT EXISTS web_articles (
    id              BIGSERIAL PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    subtitle        TEXT,
    body_md         TEXT NOT NULL,               -- markdown source of truth
    cover_image_url TEXT,
    image_credit    TEXT,
    sport           VARCHAR(50),                 -- null = general
    subject_type    VARCHAR(20) CHECK (subject_type IN ('player','team','general')),
    subject_name    TEXT,
    tags            TEXT[] NOT NULL DEFAULT '{}',
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','in_review','pending_review','approved','rejected','published')),
    author_id       BIGINT REFERENCES web_users(id) ON DELETE SET NULL,
    byline          TEXT NOT NULL DEFAULT 'ValorOdds Staff',
    is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    generator_model TEXT,
    generator_prompt_subject TEXT,
    source_links    TEXT[] NOT NULL DEFAULT '{}', -- provenance: articles the AI was given
    review_notes    TEXT,
    reviewed_by     BIGINT REFERENCES web_users(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_articles_status   ON web_articles (status);
CREATE INDEX IF NOT EXISTS idx_web_articles_published ON web_articles (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_web_articles_author   ON web_articles (author_id);
CREATE INDEX IF NOT EXISTS idx_web_articles_sport    ON web_articles (sport);
CREATE INDEX IF NOT EXISTS idx_web_articles_subject  ON web_articles (subject_type, subject_name);

-- Touch trigger — keep updated_at honest without every query doing it.
CREATE OR REPLACE FUNCTION trg_touch_web_articles() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_web_articles ON web_articles;
CREATE TRIGGER trg_touch_web_articles BEFORE UPDATE ON web_articles
    FOR EACH ROW EXECUTE FUNCTION trg_touch_web_articles();
