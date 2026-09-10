-- 014: structured source references for news articles.
--
-- web_articles.source_links (text[]) stores bare URLs — enough for a
-- hostname-only citation list, but not for proper attribution ("CBS Sports —
-- Seahawks down two safeties…"). The generator now also records structured
-- refs { url, name, headline } in web_articles.sources so article pages can
-- render a real Sources footer with outlet + story headline per link.
--
-- source_links stays untouched: it is the canonical url list used by the
-- generator normalizer and any existing consumers.

ALTER TABLE web_articles
  ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Fast lookups for "articles citing outlet X" in the admin news studio.
CREATE INDEX IF NOT EXISTS idx_web_articles_sources
  ON web_articles USING gin (sources jsonb_path_ops);
