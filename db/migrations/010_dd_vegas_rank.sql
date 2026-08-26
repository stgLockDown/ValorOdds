-- 010: DiamondDraft Vegas-odds fantasy ranking columns
--
-- Adds vegas_score and vegas_rank to dd_player_pool so players can be ranked
-- by the betting market's implied team totals / win probabilities alongside
-- the existing ESPN-based `rank` and `adp`.
--
-- vegas_score: 0-100 composite (higher = better market fantasy outlook)
-- vegas_rank:  1-based rank within sport by vegas_score (1 = best outlook)
--
-- Both are nullable: a player with no upcoming-game odds (bye week, off-day,
-- All-Star break) has NULL until odds appear.

ALTER TABLE dd_player_pool
  ADD COLUMN IF NOT EXISTS vegas_score NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS vegas_rank INT;

CREATE INDEX IF NOT EXISTS idx_ddpool_vegas_rank
  ON dd_player_pool(season_year, sport, vegas_rank);
