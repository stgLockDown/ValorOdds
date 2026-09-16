-- 017 — DiamondDraft: College Football (NCAAF / devy) support for dynasty taxi squads.
--
-- Dynasty leagues draft actual college players into their taxi squad slots.
-- College players live in dd_player_pool with sport = 'NCAAF' (a POOL sport,
-- not a league sport — leagues remain NFL/MLB; college players are drafted
-- INTO NFL dynasty leagues). Draft picks made on college players store
-- sport = 'NCAAF' on the pick row so taxi-slot logic and roster display can
-- distinguish devy prospects from active NFL players.
--
-- Extend the sport CHECK constraints on the five affected tables.

ALTER TABLE dd_leagues      DROP CONSTRAINT dd_leagues_sport_check;
ALTER TABLE dd_leagues      ADD CONSTRAINT dd_leagues_sport_check
  CHECK (sport IN ('NFL','MLB','NCAAF'));

ALTER TABLE dd_player_pool  DROP CONSTRAINT dd_player_pool_sport_check;
ALTER TABLE dd_player_pool  ADD CONSTRAINT dd_player_pool_sport_check
  CHECK (sport IN ('NFL','MLB','NCAAF'));

ALTER TABLE dd_draft_picks  DROP CONSTRAINT dd_draft_picks_sport_check;
ALTER TABLE dd_draft_picks  ADD CONSTRAINT dd_draft_picks_sport_check
  CHECK (sport IN ('NFL','MLB','NCAAF'));

ALTER TABLE dd_rosters      DROP CONSTRAINT dd_rosters_sport_check;
ALTER TABLE dd_rosters      ADD CONSTRAINT dd_rosters_sport_check
  CHECK (sport IN ('NFL','MLB','NCAAF'));

ALTER TABLE dd_mock_drafts  DROP CONSTRAINT dd_mock_drafts_sport_check;
ALTER TABLE dd_mock_drafts  ADD CONSTRAINT dd_mock_drafts_sport_check
  CHECK (sport IN ('NFL','MLB','NCAAF'));
