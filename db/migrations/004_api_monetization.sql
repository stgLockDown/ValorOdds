-- ============================================================================
-- Valor Odds — API Monetization Platform ("build your own bundle")
-- Additive only. Powers the new /api-access section + API Gateway service.
--
-- Pricing (confirmed with product owner):
--   Ping tiers (shared pool, consumed by all non-Odds sport calls at weight=1):
--     t10k   = 10,000 pings/mo   -> $12/mo
--     t50k   = 50,000 pings/mo   -> $35/mo
--     t250k  = 250,000 pings/mo  -> $125/mo
--     t1m    = 1,000,000 pings/mo -> $369/mo
--   Per-sport add-on: $5/mo per sport (26 sports), grants that sport access,
--     calls drawn from the ping-tier pool at weight 1.
--   All-Access add-on: flat $99/mo instead of 26x $5 (grants all 26 sports).
--   Odds API (premium, higher per-call cost):
--     Standalone: $250/mo flat, own dedicated pool of pings (does not touch
--       the sport ping-tier pool), weight=5 per call baked into that pool size.
--     Bundle add-on: +$100/mo on top of any ping-tier bundle. Calls draw from
--       the SAME shared pool as sports, but at ping_weight=5 (so effectively
--       costs 5x the quota of a normal sport call — "higher price per rate").
--   Overage: optional per-plan checkbox. When enabled, once the pool is
--     exhausted calls are still served and billed at overage_price_cents_per_1k
--     (metered). When disabled (default), calls are hard-cutoff with 429 once
--     the pool hits 0.
-- ============================================================================

