"""
GLM Sports Analytics SDK - Main Client
The primary interface for interacting with the GLM Sports Analytics API
"""

import os
import time
import logging
from typing import Any, Optional, List, Union
import httpx

from .exceptions import (
    GLMSportsError,
    GLMAuthError,
    GLMRateLimitError,
    GLMAPIError,
    GLMConnectionError,
    GLMTimeoutError,
)
from .models import (
    AnalysisResult,
    SummaryResult,
    OddsResult,
    AskResult,
    ESPNResult,
    BatchResult,
)

logger = logging.getLogger(__name__)


class GLMSportsClient:
    """
    Python client for the GLM Sports Analytics API.

    Usage:
        from glm_sports import GLMSportsClient

        client = GLMSportsClient(
            base_url="https://your-app.up.railway.app",
            api_key="your_service_api_key"   # optional
        )

        # Analyze a game
        result = client.analyze({"game": "Lakers vs Warriors", "score": "112-108"})
        print(result)

        # Generate a tweet
        tweet = client.summarize(data, platform="twitter", tone="hype")
        print(tweet)

        # Analyze odds
        picks = client.odds(odds_data, sport="nba", analysis_type="value")
        print(picks)
    """

    def __init__(
        self,
        base_url: str = None,
        api_key: str = None,
        timeout: int = 60,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ):
        """
        Initialize the GLM Sports Analytics client.

        Args:
            base_url:     Your Railway deployment URL (or set GLM_BASE_URL env var)
            api_key:      Your SERVICE_API_KEY (or set GLM_API_KEY env var) — optional
            timeout:      Request timeout in seconds (default: 60)
            max_retries:  Number of retries on failure (default: 3)
            retry_delay:  Seconds between retries (default: 1.0)
        """
        self.base_url = (base_url or os.getenv("GLM_BASE_URL", "")).rstrip("/")
        if not self.base_url:
            raise GLMSportsError(
                "base_url is required. Pass it directly or set the GLM_BASE_URL environment variable."
            )

        self.api_key = api_key or os.getenv("GLM_API_KEY")
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay

        self._headers = {"Content-Type": "application/json"}
        if self.api_key:
            self._headers["X-API-Key"] = self.api_key

        logger.info(f"GLMSportsClient initialized → {self.base_url}")

    # ── Internal HTTP ──────────────────────────────────────────────────────────

    def _request(self, method: str, endpoint: str, **kwargs) -> dict:
        """Make an HTTP request with retry logic and error handling"""
        url = f"{self.base_url}{endpoint}"
        last_error = None

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.debug(f"[Attempt {attempt}] {method.upper()} {url}")
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.request(
                        method=method,
                        url=url,
                        headers=self._headers,
                        **kwargs
                    )

                # Handle specific HTTP errors
                if response.status_code == 403:
                    raise GLMAuthError()
                if response.status_code == 429:
                    raise GLMRateLimitError()
                if response.status_code >= 500:
                    raise GLMAPIError(
                        f"Server error: {response.text}",
                        status_code=response.status_code
                    )
                if response.status_code >= 400:
                    raise GLMAPIError(
                        f"Request error: {response.text}",
                        status_code=response.status_code
                    )

                return response.json()

            except (GLMAuthError, GLMRateLimitError):
                raise  # Don't retry auth/rate limit errors
            except httpx.ConnectError:
                raise GLMConnectionError(self.base_url)
            except httpx.TimeoutException:
                raise GLMTimeoutError(self.timeout)
            except GLMAPIError as e:
                last_error = e
                if attempt < self.max_retries:
                    logger.warning(f"Attempt {attempt} failed: {e}. Retrying in {self.retry_delay}s...")
                    time.sleep(self.retry_delay * attempt)
            except Exception as e:
                last_error = GLMSportsError(str(e))
                if attempt < self.max_retries:
                    logger.warning(f"Attempt {attempt} failed: {e}. Retrying in {self.retry_delay}s...")
                    time.sleep(self.retry_delay * attempt)

        raise last_error or GLMSportsError("Request failed after all retries")

    # ── Health Check ───────────────────────────────────────────────────────────

    def health(self) -> dict:
        """
        Check if the API is running.

        Returns:
            dict with status, version, and model info
        """
        return self._request("GET", "/health")

    def is_alive(self) -> bool:
        """Quick check — returns True if API is reachable"""
        try:
            result = self.health()
            return result.get("status") == "healthy"
        except Exception:
            return False

    # ── Core Methods ───────────────────────────────────────────────────────────

    def analyze(
        self,
        data: Any,
        context: str = None,
        output_format: str = "summary"
    ) -> AnalysisResult:
        """
        Analyze sports data and get AI-powered insights.

        Args:
            data:          Any sports data — dict, list, string, or raw JSON
            context:       Optional context e.g. "NBA Playoffs Game 5"
            output_format: "summary" | "bullets" | "post" | "report"

        Returns:
            AnalysisResult with .result containing the analysis text

        Example:
            result = client.analyze(
                data={"game": "Lakers vs Warriors", "score": "112-108", "lebron_pts": 34},
                context="NBA Playoffs",
                output_format="bullets"
            )
            print(result.result)
        """
        payload = {
            "data": data,
            "context": context,
            "output_format": output_format
        }
        response = self._request("POST", "/analyze", json=payload)
        return AnalysisResult(
            success=response.get("success", False),
            result=response.get("result"),
            model_used=response.get("model_used"),
            tokens_used=response.get("tokens_used"),
            error=response.get("error"),
            context=context,
            output_format=output_format
        )

    def summarize(
        self,
        data: Any,
        platform: str = "general",
        tone: str = "informative",
        max_length: int = None
    ) -> SummaryResult:
        """
        Generate a ready-to-post summary from sports data.

        Args:
            data:        Sports data to summarize
            platform:    "twitter" | "instagram" | "discord" | "general"
            tone:        "informative" | "hype" | "analytical" | "casual"
            max_length:  Optional character limit

        Returns:
            SummaryResult with .result containing post-ready text

        Example:
            tweet = client.summarize(
                data={"game": "Chiefs vs Eagles", "score": "27-21"},
                platform="twitter",
                tone="hype",
                max_length=280
            )
            print(tweet.result)           # The tweet text
            print(tweet.character_count)  # Auto-calculated length
        """
        payload = {
            "data": data,
            "platform": platform,
            "tone": tone,
            "max_length": max_length
        }
        response = self._request("POST", "/summarize", json=payload)
        return SummaryResult(
            success=response.get("success", False),
            result=response.get("result"),
            model_used=response.get("model_used"),
            tokens_used=response.get("tokens_used"),
            error=response.get("error"),
            platform=platform,
            tone=tone
        )

    def odds(
        self,
        odds_data: Any,
        sport: str = None,
        analysis_type: str = "value"
    ) -> OddsResult:
        """
        Analyze sportsbook odds and find value picks.

        Args:
            odds_data:     Sportsbook odds data (any format)
            sport:         "nba" | "nfl" | "mlb" | "nhl" | "soccer" | etc.
            analysis_type: "value" | "prediction" | "comparison" | "movement"

        Returns:
            OddsResult with .result containing odds analysis

        Example:
            picks = client.odds(
                odds_data={"game": "Celtics vs Heat", "moneyline": {"cel": -220, "heat": +185}},
                sport="nba",
                analysis_type="value"
            )
            print(picks.result)
        """
        payload = {
            "odds_data": odds_data,
            "sport": sport,
            "analysis_type": analysis_type
        }
        response = self._request("POST", "/odds", json=payload)
        return OddsResult(
            success=response.get("success", False),
            result=response.get("result"),
            model_used=response.get("model_used"),
            tokens_used=response.get("tokens_used"),
            error=response.get("error"),
            sport=sport,
            analysis_type=analysis_type
        )

    def ask(
        self,
        question: str,
        context: Any = None,
        sport: str = None
    ) -> AskResult:
        """
        Ask any sports question with optional data context.

        Args:
            question: Your sports question
            context:  Optional data to reference in the answer
            sport:    Optional sport context ("nba", "nfl", etc.)

        Returns:
            AskResult with .result containing the answer

        Example:
            answer = client.ask(
                question="Who leads the NBA in scoring this season?",
                sport="nba"
            )
            print(answer.result)

            # With data context
            answer = client.ask(
                question="Based on these stats, who is the MVP candidate?",
                context={"players": [{"name": "Luka", "ppg": 34.2}, {"name": "SGA", "ppg": 31.8}]},
                sport="nba"
            )
        """
        payload = {
            "question": question,
            "context": context,
            "sport": sport
        }
        response = self._request("POST", "/ask", json=payload)
        return AskResult(
            success=response.get("success", False),
            result=response.get("result"),
            model_used=response.get("model_used"),
            tokens_used=response.get("tokens_used"),
            error=response.get("error"),
            question=question,
            sport=sport
        )

    def espn(
        self,
        espn_data: Any,
        report_type: str = "recap",
        platform: str = "general"
    ) -> ESPNResult:
        """
        Process ESPN data into publishable sports content.

        Args:
            espn_data:   Raw ESPN API response data
            report_type: "recap" | "preview" | "standings" | "stats"
            platform:    Where the content will be posted

        Returns:
            ESPNResult with .result containing publishable content

        Example:
            recap = client.espn(
                espn_data=espn_api_response,
                report_type="recap",
                platform="discord"
            )
            post_to_discord(recap.result)
        """
        payload = {
            "espn_data": espn_data,
            "report_type": report_type,
            "platform": platform
        }
        response = self._request("POST", "/espn", json=payload)
        return ESPNResult(
            success=response.get("success", False),
            result=response.get("result"),
            model_used=response.get("model_used"),
            tokens_used=response.get("tokens_used"),
            error=response.get("error"),
            report_type=report_type,
            platform=platform
        )

    def batch(
        self,
        items: List[Any],
        analysis_type: str = "summarize",
        platform: str = "general"
    ) -> BatchResult:
        """
        Process multiple sports data items in one request (max 20).

        Args:
            items:         List of data items to process
            analysis_type: "summarize" | "analyze" | "odds"
            platform:      Platform for output formatting

        Returns:
            BatchResult — iterable, supports len(), indexing

        Example:
            games = [
                {"game": "Lakers vs Warriors", "score": "112-108"},
                {"game": "Celtics vs Heat", "score": "98-95"},
                {"game": "Nuggets vs Suns", "score": "118-102"}
            ]
            results = client.batch(games, analysis_type="summarize", platform="twitter")
            for item in results:
                print(item)
        """
        if len(items) > 20:
            raise GLMSportsError("Maximum 20 items per batch request")

        response = self._request(
            "POST",
            f"/batch?analysis_type={analysis_type}&platform={platform}",
            json=items
        )
        return BatchResult(
            success=response.get("success", False),
            total=response.get("total", 0),
            results=response.get("results", []),
            error=response.get("error")
        )

    # ── Convenience Methods ────────────────────────────────────────────────────

    def tweet(self, data: Any, tone: str = "hype") -> str:
        """
        Shortcut: Generate a tweet-ready post (max 280 chars).

        Returns just the text string, ready to post.

        Example:
            text = client.tweet({"game": "Chiefs vs Eagles", "score": "27-21"})
            twitter_api.post(text)
        """
        result = self.summarize(data, platform="twitter", tone=tone, max_length=280)
        if not result.success:
            raise GLMAPIError(result.error or "Tweet generation failed")
        return result.result

    def instagram_caption(self, data: Any, tone: str = "hype") -> str:
        """
        Shortcut: Generate an Instagram caption with hashtags.

        Returns just the caption string, ready to post.
        """
        result = self.summarize(data, platform="instagram", tone=tone)
        if not result.success:
            raise GLMAPIError(result.error or "Caption generation failed")
        return result.result

    def discord_post(self, data: Any, tone: str = "informative") -> str:
        """
        Shortcut: Generate a Discord-formatted post with markdown.

        Returns just the post string, ready to send.
        """
        result = self.summarize(data, platform="discord", tone=tone)
        if not result.success:
            raise GLMAPIError(result.error or "Discord post generation failed")
        return result.result

    def game_recap(self, espn_data: Any, platform: str = "general") -> str:
        """
        Shortcut: Generate a game recap from ESPN data.

        Returns just the recap string.
        """
        result = self.espn(espn_data, report_type="recap", platform=platform)
        if not result.success:
            raise GLMAPIError(result.error or "Recap generation failed")
        return result.result

    def best_bets(self, odds_data: Any, sport: str = None) -> str:
        """
        Shortcut: Find the best value bets from odds data.

        Returns just the analysis string.
        """
        result = self.odds(odds_data, sport=sport, analysis_type="value")
        if not result.success:
            raise GLMAPIError(result.error or "Odds analysis failed")
        return result.result

    def predictions(self, odds_data: Any, sport: str = None) -> str:
        """
        Shortcut: Get AI predictions from odds data.

        Returns just the predictions string.
        """
        result = self.odds(odds_data, sport=sport, analysis_type="prediction")
        if not result.success:
            raise GLMAPIError(result.error or "Predictions failed")
        return result.result

    # ── ESPN Live Data Methods ─────────────────────────────────────────────────

    def espn_scoreboard(self, league: str, date: str = None) -> dict:
        """
        Get live ESPN scoreboard for any league.

        Args:
            league: nba | nfl | mlb | nhl | ncaab | ncaaf | epl | mls | etc.
            date:   Optional YYYY-MM-DD (default: today)

        Example:
            games = client.espn_scoreboard("nba")
            for game in games["games"]:
                print(f"{game['away']['team']} @ {game['home']['team']} — {game['status']}")
        """
        params = {}
        if date:
            params["date"] = date
        return self._request("GET", f"/espn/scoreboard/{league}", params=params)

    def espn_news(self, league: str, limit: int = 10) -> dict:
        """
        Get latest ESPN news for a league.

        Args:
            league: nba | nfl | mlb | nhl | etc.
            limit:  Number of articles (default: 10)

        Example:
            news = client.espn_news("nba", limit=5)
            for article in news["articles"]:
                print(article["headline"])
        """
        return self._request("GET", f"/espn/news/{league}", params={"limit": limit})

    def espn_standings(self, league: str) -> dict:
        """
        Get current standings for a league.

        Example:
            standings = client.espn_standings("nba")
        """
        return self._request("GET", f"/espn/standings/{league}")

    def espn_teams(self, league: str) -> dict:
        """Get all teams in a league."""
        return self._request("GET", f"/espn/teams/{league}")

    def espn_team(self, league: str, team: str) -> dict:
        """
        Get specific team info.

        Args:
            league: nba | nfl | etc.
            team:   Team abbreviation (e.g. 'lal', 'kc', 'bos')
        """
        return self._request("GET", f"/espn/team/{league}/{team}")

    def espn_game(self, league: str, game_id: str) -> dict:
        """
        Get full game summary and box score.

        Args:
            league:  nba | nfl | etc.
            game_id: ESPN game ID (from scoreboard data)
        """
        return self._request("GET", f"/espn/game/{league}/{game_id}")

    def espn_today(self, leagues: str = "nba,nfl,mlb,nhl") -> dict:
        """
        Get all games today across multiple leagues.

        Args:
            leagues: Comma-separated league names (default: nba,nfl,mlb,nhl)

        Example:
            today = client.espn_today("nba,nfl")
            print(f"{today['total_games']} games today")
        """
        return self._request("GET", "/espn/today", params={"leagues": leagues})

    def espn_athlete(self, league: str, athlete_id: str) -> dict:
        """Get player stats by ESPN athlete ID."""
        return self._request("GET", f"/espn/athlete/{league}/{athlete_id}")

    # ── ESPN + AI Combo Shortcuts ──────────────────────────────────────────────

    def live_scores_summary(self, league: str, platform: str = "general", tone: str = "informative") -> str:
        """
        Shortcut: Fetch live ESPN scoreboard + auto AI summary in one call.

        Returns ready-to-post text.

        Example:
            post = client.live_scores_summary("nba", platform="twitter", tone="hype")
            twitter_api.post(post)
        """
        result = self._request(
            "POST", f"/espn/scoreboard-ai/{league}",
            params={"platform": platform, "tone": tone}
        )
        return result.get("result", "")

    def news_summary(self, league: str, platform: str = "general", tone: str = "informative", limit: int = 5) -> str:
        """
        Shortcut: Fetch latest ESPN news + auto AI summary in one call.

        Returns ready-to-post text.

        Example:
            post = client.news_summary("nfl", platform="discord", tone="analytical")
            discord.send(post)
        """
        result = self._request(
            "POST", f"/espn/news-ai/{league}",
            params={"platform": platform, "tone": tone, "limit": limit}
        )
        return result.get("result", "")

    def game_ai_recap(self, league: str, game_id: str, platform: str = "general") -> str:
        """
        Shortcut: Fetch ESPN game data + auto AI recap in one call.

        Returns ready-to-post recap text.
        """
        result = self._request(
            "POST", f"/espn/game-ai/{league}/{game_id}",
            params={"report_type": "recap", "platform": platform}
        )
        return result.get("result", "")

    def daily_digest(self, leagues: str = "nba,nfl,mlb,nhl", platform: str = "general", tone: str = "informative") -> str:
        """
        Shortcut: Get full AI-written daily sports digest across all leagues.

        Returns a comprehensive summary of everything happening today.

        Example:
            digest = client.daily_digest(platform="discord")
            discord.send(digest)
        """
        result = self._request(
            "POST", "/espn/today-ai",
            params={"leagues": leagues, "platform": platform, "tone": tone}
        )
        return result.get("result", "")

    # ── Sportsbook Data Methods ──────────────────────────────────────────────────

    def sb_sports(self) -> dict:
        """List all 24 supported sports with available sportsbooks."""
        return self._request("GET", "/sportsbook/sports")

    def sb_books(self) -> dict:
        """List all 34 supported sportsbooks."""
        return self._request("GET", "/sportsbook/books")

    def sb_odds(self, sport: str, book: str = None) -> dict:
        """
        Get raw aggregated odds for a sport across all sportsbooks.

        Args:
            sport: nba | nfl | mlb | nhl | ncaaf | ncaab | soccer | mma | boxing | tennis | golf
            book:  Optional sportsbook filter (e.g. "Bovada", "FanDuel", "DraftKings")

        Returns:
            Full odds data with all events and markets
        """
        path = f"/sportsbook/odds/{sport}"
        if book:
            path = f"/sportsbook/odds/{sport}/{book}"
        return self._request("GET", path)

    def sb_compare(self, sport: str) -> dict:
        """
        Compare odds across all sportsbooks for a sport.

        Returns best prices, line shopping data, and full odds breakdown per event.

        Args:
            sport: nba | nfl | mlb | nhl | soccer | etc.
        """
        return self._request("GET", f"/sportsbook/compare/{sport}")

    def sb_events(self, sport: str) -> dict:
        """
        Get all events grouped by matchup with multi-book odds view.

        Args:
            sport: nba | nfl | mlb | nhl | soccer | etc.
        """
        return self._request("GET", f"/sportsbook/events/{sport}")

    def sb_live(self, sport: str) -> dict:
        """
        Get live/in-progress events and odds for a sport.

        Args:
            sport: nba | nfl | mlb | nhl | soccer | etc.
        """
        return self._request("GET", f"/sportsbook/live/{sport}")

    def sb_best_bets(self, sport: str) -> dict:
        """
        Find top value bet opportunities by comparing lines across all sportsbooks.

        Returns events with biggest line discrepancies (most line shopping value).

        Args:
            sport: nba | nfl | mlb | nhl | soccer | etc.
        """
        return self._request("GET", f"/sportsbook/best-bets/{sport}")

    # ── Sportsbook + AI Combo Methods ─────────────────────────────────────────────

    def sb_odds_ai(
        self,
        sport: str,
        analysis_type: str = "value",
        platform: str = "general",
        sportsbook: str = None,
    ) -> str:
        """
        Auto-fetch live odds + AI analysis in one call. Returns ready-to-post text.

        Args:
            sport:         nba | nfl | mlb | nhl | soccer | etc.
            analysis_type: value | best_lines | comparison | live | picks
            platform:      twitter | instagram | discord | general
            sportsbook:    Optional - filter to one sportsbook

        Example:
            analysis = client.sb_odds_ai("nba", analysis_type="picks", platform="discord")
            discord.send(analysis)
        """
        payload = {
            "sport": sport,
            "analysis_type": analysis_type,
            "platform": platform,
        }
        if sportsbook:
            payload["sportsbook"] = sportsbook
        result = self._request("POST", f"/sportsbook/odds-ai/{sport}", json=payload)
        return result.get("result", "")

    def sb_compare_ai(self, sport: str, platform: str = "general") -> str:
        """
        Auto-fetch odds comparison across all sportsbooks + AI line-shopping analysis.

        Args:
            sport:    nba | nfl | mlb | nhl | soccer | etc.
            platform: twitter | instagram | discord | general

        Example:
            post = client.sb_compare_ai("nfl", platform="twitter")
            twitter.post(post)
        """
        payload = {"sport": sport, "platform": platform}
        result = self._request("POST", f"/sportsbook/compare-ai/{sport}", json=payload)
        return result.get("result", "")

    def sb_live_ai(self, sport: str) -> str:
        """
        Auto-fetch live in-game odds + AI real-time betting breakdown.

        Returns a live betting alert ready to post.

        Args:
            sport: nba | nfl | mlb | nhl | soccer | etc.

        Example:
            alert = client.sb_live_ai("nba")
            discord.send(alert)
        """
        payload = {"sport": sport}
        result = self._request("POST", f"/sportsbook/live-ai/{sport}", json=payload)
        return result.get("result", "")

    def sb_best_bets_ai(self, sport: str, platform: str = "general") -> str:
        """
        Auto-find best value bets across 34 sportsbooks + AI content generation.

        Returns ready-to-post best bets content. This is the ultimate one-liner
        for generating betting content - fetches odds, shops lines, and writes
        the post automatically.

        Args:
            sport:    nba | nfl | mlb | nhl | soccer | etc.
            platform: twitter | instagram | discord | general

        Example:
            post = client.sb_best_bets_ai("nba", platform="twitter")
            twitter.post(post)

            # Instagram best bets
            caption = client.sb_best_bets_ai("nfl", platform="instagram")
        """
        payload = {"sport": sport, "platform": platform}
        result = self._request("POST", f"/sportsbook/best-bets-ai/{sport}", json=payload)
        return result.get("result", "")


    # ── Context Manager Support ────────────────────────────────────────────────

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False

    def __repr__(self):
        return f"<GLMSportsClient url={self.base_url} authenticated={bool(self.api_key)}>"