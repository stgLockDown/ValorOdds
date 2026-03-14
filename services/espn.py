"""
ESPN Data Service
Fetches live data directly from ESPN's hidden API endpoints — no API key needed.
Covers: NBA, NFL, MLB, NHL, NCAAB, NCAAF, WNBA, Soccer, College Baseball
"""

import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

ESPN_BASE = "http://site.api.espn.com/apis/site/v2/sports"

# Sport/League path map
LEAGUE_PATHS = {
    # Basketball
    "nba":    "basketball/nba",
    "wnba":   "basketball/wnba",
    "ncaab":  "basketball/mens-college-basketball",
    "ncaaw":  "basketball/womens-college-basketball",
    # Football
    "nfl":    "football/nfl",
    "ncaaf":  "football/college-football",
    # Baseball
    "mlb":    "baseball/mlb",
    "ncaab_baseball": "baseball/college-baseball",
    # Hockey
    "nhl":    "hockey/nhl",
    # Soccer
    "epl":    "soccer/eng.1",
    "mls":    "soccer/usa.1",
    "ucl":    "soccer/uefa.champions",
    "laliga": "soccer/esp.1",
    "bundesliga": "soccer/ger.1",
    "seriea": "soccer/ita.1",
    "ligue1": "soccer/fra.1",
    "soccer": "soccer/eng.1",  # default soccer = EPL
}


