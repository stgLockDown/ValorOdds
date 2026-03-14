"""
SportsbookService - Connects to the custom sportsbook aggregation API
API: sportsbook-api-production-296e.up.railway.app
34 sportsbooks, 24 sports, real-time odds aggregation
"""

import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)

SPORTSBOOK_BASE = "https://sportsbook-api-production-296e.up.railway.app"

TIMEOUT = 30.0


class SportsbookService:
    def __init__(self):
        self.base_url = SPORTSBOOK_BASE
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=TIMEOUT,
            headers={"Accept": "application/json"},
        )

    async def close(self):
        await self.client.aclose()

    # ─────────────────────────────────────────
    # Meta / Discovery
    # ─────────────────────────────────────────

    async def get_sports(self) -> dict:
        """List all 24 supported sports with available sportsbooks."""
        try:
            r = await self.client.get("/sports")
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"get_sports error: {e}")
            return {"error": str(e)}

    async def get_sportsbooks(self) -> dict:
        """List all 34 supported sportsbooks."""
        try:
            r = await self.client.get("/sportsbooks")
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"get_sportsbooks error: {e}")
            return {"error": str(e)}

    async def get_health(self) -> dict:
        """Health check for the sportsbook API."""
        try:
            r = await self.client.get("/health")
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"get_health error: {e}")
            return {"error": str(e)}

    # ─────────────────────────────────────────
    # Odds
    # ─────────────────────────────────────────

    async def get_odds(self, sport: str, sportsbook: Optional[str] = None) -> dict:
        """
        Fetch odds for a sport, optionally filtered to one sportsbook.
        Returns raw aggregated data from all sportsbooks (or just one).
        """
        try:
            path = f"/odds/{sport}"
            if sportsbook:
                path = f"/odds/{sport}/{sportsbook}"
            r = await self.client.get(path)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"get_odds error: {e}")
            return {"error": str(e)}

    async def get_compare(self, sport: str) -> dict:
        """
        Compare odds across all sportsbooks for a sport.
        Returns best prices, line shopping data, and all_odds per event.
        """
        try:
            r = await self.client.get(f"/compare/{sport}")
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"get_compare error: {e}")
            return {"error": str(e)}

    async def get_events(self, sport: str) -> dict:
        """
        Get all events for a sport grouped by event (multi-book view).
        Each event shows odds from every sportsbook that has it.
        """
        try:
            r = await self.client.get(f"/events/{sport}")
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"get_events error: {e}")
            return {"error": str(e)}

    async def get_live(self, sport: str) -> dict:
        """
        Get only live/in-progress events for a sport.
        Returns live odds across all sportsbooks.
        """
        try:
            r = await self.client.get(f"/live/{sport}")
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"get_live error: {e}")
            return {"error": str(e)}

    # ─────────────────────────────────────────
    # Parsed / Clean helpers
    # ─────────────────────────────────────────

    def _parse_compare_for_ai(self, compare_data: dict) -> dict:
        """
        Condense /compare/{sport} data into a compact AI-friendly structure.
        Pulls out: matchup, is_live, best moneyline prices, best spread, best total.
        """
        sport = compare_data.get("sport", "")
        comparisons = compare_data.get("comparisons", [])
        parsed_events = []

        for comp in comparisons[:20]:  # cap at 20 events for token budget
            home = comp.get("home_team", "")
            away = comp.get("away_team", "")
            is_live = comp.get("is_live", False)
            start_time = comp.get("start_time", "")
            best_prices = comp.get("best_prices", {})
            num_books = comp.get("num_sportsbooks", 0)

            parsed_events.append({
                "matchup": f"{away} @ {home}",
                "is_live": is_live,
                "start_time": start_time,
                "books_available": num_books,
                "best_prices": best_prices,
            })

        return {
            "sport": sport,
            "total_events": compare_data.get("total_events", 0),
            "multi_book_events": compare_data.get("multi_book_events", 0),
            "events": parsed_events,
        }

    def _parse_live_for_ai(self, live_data: dict) -> dict:
        """
        Condense /live/{sport} data into AI-friendly format.
        Groups events by matchup and collects key market data.
        """
        sport = live_data.get("sport", "")
        raw_events = live_data.get("events", [])

        # Deduplicate by matchup
        seen = {}
        for entry in raw_events:
            event = entry.get("event", {})
            key = f"{event.get('away_team', '')} @ {event.get('home_team', '')}"
            book = entry.get("sportsbook", "")
            if key not in seen:
                seen[key] = {
                    "matchup": key,
                    "home_team": event.get("home_team", ""),
                    "away_team": event.get("away_team", ""),
                    "is_live": event.get("is_live", True),
                    "start_time": event.get("start_time", ""),
                    "sportsbooks": [],
                    "markets_summary": {},
                }
            seen[key]["sportsbooks"].append(book)

            # Collect market data
            for market in event.get("markets", []):
                mtype = market.get("market_type", "other")
                if mtype not in seen[key]["markets_summary"]:
                    seen[key]["markets_summary"][mtype] = []
                for outcome in market.get("outcomes", []):
                    seen[key]["markets_summary"][mtype].append({
                        "book": book,
                        "outcome": outcome.get("name", ""),
                        "american": outcome.get("price_american"),
                        "point": outcome.get("point"),
                    })

        return {
            "sport": sport,
            "live_count": live_data.get("live_count", 0),
            "live_events": list(seen.values())[:15],  # cap for token budget
        }

    def _parse_odds_for_ai(self, odds_data: dict) -> dict:
        """
        Parse raw /odds/{sport} data into compact AI-friendly structure.
        Groups by event and summarizes markets.
        """
        raw_data = odds_data.get("data", [])
        events_map = {}

        for book_entry in raw_data:
            book_name = book_entry.get("sportsbook", "")
            for event in book_entry.get("events", [])[:30]:  # limit events
                home = event.get("home_team", "")
                away = event.get("away_team", "")
                key = f"{away} @ {home}"
                if key not in events_map:
                    events_map[key] = {
                        "matchup": key,
                        "home_team": home,
                        "away_team": away,
                        "is_live": event.get("is_live", False),
                        "start_time": event.get("start_time", ""),
                        "books": [],
                        "moneyline": [],
                        "spread": [],
                        "total": [],
                    }
                if book_name not in events_map[key]["books"]:
                    events_map[key]["books"].append(book_name)

                for market in event.get("markets", []):
                    mtype = market.get("market_type", "")
                    if mtype in ("moneyline", "spread", "total"):
                        for outcome in market.get("outcomes", []):
                            events_map[key][mtype].append({
                                "book": book_name,
                                "outcome": outcome.get("name", ""),
                                "american": outcome.get("price_american"),
                                "point": outcome.get("point"),
                            })

        return {
            "total_events": odds_data.get("total_events", 0),
            "sportsbooks_queried": odds_data.get("sportsbooks_queried", 0),
            "events": list(events_map.values())[:20],
        }

    async def get_best_bets(self, sport: str) -> dict:
        """
        Convenience method: fetch compare data and extract best value bets.
        Returns top value opportunities (biggest line discrepancies across books).
        """
        compare = await self.get_compare(sport)
        if "error" in compare:
            return compare

        comparisons = compare.get("comparisons", [])
        best_bets = []

        for comp in comparisons:
            home = comp.get("home_team", "")
            away = comp.get("away_team", "")
            best_prices = comp.get("best_prices", {})
            num_books = comp.get("num_sportsbooks", 0)

            if num_books < 3:
                continue  # skip thin markets

            # Find biggest spread between best and worst price for each team
            all_odds = comp.get("all_odds", {})
            for team_name in [home, away]:
                prices = []
                for book_odds in all_odds.values():
                    if team_name in book_odds:
                        prices.append(book_odds[team_name].get("american", 0))

                if len(prices) >= 3:
                    spread = max(prices) - min(prices)
                    if spread >= 20:  # meaningful line difference
                        best_bets.append({
                            "matchup": f"{away} @ {home}",
                            "team": team_name,
                            "is_live": comp.get("is_live", False),
                            "best_price": max(prices),
                            "worst_price": min(prices),
                            "line_spread": spread,
                            "best_book": best_prices.get(team_name, {}).get("sportsbook", ""),
                            "books_available": num_books,
                        })

        # Sort by biggest spread (most value)
        best_bets.sort(key=lambda x: x["line_spread"], reverse=True)

        return {
            "sport": sport,
            "total_opportunities": len(best_bets),
            "top_bets": best_bets[:10],
        }

    async def get_cache_stats(self) -> dict:
        """Get cache statistics from the sportsbook API."""
        try:
            r = await self.client.get("/cache/stats")
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"get_cache_stats error: {e}")
            return {"error": str(e)}