-- ---------- Catalog: purchasable products (26 sports + odds + all_access) ----------
CREATE TABLE IF NOT EXISTS api_products (
    id                          BIGSERIAL PRIMARY KEY,
    code                        TEXT NOT NULL UNIQUE,      -- 'baseball', 'basketball', ..., 'odds', 'all_access'
    name                        TEXT NOT NULL,             -- 'Baseball API'
    category                    TEXT NOT NULL DEFAULT 'sport' CHECK (category IN ('sport','premium','bundle_addon')),
    backend_url_env             TEXT,                       -- Railway reference var name for gateway routing, e.g. RAILWAY_SERVICE_BASEBALL_API_URL
    ping_weight                 INT NOT NULL DEFAULT 1,     -- pings consumed per call against the pool
    addon_monthly_price_cents   INT,                        -- price to add to a bundle (null = not addable to bundle)
    standalone_monthly_price_cents INT,                     -- price to buy alone with own quota (null = not purchasable standalone)
    standalone_monthly_pings    BIGINT,                      -- quota granted when purchased standalone
    stripe_product_id           TEXT,
    stripe_price_id_addon        TEXT,
    stripe_price_id_standalone   TEXT,
    active                       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order                   INT NOT NULL DEFAULT 0,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_products_category ON api_products (category);

-- ---------- Catalog: ping tiers (the base "how many pings/mo" pool) ----------
CREATE TABLE IF NOT EXISTS api_ping_tiers (
    id                    BIGSERIAL PRIMARY KEY,
    code                  TEXT NOT NULL UNIQUE,   -- t10k, t50k, t250k, t1m
    name                  TEXT NOT NULL,
    monthly_pings         BIGINT NOT NULL,
    monthly_price_cents   INT NOT NULL,
    stripe_product_id     TEXT,
    stripe_price_id       TEXT,
    sort_order            INT NOT NULL DEFAULT 0,
    active                BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Customer plans (one Stripe subscription per plan) ----------
CREATE TABLE IF NOT EXISTS customer_api_plans (
    id                          BIGSERIAL PRIMARY KEY,
    user_id                     BIGINT NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
    plan_type                   TEXT NOT NULL DEFAULT 'bundle' CHECK (plan_type IN ('bundle','odds_standalone')),
    ping_tier_code              TEXT REFERENCES api_ping_tiers(code),   -- null for odds_standalone
    all_access                  BOOLEAN NOT NULL DEFAULT FALSE,
    odds_addon                  BOOLEAN NOT NULL DEFAULT FALSE,        -- odds bundle add-on purchased
    overage_enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    overage_price_cents_per_1k  INT NOT NULL DEFAULT 150,               -- $1.50 / 1,000 overage pings (default)
    monthly_ping_quota          BIGINT NOT NULL DEFAULT 0,               -- effective pool size for this plan
    stripe_customer_id          TEXT,
    stripe_subscription_id      TEXT UNIQUE,
    status                      TEXT NOT NULL DEFAULT 'active',          -- active, past_due, canceled, incomplete
    current_period_start        TIMESTAMPTZ,
    current_period_end          TIMESTAMPTZ,
    cancel_at_period_end        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_capi_plans_user ON customer_api_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_capi_plans_status ON customer_api_plans (status);
CREATE INDEX IF NOT EXISTS idx_capi_plans_stripe_sub ON customer_api_plans (stripe_subscription_id);
-- Only one active plan of each type per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_capi_plans_active_per_type
    ON customer_api_plans (user_id, plan_type)
    WHERE status IN ('active','trialing','past_due');

-- ---------- Which products a plan grants access to ----------
CREATE TABLE IF NOT EXISTS customer_api_plan_products (
    plan_id       BIGINT NOT NULL REFERENCES customer_api_plans(id) ON DELETE CASCADE,
    product_code  TEXT NOT NULL REFERENCES api_products(code),
    added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (plan_id, product_code)
);

-- ---------- API keys issued to customers ----------
CREATE TABLE IF NOT EXISTS customer_api_keys (
    id           BIGSERIAL PRIMARY KEY,
    plan_id      BIGINT NOT NULL REFERENCES customer_api_plans(id) ON DELETE CASCADE,
    key_hash     TEXT NOT NULL UNIQUE,     -- sha256 hex of the raw key
    key_prefix   TEXT NOT NULL,            -- first chars of raw key, safe to display, e.g. "vok_ab12cd34"
    label        TEXT NOT NULL DEFAULT 'default',
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_capi_keys_plan ON customer_api_keys (plan_id);
CREATE INDEX IF NOT EXISTS idx_capi_keys_hash ON customer_api_keys (key_hash);

-- ---------- Per-billing-period usage counters (fast path for gateway) ----------
CREATE TABLE IF NOT EXISTS api_key_usage_periods (
    id                   BIGSERIAL PRIMARY KEY,
    plan_id              BIGINT NOT NULL REFERENCES customer_api_plans(id) ON DELETE CASCADE,
    period_start         DATE NOT NULL,
    period_end           DATE NOT NULL,
    pings_included       BIGINT NOT NULL DEFAULT 0,
    pings_used           BIGINT NOT NULL DEFAULT 0,
    overage_pings        BIGINT NOT NULL DEFAULT 0,
    overage_cost_cents   BIGINT NOT NULL DEFAULT 0,
    status               TEXT NOT NULL DEFAULT 'active',  -- active, exhausted
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_usage_periods_plan ON api_key_usage_periods (plan_id, period_start DESC);

-- ---------- Lightweight call log (monitoring) ----------
CREATE TABLE IF NOT EXISTS api_key_usage_events (
    id            BIGSERIAL PRIMARY KEY,
    key_id        BIGINT NOT NULL REFERENCES customer_api_keys(id) ON DELETE CASCADE,
    plan_id       BIGINT NOT NULL REFERENCES customer_api_plans(id) ON DELETE CASCADE,
    product_code  TEXT NOT NULL,
    endpoint      TEXT NOT NULL,
    weight        INT NOT NULL DEFAULT 1,
    status_code   INT,
    called_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_plan_time ON api_key_usage_events (plan_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_key_time ON api_key_usage_events (key_id, called_at DESC);

-- ---------- updated_at triggers ----------
DROP TRIGGER IF EXISTS trg_api_products_touch ON api_products;
CREATE TRIGGER trg_api_products_touch BEFORE UPDATE ON api_products
  FOR EACH ROW EXECUTE FUNCTION web_touch_updated_at();

DROP TRIGGER IF EXISTS trg_api_ping_tiers_touch ON api_ping_tiers;
CREATE TRIGGER trg_api_ping_tiers_touch BEFORE UPDATE ON api_ping_tiers
  FOR EACH ROW EXECUTE FUNCTION web_touch_updated_at();

DROP TRIGGER IF EXISTS trg_capi_plans_touch ON customer_api_plans;
CREATE TRIGGER trg_capi_plans_touch BEFORE UPDATE ON customer_api_plans
  FOR EACH ROW EXECUTE FUNCTION web_touch_updated_at();

DROP TRIGGER IF EXISTS trg_usage_periods_touch ON api_key_usage_periods;
CREATE TRIGGER trg_usage_periods_touch BEFORE UPDATE ON api_key_usage_periods
  FOR EACH ROW EXECUTE FUNCTION web_touch_updated_at();

-- ============================================================================
-- Seed: ping tiers
-- ============================================================================
INSERT INTO api_ping_tiers (code, name, monthly_pings, monthly_price_cents, sort_order) VALUES
    ('t10k',  '10,000 pings/mo',    10000,    1200, 1),
    ('t50k',  '50,000 pings/mo',    50000,    3500, 2),
    ('t250k', '250,000 pings/mo',   250000,  12500, 3),
    ('t1m',   '1,000,000 pings/mo', 1000000, 36900, 4)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    monthly_pings = EXCLUDED.monthly_pings,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- Seed: 26 sport products ($5/mo addon each, 1x weight)
-- ============================================================================
INSERT INTO api_products (code, name, category, backend_url_env, ping_weight, addon_monthly_price_cents, sort_order) VALUES
    ('baseball',        'Baseball API',        'sport', 'RAILWAY_SERVICE_BASEBALL_API_URL',        1, 500, 1),
    ('basketball',       'Basketball API',       'sport', 'RAILWAY_SERVICE_BASKETBALL_API_URL',       1, 500, 2),
    ('soccer',           'Soccer API',            'sport', 'RAILWAY_SERVICE_SOCCER_API_URL',            1, 500, 3),
    ('hockey',            'Hockey API',            'sport', 'RAILWAY_SERVICE_HOCKEY_API_URL',            1, 500, 4),
    ('football',          'Football API',          'sport', 'RAILWAY_SERVICE_FOOTBALL_API_URL',          1, 500, 5),
    ('fifa',              'FIFA API',               'sport', 'RAILWAY_SERVICE_FIFA_API_URL',              1, 500, 6),
    ('champions_league',  'Champions League API',  'sport', 'RAILWAY_SERVICE_CHAMPIONSLEAGUE_API_URL',   1, 500, 7),
    ('tennis',            'Tennis API',             'sport', 'RAILWAY_SERVICE_TENNIS_API_URL',            1, 500, 8),
    ('golf',              'Golf API',               'sport', 'RAILWAY_SERVICE_GOLF_API_URL',              1, 500, 9),
    ('cricket',           'Cricket API',            'sport', 'RAILWAY_SERVICE_CRICKET_API_URL',           1, 500, 10),
    ('cycling',           'Cycling API',            'sport', 'RAILWAY_SERVICE_CYCLING_API_URL',           1, 500, 11),
    ('combat',            'Combat Sports API',      'sport', 'RAILWAY_SERVICE_COMBAT_API_URL',            1, 500, 12),
    ('rugby',             'Rugby API',              'sport', 'RAILWAY_SERVICE_RUGBY_API_URL',             1, 500, 13),
    ('rugby_league',      'Rugby League API',       'sport', 'RAILWAY_SERVICE_RUGBY_LEAGUE_API_URL',      1, 500, 14),
    ('swimming',          'Swimming API',           'sport', 'RAILWAY_SERVICE_SWIMMING_API_URL',          1, 500, 15),
    ('tour_de_france',    'Tour De France API',     'sport', 'RAILWAY_SERVICE_TOUR_DE_FRANCE_API_URL',    1, 500, 16),
    ('track',             'Track API',              'sport', 'RAILWAY_SERVICE_TRACK_API_URL',             1, 500, 17),
    ('volleyball',        'Volleyball API',         'sport', 'RAILWAY_SERVICE_VOLLEYBALL_API_URL',        1, 500, 18),
    ('wimbledon',         'Wimbledon API',          'sport', 'RAILWAY_SERVICE_WIMBLEDON_API_URL',         1, 500, 19),
    ('world_series',      'World Series API',       'sport', 'RAILWAY_SERVICE_WORLDSERIES_API_URL',       1, 500, 20),
    ('xgames',            'X Games API',            'sport', 'RAILWAY_SERVICE_XGAMES_API_URL',            1, 500, 21),
    ('motorsports',       'Motorsports API',        'sport', 'RAILWAY_SERVICE_MOTORSPORTS_API_URL',       1, 500, 22),
    ('olympics',          'Olympics API',           'sport', 'RAILWAY_SERVICE_OLYMPICS_API_URL',          1, 500, 23),
    ('march_madness',     'March Madness API',      'sport', 'RAILWAY_SERVICE_MARCH_MADNESS_API_URL',     1, 500, 24),
    ('superbowl',         'Super Bowl API',         'sport', 'RAILWAY_SERVICE_SUPERBOWL_API_URL',         1, 500, 25),
    ('formula1',          'Formula 1 API',          'sport', 'RAILWAY_SERVICE_FORMULA1_API_URL',          1, 500, 26)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    backend_url_env = EXCLUDED.backend_url_env,
    ping_weight = EXCLUDED.ping_weight,
    addon_monthly_price_cents = EXCLUDED.addon_monthly_price_cents,
    sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- Seed: All-Access bundle add-on ($99/mo flat instead of 26 x $5 = $130/mo)
-- ============================================================================
INSERT INTO api_products (code, name, category, ping_weight, addon_monthly_price_cents, sort_order) VALUES
    ('all_access', 'All-Access (all 26 sports)', 'bundle_addon', 1, 9900, 100)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    addon_monthly_price_cents = EXCLUDED.addon_monthly_price_cents,
    sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- Seed: Odds API — premium, higher per-call cost (weight 5), standalone or addon
-- ============================================================================
INSERT INTO api_products (
    code, name, category, backend_url_env, ping_weight,
    addon_monthly_price_cents, standalone_monthly_price_cents, standalone_monthly_pings, sort_order
) VALUES (
    'odds', 'Odds API', 'premium', 'RAILWAY_SERVICE_SPORTSBOOK_API_URL', 5,
    10000,   -- +$100/mo bundle add-on (draws from shared pool at weight 5)
    25000,   -- $250/mo standalone
    50000,   -- standalone pool: 50,000 pings/mo (at weight 5 -> 10,000 effective odds calls/mo)
    200
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    backend_url_env = EXCLUDED.backend_url_env,
    ping_weight = EXCLUDED.ping_weight,
    addon_monthly_price_cents = EXCLUDED.addon_monthly_price_cents,
    standalone_monthly_price_cents = EXCLUDED.standalone_monthly_price_cents,
    standalone_monthly_pings = EXCLUDED.standalone_monthly_pings,
    sort_order = EXCLUDED.sort_order;
