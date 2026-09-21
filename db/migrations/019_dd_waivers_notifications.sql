-- ============================================================================
-- DiamondDraft — Waiver wire + in-app notifications
-- ============================================================================
-- Two additions:
--
--   1. dd_notifications — the in-app event feed that powers the popup/toast
--      notifications ("your matchup went final", "waiver claim processed",
--      "trade proposed"). One row per (league, recipient) so each manager has
--      their own read/unread state. Rows are fanned out at emit time from a
--      single league event, which keeps the read path a trivial indexed scan.
--
--   2. Supporting indexes on dd_waiver_claims so the waiver wire can list a
--      manager's claims and the processor can find due claims efficiently.
--
-- The waiver wire itself reuses the pre-existing (but never used)
-- dd_waiver_claims table. No schema change is required there beyond indexes.
-- ============================================================================

-- ---------- In-app notification feed ----------
CREATE TABLE IF NOT EXISTS dd_notifications (
    id          BIGSERIAL PRIMARY KEY,
    league_id   BIGINT NOT NULL REFERENCES dd_leagues(id) ON DELETE CASCADE,
    -- Recipient. NULL means "everyone in the league" (league-wide broadcast);
    -- the API expands those to the caller at read time.
    member_id   BIGINT REFERENCES dd_league_members(id) ON DELETE CASCADE,
    -- Coarse category used for icon/colour selection in the UI.
    -- 'score' | 'matchup' | 'waiver' | 'trade' | 'draft' | 'league'
    kind        TEXT NOT NULL DEFAULT 'league',
    title       TEXT NOT NULL,
    body        TEXT,
    -- Optional deep link the toast/bell navigates to when clicked.
    url         TEXT,
    -- Free-form payload (matchup id, player name, scores, ...).
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Dedupe key so re-running a scorer/processor never double-notifies.
    -- Unique per (league_id, dedupe_key) when present.
    dedupe_key  TEXT,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary read path: "my unread notifications in this league, newest first".
CREATE INDEX IF NOT EXISTS idx_ddnotif_member_created
    ON dd_notifications (member_id, created_at DESC);

-- League-wide broadcasts (member_id IS NULL) and the polling cursor.
CREATE INDEX IF NOT EXISTS idx_ddnotif_league_created
    ON dd_notifications (league_id, created_at DESC);

-- Partial unique index enforces dedupe without blocking NULL dedupe_key rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ddnotif_dedupe
    ON dd_notifications (league_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

-- ---------- Waiver wire indexes ----------
-- "My pending claims in this league" (the Waivers tab).
CREATE INDEX IF NOT EXISTS idx_ddwaivers_member_status
    ON dd_waiver_claims (member_id, status);

-- The processor scans pending claims for a league ordered by priority/bid.
CREATE INDEX IF NOT EXISTS idx_ddwaivers_league_status
    ON dd_waiver_claims (league_id, status, claim_date);
