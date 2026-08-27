-- ============================================================================
-- Performance indexes for odds_snapshots
--
-- The games hub (lib/games-data.ts) queries odds_snapshots by sport_key +
-- commence_time to resolve individual games by slug, and by game_id +
-- snapshot_time to fetch the latest odds per book/market.
--
-- NOTE: idx_odds_games_cover (sport_key, commence_time, game_id) already
-- exists on production and covers the getGameBySlug access pattern, so we
-- do NOT recreate that index here. We only add the composite index needed
-- for fetchOddsForGames / getFullOddsBreakdown.
--
-- Uses CONCURRENTLY to avoid blocking writes on the 17M-row production
-- table (the Discord bot writes snapshots continuously).
-- ============================================================================

-- fetchOddsForGames / getFullOddsBreakdown: DISTINCT ON (game_id, market_type,
-- outcome_name, bookmaker_key) ... ORDER BY ... snapshot_time DESC. This
-- composite index lets Postgres satisfy the DISTINCT ON + ORDER BY via an
-- index scan rather than a sort of the full filtered set.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_odds_snapshots_game_market_outcome_book_snapshot
  ON odds_snapshots (game_id, market_type, outcome_name, bookmaker_key, snapshot_time DESC);
