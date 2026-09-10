-- 015: game-focused articles (previews & recaps).
--
-- The News Studio generator now supports a third subject type: 'game' —
-- articles written about a specific matchup (an upcoming game preview or a
-- final-score recap). web_articles.subject_name carries "Away @ Home" and
-- the ESPN event id is recorded in generator_prompt_subject for provenance.
--
-- The CHECK constraint in 012 only allows ('player','team','general'); this
-- migration widens it to include 'game'. Existing rows are untouched.

ALTER TABLE web_articles
  DROP CONSTRAINT IF EXISTS web_articles_subject_type_check;

ALTER TABLE web_articles
  ADD CONSTRAINT web_articles_subject_type_check
  CHECK (subject_type IN ('player','team','general','game'));