class ESPNService:
    def __init__(self):
        self.client = httpx.Client(
            timeout=15.0,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; GLMSportsBot/1.0)",
                "Accept": "application/json"
            }
        )
        logger.info("ESPNService initialized")

    def _get(self, url: str, params: dict = None) -> dict:
        """Make a GET request to ESPN API"""
        try:
            response = self.client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"ESPN HTTP error {e.response.status_code}: {url}")
            raise ValueError(f"ESPN API returned {e.response.status_code} for {url}")
        except Exception as e:
            logger.error(f"ESPN request failed: {e}")
            raise ValueError(f"ESPN request failed: {str(e)}")

    def _league_path(self, league: str) -> str:
        """Resolve league string to ESPN path"""
        league = league.lower().strip()
        path = LEAGUE_PATHS.get(league)
        if not path:
            raise ValueError(
                f"Unknown league '{league}'. Supported: {', '.join(LEAGUE_PATHS.keys())}"
            )
        return path

    def _format_date(self, date: str = None) -> str:
        """Format date to YYYYMMDD for ESPN API"""
        if not date:
            return datetime.now().strftime("%Y%m%d")
        # Accept YYYY-MM-DD or YYYYMMDD
        date = date.replace("-", "")
        return date

    # ── Scoreboard ────────────────────────────────────────────────────────────

    def get_scoreboard(self, league: str, date: str = None) -> dict:
        """
        Get scoreboard (live scores, today's games, or any date).

        Args:
            league: nba, nfl, mlb, nhl, ncaab, ncaaf, epl, mls, etc.
            date:   YYYY-MM-DD or YYYYMMDD (default: today)
        """
        path = self._league_path(league)
        url = f"{ESPN_BASE}/{path}/scoreboard"
        params = {}
        if date:
            params["dates"] = self._format_date(date)
        # For college basketball, include groups param to get all games
        if "college-basketball" in path:
            params["groups"] = 50
            params["limit"] = 200

        data = self._get(url, params)
        return self._parse_scoreboard(data, league)

    def _parse_scoreboard(self, raw: dict, league: str) -> dict:
        """Parse ESPN scoreboard into clean format"""
        events = raw.get("events", [])
        games = []

        for event in events:
            try:
                competition = event.get("competitions", [{}])[0]
                competitors = competition.get("competitors", [])

                home = next((c for c in competitors if c.get("homeAway") == "home"), {})
                away = next((c for c in competitors if c.get("homeAway") == "away"), {})

                status = competition.get("status", {})
                status_type = status.get("type", {})

                game = {
                    "id": event.get("id"),
                    "name": event.get("name"),
                    "short_name": event.get("shortName"),
                    "date": event.get("date"),
                    "status": status_type.get("description", "Unknown"),
                    "completed": status_type.get("completed", False),
                    "period": status.get("period", 0),
                    "clock": status.get("displayClock", ""),
                    "home": {
                        "team": home.get("team", {}).get("displayName", ""),
                        "abbreviation": home.get("team", {}).get("abbreviation", ""),
                        "score": home.get("score", "-"),
                        "record": home.get("records", [{}])[0].get("summary", "") if home.get("records") else "",
                        "logo": home.get("team", {}).get("logo", ""),
                    },
                    "away": {
                        "team": away.get("team", {}).get("displayName", ""),
                        "abbreviation": away.get("team", {}).get("abbreviation", ""),
                        "score": away.get("score", "-"),
                        "record": away.get("records", [{}])[0].get("summary", "") if away.get("records") else "",
                        "logo": away.get("team", {}).get("logo", ""),
                    },
                    "venue": competition.get("venue", {}).get("fullName", ""),
                    "broadcast": [
                        b.get("names", [""])[0]
                        for b in competition.get("broadcasts", [])
                        if b.get("names")
                    ],
                    "league": league.upper()
                }

                # Add leaders if available
                leaders = competition.get("leaders", [])
                if leaders:
                    game["leaders"] = [
                        {
                            "stat": l.get("displayName", ""),
                            "player": l.get("leaders", [{}])[0].get("athlete", {}).get("displayName", ""),
                            "value": l.get("leaders", [{}])[0].get("displayValue", "")
                        }
                        for l in leaders[:3] if l.get("leaders")
                    ]

                games.append(game)
            except Exception as e:
                logger.warning(f"Failed to parse game: {e}")
                continue

        return {
            "league": league.upper(),
            "date": raw.get("day", {}).get("date", datetime.now().strftime("%Y-%m-%d")),
            "total_games": len(games),
            "games": games
        }

    # ── Game Summary ──────────────────────────────────────────────────────────

    def get_game_summary(self, league: str, game_id: str) -> dict:
        """
        Get detailed game summary including box score, play-by-play, leaders.

        Args:
            league:  nba, nfl, mlb, nhl, etc.
            game_id: ESPN game ID (found in scoreboard data)
        """
        path = self._league_path(league)
        url = f"{ESPN_BASE}/{path}/summary"
        data = self._get(url, params={"event": game_id})
        return self._parse_game_summary(data)

    def _parse_game_summary(self, raw: dict) -> dict:
        """Parse ESPN game summary into clean format"""
        header = raw.get("header", {})
        competitions = header.get("competitions", [{}])
        competition = competitions[0] if competitions else {}
        competitors = competition.get("competitors", [])

        home = next((c for c in competitors if c.get("homeAway") == "home"), {})
        away = next((c for c in competitors if c.get("homeAway") == "away"), {})

        result = {
            "game_id": header.get("id"),
            "name": header.get("name", ""),
            "status": competition.get("status", {}).get("type", {}).get("description", ""),
            "completed": competition.get("status", {}).get("type", {}).get("completed", False),
            "home": {
                "team": home.get("team", {}).get("displayName", ""),
                "score": home.get("score", "-"),
                "record": home.get("record", [{}])[0].get("displayValue", "") if home.get("record") else "",
                "linescores": [ls.get("displayValue", "") for ls in home.get("linescores", [])]
            },
            "away": {
                "team": away.get("team", {}).get("displayName", ""),
                "score": away.get("score", "-"),
                "record": away.get("record", [{}])[0].get("displayValue", "") if away.get("record") else "",
                "linescores": [ls.get("displayValue", "") for ls in away.get("linescores", [])]
            }
        }

        # Box score leaders
        boxscore = raw.get("boxscore", {})
        players = boxscore.get("players", [])
        result["box_score"] = []
        for team_data in players:
            team_name = team_data.get("team", {}).get("displayName", "")
            stats_groups = team_data.get("statistics", [])
            team_stats = {"team": team_name, "players": []}
            for group in stats_groups[:1]:  # First stat group (main stats)
                athletes = group.get("athletes", [])
                keys = group.get("keys", [])
                labels = group.get("labels", [])
                for athlete in athletes[:8]:  # Top 8 players
                    player_name = athlete.get("athlete", {}).get("displayName", "")
                    stats = athlete.get("stats", [])
                    stat_dict = {}
                    for i, key in enumerate(keys[:len(stats)]):
                        stat_dict[labels[i] if i < len(labels) else key] = stats[i]
                    team_stats["players"].append({"name": player_name, "stats": stat_dict})
            result["box_score"].append(team_stats)

        # Game leaders
        leaders = raw.get("leaders", [])
        if leaders:
            result["leaders"] = []
            for leader_cat in leaders[:5]:
                leaders_list = leader_cat.get("leaders", [])
                if leaders_list:
                    result["leaders"].append({
                        "category": leader_cat.get("displayName", ""),
                        "player": leaders_list[0].get("athlete", {}).get("displayName", ""),
                        "team": leaders_list[0].get("team", {}).get("displayName", ""),
                        "value": leaders_list[0].get("displayValue", "")
                    })

        return result

    # ── News ──────────────────────────────────────────────────────────────────

    def get_news(self, league: str, limit: int = 10) -> dict:
        """
        Get latest sports news for a league.

        Args:
            league: nba, nfl, mlb, nhl, etc.
            limit:  Number of articles (default: 10)
        """
        path = self._league_path(league)
        url = f"{ESPN_BASE}/{path}/news"
        data = self._get(url, params={"limit": limit})
        articles = data.get("articles", [])

        return {
            "league": league.upper(),
            "total": len(articles),
            "articles": [
                {
                    "headline": a.get("headline", ""),
                    "description": a.get("description", ""),
                    "published": a.get("published", ""),
                    "url": a.get("links", {}).get("web", {}).get("href", ""),
                    "author": a.get("byline", ""),
                    "categories": [c.get("description", "") for c in a.get("categories", [])[:3]]
                }
                for a in articles
            ]
        }

    # ── Teams ─────────────────────────────────────────────────────────────────

    def get_teams(self, league: str) -> dict:
        """Get all teams for a league"""
        path = self._league_path(league)
        url = f"{ESPN_BASE}/{path}/teams"
        data = self._get(url)

        sports = data.get("sports", [{}])
        leagues_data = sports[0].get("leagues", [{}]) if sports else [{}]
        teams_raw = leagues_data[0].get("teams", []) if leagues_data else []

        return {
            "league": league.upper(),
            "total": len(teams_raw),
            "teams": [
                {
                    "id": t.get("team", {}).get("id"),
                    "name": t.get("team", {}).get("displayName", ""),
                    "abbreviation": t.get("team", {}).get("abbreviation", ""),
                    "location": t.get("team", {}).get("location", ""),
                    "color": t.get("team", {}).get("color", ""),
                    "logo": t.get("team", {}).get("logos", [{}])[0].get("href", "") if t.get("team", {}).get("logos") else ""
                }
                for t in teams_raw
            ]
        }

    def get_team(self, league: str, team: str) -> dict:
        """
        Get specific team info and roster.

        Args:
            league: nba, nfl, etc.
            team:   Team abbreviation (e.g., 'lal', 'kc', 'bos')
        """
        path = self._league_path(league)
        url = f"{ESPN_BASE}/{path}/teams/{team}"
        data = self._get(url)
        team_data = data.get("team", {})

        return {
            "id": team_data.get("id"),
            "name": team_data.get("displayName", ""),
            "abbreviation": team_data.get("abbreviation", ""),
            "location": team_data.get("location", ""),
            "record": team_data.get("record", {}).get("items", [{}])[0].get("summary", "") if team_data.get("record") else "",
            "standing": team_data.get("standingSummary", ""),
            "logo": team_data.get("logos", [{}])[0].get("href", "") if team_data.get("logos") else "",
            "color": team_data.get("color", ""),
            "venue": team_data.get("venue", {}).get("fullName", ""),
            "next_event": team_data.get("nextEvent", [{}])[0].get("name", "") if team_data.get("nextEvent") else ""
        }

    # ── Standings ─────────────────────────────────────────────────────────────

    def get_standings(self, league: str) -> dict:
        """Get current standings for a league"""
        path = self._league_path(league)
        url = f"{ESPN_BASE}/{path}/standings"
        data = self._get(url)

        children = data.get("children", [])
        standings = []

        for conference in children:
            conf_name = conference.get("name", "")
            entries = conference.get("standings", {}).get("entries", [])
            teams = []
            for entry in entries:
                team_data = entry.get("team", {})
                stats = {s.get("name"): s.get("displayValue") for s in entry.get("stats", [])}
                teams.append({
                    "rank": entry.get("stats", [{}])[0].get("value", 0) if entry.get("stats") else 0,
                    "team": team_data.get("displayName", ""),
                    "abbreviation": team_data.get("abbreviation", ""),
                    "wins": stats.get("wins", "-"),
                    "losses": stats.get("losses", "-"),
                    "win_pct": stats.get("winPercent", "-"),
                    "games_back": stats.get("gamesBehind", "-"),
                    "streak": stats.get("streak", "-"),
                    "home": stats.get("Home", "-"),
                    "away": stats.get("Road", "-"),
                })
            standings.append({"conference": conf_name, "teams": teams})

        return {"league": league.upper(), "standings": standings}

    # ── Athlete Stats ─────────────────────────────────────────────────────────

    def get_athlete_stats(self, league: str, athlete_id: str) -> dict:
        """
        Get player stats by athlete ID.

        Args:
            league:     nba, nfl, mlb, etc.
            athlete_id: ESPN athlete ID
        """
        path = self._league_path(league)
        url = f"https://site.web.api.espn.com/apis/common/v3/sports/{path}/athletes/{athlete_id}/stats"
        data = self._get(url, params={"region": "us", "lang": "en", "contentorigin": "espn"})

        athlete = data.get("athlete", {})
        splits = data.get("splitCategories", [])

        result = {
            "id": athlete_id,
            "name": athlete.get("displayName", ""),
            "position": athlete.get("position", {}).get("displayName", ""),
            "team": athlete.get("team", {}).get("displayName", ""),
            "stats": {}
        }

        for split in splits[:1]:
            types = split.get("types", [])
            for stat_type in types[:1]:
                labels = stat_type.get("labels", [])
                values = stat_type.get("totals", [])
                for i, label in enumerate(labels):
                    if i < len(values):
                        result["stats"][label] = values[i]

        return result

    # ── Today's Summary ───────────────────────────────────────────────────────

    def get_todays_games(self, leagues: list = None) -> dict:
        """
        Get all games happening today across multiple leagues.

        Args:
            leagues: List of league strings (default: nba, nfl, mlb, nhl)
        """
        if not leagues:
            leagues = ["nba", "nfl", "mlb", "nhl"]

        all_games = {}
        for league in leagues:
            try:
                scoreboard = self.get_scoreboard(league)
                if scoreboard.get("total_games", 0) > 0:
                    all_games[league.upper()] = scoreboard
            except Exception as e:
                logger.warning(f"Could not fetch {league} scoreboard: {e}")
                all_games[league.upper()] = {"error": str(e), "total_games": 0}

        return {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "leagues": all_games,
            "total_games": sum(
                v.get("total_games", 0) for v in all_games.values()
            )
        }

    def __del__(self):
        try:
            self.client.close()
        except Exception:
            pass