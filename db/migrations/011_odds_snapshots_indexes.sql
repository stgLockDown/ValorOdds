-- ============================================================================
-- Performance indexes for odds_snapshots
--
-- The games hub (lib/games-data.ts) queries odds_snapshots by sport_key +
-- commence_time to resolve individual games by slug, and by game_id +
-- snapshot_time to fetch the latest odds per book/market. The existing
-- indexes (idx_odds_sport_time on sport/snapshot_time, idx_odds_game on
-- game_id/market_type) don't cover these access patterns, forcing full
-- table scans on a table that receives thousands of rows per odds snapshot
-- cycle. These indexes make the game-detail page lookup sub-millisecond.
-- ============================================================================

-- Primary lookup path for getGameBySlug: filter by sport_key + commence_time
-- window, then GROUP BY game_id. A composite index on (sport_key, commence_time)
-- lets Postgres use an index range scan instead of scanning every row.
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_sportkey_commence
  ON odds_snapshots (sport_key, commence_time);

-- fetchOddsForGames / getFullOddsBreakdown: DISTINCT ON (game_id, market_type,
-- outcome_name, bookmaker_key) ... ORDER BY ... snapshot_time DESC. This
-- composite index lets Postgres satisfy the DISTINCT ON + ORDER BY via an
-- index scan rather than a sort of the full filtered set.
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_game_market_outcome_book_snapshot
  ON odds_snapshots (game_id, market_type, outcome_name, bookmaker_key, snapshot_time DESC);
