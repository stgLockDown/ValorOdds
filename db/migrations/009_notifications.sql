-- ============================================================================
-- Valor Odds Web Platform — Notifications / Push Schema
-- ============================================================================
-- Powers the notification system:
--   * push_subscriptions — Web Push (VAPID) subscriptions per user/device.
--   * pinned_games       — games a user has "pinned" to their phone pull-down
--                          shade; the dispatcher pushes live box scores + big
--                          plays for these games as persistent notifications.
-- ============================================================================

-- Web Push subscriptions. One row per (user, device endpoint). The endpoint is
-- unique because a browser push endpoint maps to exactly one subscription.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
    -- The browser push endpoint URL (unique per device/subscription).
    endpoint    TEXT NOT NULL UNIQUE,
    -- VAPID / encryption keys from PushSubscription.toJSON().keys
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    -- Optional device metadata for management UI.
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions (user_id);

DROP TRIGGER IF EXISTS trg_push_subs_touch ON push_subscriptions;
CREATE TRIGGER trg_push_subs_touch BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION web_touch_updated_at();

-- Games a user has pinned. The dispatcher watches these and pushes live box
-- scores + big plays. espn_event_id + sport let us fetch the ESPN summary.
CREATE TABLE IF NOT EXISTS pinned_games (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
    -- Our internal game id (matches live_scores.game_id / dashboard games).
    game_id         TEXT NOT NULL,
    -- ESPN event id used to fetch the box score + play-by-play summary.
    espn_event_id   TEXT,
    sport           TEXT NOT NULL,
    home_team       TEXT NOT NULL,
    away_team       TEXT NOT NULL,
    home_abbrev     TEXT,
    away_abbrev     TEXT,
    game_date       TIMESTAMPTZ,
    -- Per-pin notification toggles.
    notify_score    BOOLEAN NOT NULL DEFAULT TRUE,
    notify_big_plays BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- A user can pin a given game only once.
    UNIQUE (user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_games_user ON pinned_games (user_id);
CREATE INDEX IF NOT EXISTS idx_pinned_games_game ON pinned_games (game_id);

DROP TRIGGER IF EXISTS trg_pinned_games_touch ON pinned_games;
CREATE TRIGGER trg_pinned_games_touch BEFORE UPDATE ON pinned_games
  FOR EACH ROW EXECUTE FUNCTION web_touch_updated_at();
