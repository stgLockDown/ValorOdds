-- ============================================================================
-- Valor Odds — New Intelligence API Products
-- Arbitrage, Steam Moves, Injuries, AI Analysis
--
-- These are DB-sourced premium feeds (not proxied to a separate backend service
-- like the 26 sport APIs). The API Gateway queries the ValorOdds Postgres
-- database directly for these products.
--
-- Pricing (confirmed with product owner, based on competitor market research):
--   arbitrage    : $75/mo standalone / +$50/mo bundle add-on, weight 5
--                  (competitors: The Rundown $49+/mo, SportMonks $29+/mo)
--   steam_moves  : $75/mo standalone / +$50/mo bundle add-on, weight 5
--                  (competitors: SportsDataIO, The Rundown — premium tier)
--   injuries     : $39/mo standalone / +$25/mo bundle add-on, weight 2
--                  (competitors: SportsDataIO charges extra for injury feeds)
--   ai_analysis  : $149/mo standalone / +$100/mo bundle add-on, weight 10
--                  (competitors: SportMonks $29+/mo, Stats Perform enterprise)
--
-- Each can be purchased standalone (own dedicated ping pool) or added to a
-- bundle (draws from the shared ping-tier pool at its weight). Mirrors the
-- config in lib/api-monetization/pricing.ts — keep these in sync.
-- ============================================================================

INSERT INTO api_products (
    code, name, category, backend_url_env, ping_weight,
    addon_monthly_price_cents, standalone_monthly_price_cents, standalone_monthly_pings, sort_order
) VALUES
    (
        'arbitrage', 'Arbitrage & Sure-Bet Feed', 'premium', NULL, 5,
        5000,   -- +$50/mo bundle add-on
        7500,   -- $75/mo standalone
        50000,  -- standalone pool: 50,000 pings/mo at weight 5 -> 10,000 effective calls/mo
        210
    ),
    (
        'steam_moves', 'Steam Moves & Line Movement', 'premium', NULL, 5,
        5000,   -- +$50/mo bundle add-on
        7500,   -- $75/mo standalone
        50000,  -- standalone pool at weight 5 -> 10,000 effective calls/mo
        220
    ),
    (
        'injuries', 'Injury Reports', 'premium', NULL, 2,
        2500,   -- +$25/mo bundle add-on
        3900,   -- $39/mo standalone
        50000,  -- standalone pool at weight 2 -> 25,000 effective calls/mo
        230
    ),
    (
        'ai_analysis', 'AI Betting Intelligence', 'premium', NULL, 10,
        10000,  -- +$100/mo bundle add-on
        14900,  -- $149/mo standalone
        30000,  -- standalone pool at weight 10 -> 3,000 effective calls/mo
        240
    )
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    backend_url_env = EXCLUDED.backend_url_env,
    ping_weight = EXCLUDED.ping_weight,
    addon_monthly_price_cents = EXCLUDED.addon_monthly_price_cents,
    standalone_monthly_price_cents = EXCLUDED.standalone_monthly_price_cents,
    standalone_monthly_pings = EXCLUDED.standalone_monthly_pings,
    sort_order = EXCLUDED.sort_order;
