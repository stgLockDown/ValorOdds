-- ============================================================================
-- Valor Odds Web Platform — User Preferences Schema
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_user_preferences (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES web_users(id) ON DELETE CASCADE UNIQUE,
    -- Followed teams (array of team names)
    teams       TEXT[] NOT NULL DEFAULT '{}',
    -- Followed players (array of player names)
    players     TEXT[] NOT NULL DEFAULT '{}',
    -- Followed sportsbooks (array of bookmaker keys)
    sportsbooks TEXT[] NOT NULL DEFAULT '{}',
    -- Followed sports (array of sport keys e.g. 'NBA','NFL','MLB')
    sports      TEXT[] NOT NULL DEFAULT '{}',
    -- Dashboard tab preference
    default_tab TEXT NOT NULL DEFAULT 'overview',
    -- Notification preferences
    notify_arb       BOOLEAN NOT NULL DEFAULT TRUE,
    notify_steam     BOOLEAN NOT NULL DEFAULT TRUE,
    notify_injuries  BOOLEAN NOT NULL DEFAULT TRUE,
    notify_best_bets BOOLEAN NOT NULL DEFAULT TRUE,
    -- Misc settings
    odds_format TEXT NOT NULL DEFAULT 'american' CHECK (odds_format IN ('american','decimal','fractional')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prefs_user ON web_user_preferences (user_id);

DROP TRIGGER IF EXISTS trg_web_prefs_touch ON web_user_preferences;
CREATE TRIGGER trg_web_prefs_touch BEFORE UPDATE ON web_user_preferences
  FOR EACH ROW EXECUTE FUNCTION web_touch_updated_at();