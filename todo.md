# Fix Dashboard Data Mapping

## API Response Formats (Verified)

### Analytics API (`sports-analytics-api-production.up.railway.app`)
- `/espn/today` → `{ date, leagues: { NBA: { league, total_games, games: [...] }, MLB: {...}, ... }, total_games }`
- `/espn/scoreboard/{league}` → `{ league, date, total_games, games: [...] }`
- `/espn/news/{league}` → `{ league, total, articles: [{ headline, description, published, url, author, categories }] }`
- Game format: `{ id, name, short_name, date, status, completed, period, clock, home: { team, abbreviation, score, record, logo }, away: { team, abbreviation, score, record, logo }, venue, broadcast: [], league }`

### Sportsbook API (`sportsbook-api-production-296e.up.railway.app`)
- Sport keys are SIMPLE: `nba`, `nfl`, `mlb`, `nhl` (NOT `basketball_nba`)
- `/sports` → `{ total_sports, total_sportsbooks, sports: [{ key, sport, league, sportsbooks: [], sportsbook_count }] }`
- `/health` → `{ status, version, sportsbooks: [], sportsbook_count, sport_count, cache }`
- `/compare/{sport}` → `{ sport, market, total_events, multi_book_events, comparisons: [{ home_team, away_team, sport, league, start_time, is_live, sportsbooks_with_odds, num_sportsbooks, best_prices: { TeamName: { price, sportsbook }, Home: {...}, Away: {...} }, all_odds: {...} }] }`
- `/events/{sport}` → `{ sport, total_events, events: [{ home_team, away_team, sport, league, start_time, is_live, num_sportsbooks, sportsbooks: { BookName: { event_id, markets: [{ market_type, name, outcomes }] } } }] }`
- `/sportsbooks` → `{ total, sportsbooks: [{ name, type, region, description }] }`

## Tasks

- [x] Fix `server/lib/apis.js` - Update SPORT_MAP to use simple keys (nba, nfl, etc.)
- [x] Fix `server/routes/dashboard.js` - Parse `todayData.leagues` correctly, fix sportsbook sport keys
- [x] Fix `server/routes/games.js` - Parse scoreboard `data.games[]` flat format, fix `normalizeGame()`, fix today parsing
- [x] Fix `server/routes/opportunities.js` - Parse compare `data.comparisons[]`, fix today parsing, fix scoreboard parsing
- [ ] Push to git and verify