-- ============================================================================
-- Live Zone — real-time play-by-play feed with reactions + comments.
--
-- Scope: sport-agnostic schema; v1 ingestion only populates NFL, but every
-- column here is designed to also carry MLB/NHL events with no schema
-- changes (situational fields are all nullable and sport-specific ones
-- like down/distance simply stay NULL for sports that don't have them).
--
-- Reactions: anonymous, fingerprint-deduped (same pattern as community_polls
-- / community_poll_votes) — no login required.
-- Comments: require a logged-in web_users account (FK, ON DELETE CASCADE).
-- ============================================================================

-- ---------- Feed events (one row per play / timeout / quarter-end / status change) ----------
CREATE TABLE IF NOT EXISTS live_feed_events (
    id                BIGSERIAL PRIMARY KEY,
    sport             TEXT NOT NULL,                 -- 'NFL' | 'MLB' | 'NHL' ...
    espn_event_id     TEXT NOT NULL,                 -- ESPN game/event id (join key to games)
    -- Stable identity of the underlying play across corrections/updates.
    -- Sourced from ESPN's play id where available; synthesized otherwise.
    source_play_id    TEXT NOT NULL,
    version           INTEGER NOT NULL DEFAULT 1,     -- bumped when ESPN corrects a play after the fact
    event_type        TEXT NOT NULL,                  -- 'play' | 'tv_timeout' | 'team_timeout' | 'quarter_end' | 'game_status'
    play_type_text    TEXT,                           -- raw ESPN type.text, e.g. "Rushing Touchdown"
    text              TEXT,                           -- human-readable play description
    team_abbrev       TEXT,                           -- team that ran the play / called the timeout
    -- Score snapshot AT THE TIME of this event (not live current score) —
    -- core to the "Sleeper Zone" feed concept.
    home_score        INTEGER,
    away_score        INTEGER,
    period            INTEGER,
    clock_display     TEXT,                           -- e.g. "04:24"
    clock_seconds     INTEGER,                         -- normalized seconds remaining in period, for sorting
    -- Situational data (NFL-specific but nullable for other sports).
    down              INTEGER,
    distance          INTEGER,
    yard_line         INTEGER,
    yards_to_endzone  INTEGER,
    possession_text   TEXT,
    down_distance_text TEXT,
    is_red_zone       BOOLEAN,
    -- Field position, normalized 0.0 (own end zone) .. 1.0 (opponent end zone).
    field_position     NUMERIC(4,3),
    -- Scoring / turnover flags.
    is_scoring_play   BOOLEAN NOT NULL DEFAULT FALSE,
    scoring_type      TEXT,
    is_turnover       BOOLEAN NOT NULL DEFAULT FALSE,
    stat_yardage      INTEGER,
    -- Wallclock timestamp from the provider, used for ordering.
    wallclock         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sport, espn_event_id, source_play_id)
);

CREATE INDEX IF NOT EXISTS idx_live_feed_events_game
  ON live_feed_events (sport, espn_event_id, wallclock DESC, id DESC);

-- ---------- Reactions (anonymous, fingerprint-deduped, one per emoji per voter) ----------
CREATE TABLE IF NOT EXISTS live_feed_reactions (
    id                BIGSERIAL PRIMARY KEY,
    event_id          BIGINT NOT NULL REFERENCES live_feed_events(id) ON DELETE CASCADE,
    emoji             TEXT NOT NULL,                  -- e.g. '🔥', '😂', '👏', '😱'
    voter_fingerprint TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, emoji, voter_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_live_feed_reactions_event ON live_feed_reactions (event_id);

-- ---------- Comments (require login, threaded via parent_id) ----------
CREATE TABLE IF NOT EXISTS live_feed_comments (
    id                BIGSERIAL PRIMARY KEY,
    event_id          BIGINT NOT NULL REFERENCES live_feed_events(id) ON DELETE CASCADE,
    user_id           BIGINT NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
    parent_id         BIGINT REFERENCES live_feed_comments(id) ON DELETE CASCADE,
    body              TEXT NOT NULL,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_feed_comments_event ON live_feed_comments (event_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_live_feed_comments_parent ON live_feed_comments (parent_id);
