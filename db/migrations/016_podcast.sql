-- ============================================================================
-- Valor Odds Web Platform — Podcast ("Beyond the Odds")
--
-- Episodes for the ValorOdds podcast. The podcast area is intentionally
-- HIDDEN from the public for now:
--   * /podcast routes return 404 for non-admins (no "coming soon" leak)
--   * robots.ts disallows /podcast; page-level metadata sets noindex
--   * Nothing links to it from public navigation or the sitemap
-- Admins reach it via /admin/podcast (Podcast Studio) or /podcast directly.
--
-- Design notes:
--   * YouTube-first episodes: youtube_id powers the embedded player, with
--     optional direct audio_url (mp3) for a plain <audio> fallback.
--   * status: draft → published (simple — episodes are admin-authored, no
--     writer workflow needed). 'published' episodes are the only ones the
--     (currently admin-only) listing page shows.
--   * published_at is stamped on first publish so the listing can sort by
--     recency even if an episode is edited afterwards.
--   * Optional news cross-link: related_article_id points at web_articles
--     so an episode can reference the story it discusses.
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_podcast_episodes (
    id              BIGSERIAL PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    description     TEXT,                        -- short summary / show notes teaser
    show_notes_md   TEXT,                        -- markdown show notes (rendered by ArticleBody)
    youtube_id      VARCHAR(32),                 -- episode video (embedded player)
    audio_url       TEXT,                        -- direct mp3 fallback (optional)
    cover_image_url TEXT,
    image_credit    TEXT,
    duration_seconds INTEGER,                    -- optional for display ("42 min")
    season          INTEGER,                     -- optional grouping
    episode_number  INTEGER,                     -- optional grouping
    sport           VARCHAR(50),                 -- null = general
    tags            TEXT[] NOT NULL DEFAULT '{}',
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published')),
    related_article_id BIGINT REFERENCES web_articles(id) ON DELETE SET NULL,
    created_by      BIGINT REFERENCES web_users(id) ON DELETE SET NULL,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_podcast_episodes_published
    ON web_podcast_episodes (status, published_at DESC)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_web_podcast_episodes_slug
    ON web_podcast_episodes (slug);
