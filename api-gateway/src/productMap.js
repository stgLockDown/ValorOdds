/**
 * Maps a purchasable product code -> backend Railway service hostname.
 * These are the SAME 26 sport API services + the Odds (Sportsbook-API)
 * service already running in the `merry-mercy` Railway project. The
 * gateway proxies to them over the public internet using their existing
 * Railway public domains (works whether the gateway itself is deployed
 * inside merry-mercy on the private network or anywhere else).
 *
 * Each backend host env var can be overridden in Railway without a code
 * change (e.g. if a service's public domain ever changes).
 */
const PRODUCT_BACKENDS = {
  baseball: process.env.BACKEND_BASEBALL || 'baseball-api-production-3f4f.up.railway.app',
  basketball: process.env.BACKEND_BASKETBALL || 'basketball-api-production-31a7.up.railway.app',
  soccer: process.env.BACKEND_SOCCER || 'soccer-api-production-e793.up.railway.app',
  hockey: process.env.BACKEND_HOCKEY || 'hockey-api-production-8ebd.up.railway.app',
  football: process.env.BACKEND_FOOTBALL || 'football-api-production-fa22.up.railway.app',
  fifa: process.env.BACKEND_FIFA || 'fifa-api-production-7ba9.up.railway.app',
  champions_league: process.env.BACKEND_CHAMPIONS_LEAGUE || 'championsleague-api-production.up.railway.app',
  tennis: process.env.BACKEND_TENNIS || 'tennis-api-production-aa3c.up.railway.app',
  golf: process.env.BACKEND_GOLF || 'golf-api-production-b380.up.railway.app',
  cricket: process.env.BACKEND_CRICKET || 'cricket-api-production-74d5.up.railway.app',
  cycling: process.env.BACKEND_CYCLING || 'cycling-api-production-b319.up.railway.app',
  combat: process.env.BACKEND_COMBAT || 'combat-api-production-15fd.up.railway.app',
  rugby: process.env.BACKEND_RUGBY || 'rugby-api-production-07f7.up.railway.app',
  rugby_league: process.env.BACKEND_RUGBY_LEAGUE || 'rugby-league-api-production-1204.up.railway.app',
  swimming: process.env.BACKEND_SWIMMING || 'swimming-api-production-6bf6.up.railway.app',
  tour_de_france: process.env.BACKEND_TOUR_DE_FRANCE || 'tour-de-france-api-production-4630.up.railway.app',
  track: process.env.BACKEND_TRACK || 'track-api-production-b3a1.up.railway.app',
  volleyball: process.env.BACKEND_VOLLEYBALL || 'volleyball-api-production-b6bf.up.railway.app',
  wimbledon: process.env.BACKEND_WIMBLEDON || 'wimbledon-api-production-4871.up.railway.app',
  world_series: process.env.BACKEND_WORLD_SERIES || 'worldseries-api-production.up.railway.app',
  xgames: process.env.BACKEND_XGAMES || 'xgames-api-production-f430.up.railway.app',
  motorsports: process.env.BACKEND_MOTORSPORTS || 'motorsports-api-production-1704.up.railway.app',
  olympics: process.env.BACKEND_OLYMPICS || 'olympics-api-production-a850.up.railway.app',
  march_madness: process.env.BACKEND_MARCH_MADNESS || 'march-madness-api-production-f42e.up.railway.app',
  superbowl: process.env.BACKEND_SUPERBOWL || 'superbowl-api-production-e2bb.up.railway.app',
  formula1: process.env.BACKEND_FORMULA1 || 'formula1-api-production-452f.up.railway.app',
  // Odds is a different service (Sportsbook-API) with a different auth style
  // (it does not use the X-API-Key/api_keys-table pattern the sport APIs use —
  // it's an internal-only service today) — gateway still fronts it uniformly.
  odds: process.env.BACKEND_ODDS || 'sportsbook-api-production-296e.up.railway.app',
};

// Sport product codes use the shared per-schema X-API-Key auth pattern.
// Odds (Sportsbook-API) currently has no such per-key auth of its own —
// the gateway is the ONLY auth boundary for it (backend trusts all callers
// on its network / with no key). We still forward a marker header for
// forward-compatibility if that service adds key auth later.
const SPORT_PRODUCT_CODES = Object.keys(PRODUCT_BACKENDS).filter((c) => c !== 'odds');

module.exports = { PRODUCT_BACKENDS, SPORT_PRODUCT_CODES };
