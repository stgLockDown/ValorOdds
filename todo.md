# Wire Entire Site to External APIs

## APIs
- ANALYTICS: https://sports-analytics-api-production.up.railway.app
- SPORTSBOOK: https://sportsbook-api-production-296e.up.railway.app

## Phase 1: Rewrite Server Routes
- [ ] Rewrite server/routes/dashboard.js → pull stats from SPORTSBOOK /odds + ANALYTICS /espn/today
- [ ] Rewrite server/routes/games.js → /espn/scoreboard, /espn/news, SPORTSBOOK /odds, /events
- [ ] Rewrite server/routes/opportunities.js → SPORTSBOOK /odds, /compare, /live, best-bets + ANALYTICS AI endpoints
- [ ] Create shared helper (server/lib/apis.js) for fetching from both APIs

## Phase 2: Build & Test
- [ ] Build frontend (no frontend changes needed — same API contract)
- [ ] Commit and push

## Endpoint Mapping
Dashboard stats:
  - activeArbs → SPORTSBOOK /compare/{sport} count opportunities
  - gamesToday → ANALYTICS /espn/today
  - sportsCovered → SPORTSBOOK /sports count
  - aiAnalyses → count from /espn/scoreboard aggregation

Games:
  - /api/games → ANALYTICS /espn/today + SPORTSBOOK /events/{sport}
  - /api/games/scores → ANALYTICS /espn/scoreboard/{league}
  - /api/games/news → ANALYTICS /espn/news/{league}
  - /api/games/injuries → (not available, return empty or simulate)
  - /api/games/weather → (not available, return empty)
  - /api/games/bookmakers → SPORTSBOOK /sportsbooks

Opportunities:
  - /api/opportunities/arbitrage → SPORTSBOOK /compare/{sport} (find arb gaps)
  - /api/opportunities/player-props → ANALYTICS /espn/scoreboard (player data)
  - /api/opportunities/ai-analysis → ANALYTICS POST /analyze
  - /api/opportunities/summary → aggregate from multiple endpoints
  - /api/opportunities/games → ANALYTICS /espn/today

Odds Comparison:
  - /api/games (with sport) → SPORTSBOOK /events/{sport}
  - /api/games/bookmakers → SPORTSBOOK /sportsbooks