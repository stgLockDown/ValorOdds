"""
GLM Sports Analytics API
Powered by Groq + Llama 3.3 70B
Deploy on Railway - connects your platform to AI-powered sports analytics
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, Security, Depends
from fastapi.security.api_key import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from models import (
    AnalyzeRequest,
    SummarizeRequest,
    OddsRequest,
    AskRequest,
    ESPNRequest,
    APIResponse,
    SportsbookOddsAIRequest,
    SportsbookCompareAIRequest,
    SportsbookBestBetsRequest,
    SportsbookLiveAIRequest,
)
from services.analytics import SportsAnalyticsService
from services.espn import ESPNService
from services.sportsbook import SportsbookService

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Auth ──────────────────────────────────────────────────────────────────────
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def get_api_key(api_key: str = Security(api_key_header)):
    """Validate API key if SERVICE_API_KEY env var is set"""
    service_key = os.getenv("SERVICE_API_KEY")
    if not service_key:
        return True  # No key configured = open access (good for dev)
    if api_key == service_key:
        return True
    raise HTTPException(status_code=403, detail="Invalid or missing API Key")

# ── App Lifecycle ─────────────────────────────────────────────────────────────
analytics_service: SportsAnalyticsService = None
espn_service: ESPNService = None
sportsbook_service: SportsbookService = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global analytics_service, espn_service, sportsbook_service
    logger.info("Starting GLM Sports Analytics API...")
    analytics_service = SportsAnalyticsService()
    espn_service = ESPNService()
    sportsbook_service = SportsbookService()
    logger.info("✅ Analytics service ready")
    logger.info("✅ ESPN service ready")
    logger.info("✅ Sportsbook service ready")
    yield
    logger.info("Shutting down GLM Sports Analytics API...")
    await sportsbook_service.close()

# ── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="GLM Sports Analytics API",
    description="AI-powered sports analytics, odds analysis, and content generation powered by GLM-5 & Groq",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Health Check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Railway health check endpoint"""
    return {
        "status": "healthy",
        "service": "GLM Sports Analytics API",
        "version": "1.0.0",
        "models": {
            "primary": "llama-3.3-70b-versatile",
            "fast": "llama-3.1-8b-instant",
            "reasoning": "deepseek-r1-distill-llama-70b"
        }
    }

@app.get("/")
async def root():
    return {
        "service": "GLM Sports Analytics API",
        "status": "running",
        "docs": "/docs",
        "endpoints": {
            "POST /analyze": "Analyze sports data and get insights",
            "POST /summarize": "Generate ready-to-post summaries",
            "POST /odds": "Analyze sportsbook odds and find value",
            "POST /ask": "Ask any sports question with optional data context",
            "POST /espn": "Process ESPN data into publishable content",
            "POST /batch": "Process multiple items at once",
            "GET /health": "Service health check",
            "GET /espn/scoreboard/{league}": "Live ESPN scoreboard",
            "GET /espn/news/{league}": "Latest ESPN news",
            "GET /espn/standings/{league}": "League standings",
            "GET /espn/teams/{league}": "All teams in a league",
            "GET /espn/team/{league}/{team}": "Specific team info",
            "GET /espn/game/{league}/{game_id}": "Game summary & box score",
            "GET /espn/today": "All games today across all leagues",
            "POST /espn/scoreboard-ai/{league}": "Live scoreboard + AI analysis",
            "POST /espn/news-ai/{league}": "Latest news + AI summary",
            "POST /espn/game-ai/{league}/{game_id}": "Game summary + AI recap",
            "GET /sportsbook/sports": "List all 24 supported sports",
            "GET /sportsbook/books": "List all 34 sportsbooks",
            "GET /sportsbook/odds/{sport}": "Raw odds across all sportsbooks",
            "GET /sportsbook/odds/{sport}/{book}": "Odds from one sportsbook",
            "GET /sportsbook/compare/{sport}": "Best lines comparison across all books",
            "GET /sportsbook/events/{sport}": "All events grouped by matchup",
            "GET /sportsbook/live/{sport}": "Live in-game odds",
            "GET /sportsbook/best-bets/{sport}": "Top value bet opportunities",
            "POST /sportsbook/odds-ai/{sport}": "Auto-fetch odds + AI analysis",
            "POST /sportsbook/compare-ai/{sport}": "Auto-fetch comparison + AI insights",
            "POST /sportsbook/live-ai/{sport}": "Auto-fetch live odds + AI breakdown",
            "POST /sportsbook/best-bets-ai/{sport}": "Auto-find best bets + AI content"
        }
    }

# ── Core Endpoints ────────────────────────────────────────────────────────────

@app.post("/analyze", response_model=APIResponse)
async def analyze_sports_data(
    request: AnalyzeRequest,
    authorized: bool = Depends(get_api_key)
):
    """
    Analyze sports data and return AI-powered insights.
    
    - **data**: Any sports data (JSON, text, stats, scores)
    - **context**: Optional context like "NBA Playoffs Game 5" 
    - **output_format**: summary | bullets | post | report
    """
    try:
        result = analytics_service.analyze(
            data=request.data,
            context=request.context,
            output_format=request.output_format
        )
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error", "Analysis failed"))
        
        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/analyze error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/summarize", response_model=APIResponse)
async def summarize_sports_data(
    request: SummarizeRequest,
    authorized: bool = Depends(get_api_key)
):
    """
    Generate a ready-to-post summary from sports data.
    
    - **data**: Sports data to summarize
    - **platform**: twitter | instagram | discord | general
    - **tone**: informative | hype | analytical | casual
    - **max_length**: Optional character limit
    """
    try:
        result = analytics_service.summarize(
            data=request.data,
            platform=request.platform,
            tone=request.tone,
            max_length=request.max_length
        )
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error", "Summarization failed"))
        
        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/summarize error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/odds", response_model=APIResponse)
async def analyze_odds(
    request: OddsRequest,
    authorized: bool = Depends(get_api_key)
):
    """
    Analyze sportsbook odds data.
    
    - **odds_data**: Sportsbook odds (any format)
    - **sport**: nba | nfl | mlb | nhl | soccer | etc.
    - **analysis_type**: value | prediction | comparison | movement
    """
    try:
        result = analytics_service.analyze_odds(
            odds_data=request.odds_data,
            sport=request.sport,
            analysis_type=request.analysis_type
        )
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error", "Odds analysis failed"))
        
        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/odds error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ask", response_model=APIResponse)
async def ask_sports_question(
    request: AskRequest,
    authorized: bool = Depends(get_api_key)
):
    """
    Ask any sports question with optional data context.
    
    - **question**: Your sports question
    - **context**: Optional data to reference in the answer
    - **sport**: Optional sport context
    """
    try:
        result = analytics_service.ask(
            question=request.question,
            context=request.context,
            sport=request.sport
        )
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error", "Question answering failed"))
        
        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/ask error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/espn", response_model=APIResponse)
async def process_espn_data(
    request: ESPNRequest,
    authorized: bool = Depends(get_api_key)
):
    """
    Process ESPN data into publishable sports content.
    
    - **espn_data**: Raw ESPN API data
    - **report_type**: recap | preview | standings | stats
    - **platform**: Where the content will be posted
    """
    try:
        result = analytics_service.process_espn(
            espn_data=request.espn_data,
            report_type=request.report_type,
            platform=request.platform
        )
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error", "ESPN processing failed"))
        
        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/espn error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/batch")
async def batch_process(
    items: list,
    analysis_type: str = "summarize",
    platform: str = "general",
    authorized: bool = Depends(get_api_key)
):
    """
    Process multiple sports data items in one request.
    
    - **items**: List of data items to process
    - **analysis_type**: summarize | analyze | odds
    - **platform**: Platform for output formatting
    """
    try:
        if len(items) > 20:
            raise HTTPException(status_code=400, detail="Maximum 20 items per batch request")
        
        results = analytics_service.batch_analyze(
            items=items,
            analysis_type=analysis_type,
            platform=platform
        )
        return {
            "success": True,
            "total": len(results),
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/batch error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ── ESPN Data Endpoints ───────────────────────────────────────────────────────

@app.get("/espn/scoreboard/{league}")
async def espn_scoreboard(
    league: str,
    date: Optional[str] = None,
    authorized: bool = Depends(get_api_key)
):
    """
    Get live ESPN scoreboard for any league.

    - **league**: nba | nfl | mlb | nhl | ncaab | ncaaf | epl | mls | wnba | etc.
    - **date**: Optional date in YYYY-MM-DD format (default: today)
    """
    try:
        return espn_service.get_scoreboard(league, date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/scoreboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/espn/news/{league}")
async def espn_news(
    league: str,
    limit: int = 10,
    authorized: bool = Depends(get_api_key)
):
    """
    Get latest ESPN news for a league.

    - **league**: nba | nfl | mlb | nhl | ncaab | ncaaf | epl | mls | etc.
    - **limit**: Number of articles to return (default: 10)
    """
    try:
        return espn_service.get_news(league, limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/news error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/espn/standings/{league}")
async def espn_standings(
    league: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Get current standings for a league.

    - **league**: nba | nfl | mlb | nhl | ncaab | ncaaf | etc.
    """
    try:
        return espn_service.get_standings(league)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/standings error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/espn/teams/{league}")
async def espn_teams(
    league: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Get all teams in a league.

    - **league**: nba | nfl | mlb | nhl | etc.
    """
    try:
        return espn_service.get_teams(league)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/teams error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/espn/team/{league}/{team}")
async def espn_team(
    league: str,
    team: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Get specific team info.

    - **league**: nba | nfl | mlb | nhl | etc.
    - **team**: Team abbreviation (e.g. 'lal', 'kc', 'bos', 'nyy')
    """
    try:
        return espn_service.get_team(league, team)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/team error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/espn/game/{league}/{game_id}")
async def espn_game_summary(
    league: str,
    game_id: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Get full game summary, box score, and leaders.

    - **league**: nba | nfl | mlb | nhl | etc.
    - **game_id**: ESPN game ID (from scoreboard data)
    """
    try:
        return espn_service.get_game_summary(league, game_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/game error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/espn/today")
async def espn_today(
    leagues: str = "nba,nfl,mlb,nhl",
    authorized: bool = Depends(get_api_key)
):
    """
    Get all games happening today across multiple leagues.

    - **leagues**: Comma-separated list (default: nba,nfl,mlb,nhl)
    """
    try:
        league_list = [l.strip() for l in leagues.split(",")]
        return espn_service.get_todays_games(league_list)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/today error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/espn/athlete/{league}/{athlete_id}")
async def espn_athlete(
    league: str,
    athlete_id: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Get player stats by ESPN athlete ID.

    - **league**: nba | nfl | mlb | nhl | etc.
    - **athlete_id**: ESPN athlete ID
    """
    try:
        return espn_service.get_athlete_stats(league, athlete_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/athlete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── ESPN + AI Combo Endpoints ─────────────────────────────────────────────────

@app.post("/espn/scoreboard-ai/{league}", response_model=APIResponse)
async def espn_scoreboard_ai(
    league: str,
    date: Optional[str] = None,
    platform: str = "general",
    tone: str = "informative",
    authorized: bool = Depends(get_api_key)
):
    """
    Fetch live ESPN scoreboard AND run AI analysis on it automatically.
    Returns a ready-to-post summary of today's games.

    - **league**: nba | nfl | mlb | nhl | ncaab | etc.
    - **date**: Optional YYYY-MM-DD (default: today)
    - **platform**: twitter | instagram | discord | general
    - **tone**: informative | hype | analytical | casual
    """
    try:
        # 1. Fetch live ESPN data
        scoreboard = espn_service.get_scoreboard(league, date)
        if scoreboard.get("total_games", 0) == 0:
            return APIResponse(
                success=True,
                result=f"No {league.upper()} games scheduled for today.",
                model_used="none",
                tokens_used=0
            )

        # 2. Run AI analysis
        result = analytics_service.summarize(
            data=scoreboard,
            platform=platform,
            tone=tone
        )
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error"))

        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"],
            data={"games_analyzed": scoreboard["total_games"], "league": league.upper()}
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/scoreboard-ai error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/espn/news-ai/{league}", response_model=APIResponse)
async def espn_news_ai(
    league: str,
    limit: int = 5,
    platform: str = "general",
    tone: str = "informative",
    authorized: bool = Depends(get_api_key)
):
    """
    Fetch latest ESPN news AND generate an AI-written summary ready to post.

    - **league**: nba | nfl | mlb | nhl | ncaab | etc.
    - **limit**: Number of articles to analyze (default: 5)
    - **platform**: twitter | instagram | discord | general
    - **tone**: informative | hype | analytical | casual
    """
    try:
        # 1. Fetch ESPN news
        news = espn_service.get_news(league, limit)

        # 2. Run AI summarization
        result = analytics_service.summarize(
            data=news,
            platform=platform,
            tone=tone
        )
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error"))

        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"],
            data={"articles_analyzed": news["total"], "league": league.upper()}
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/news-ai error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/espn/game-ai/{league}/{game_id}", response_model=APIResponse)
async def espn_game_ai(
    league: str,
    game_id: str,
    report_type: str = "recap",
    platform: str = "general",
    authorized: bool = Depends(get_api_key)
):
    """
    Fetch full ESPN game data AND generate an AI-written recap/preview.

    - **league**: nba | nfl | mlb | nhl | etc.
    - **game_id**: ESPN game ID
    - **report_type**: recap | preview | stats
    - **platform**: twitter | instagram | discord | general
    """
    try:
        # 1. Fetch ESPN game summary
        game_data = espn_service.get_game_summary(league, game_id)

        # 2. Run AI content generation
        result = analytics_service.process_espn(
            espn_data=game_data,
            report_type=report_type,
            platform=platform
        )
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error"))

        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"],
            data={"game_id": game_id, "league": league.upper(), "report_type": report_type}
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/game-ai error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/espn/today-ai")
async def espn_today_ai(
    leagues: str = "nba,nfl,mlb,nhl",
    platform: str = "general",
    tone: str = "informative",
    authorized: bool = Depends(get_api_key)
):
    """
    Get ALL games today across leagues AND generate a full AI-written daily sports digest.

    - **leagues**: Comma-separated (default: nba,nfl,mlb,nhl)
    - **platform**: twitter | instagram | discord | general
    - **tone**: informative | hype | analytical | casual
    """
    try:
        league_list = [l.strip() for l in leagues.split(",")]

        # 1. Fetch all today's games
        today = espn_service.get_todays_games(league_list)

        if today.get("total_games", 0) == 0:
            return {
                "success": True,
                "result": "No games scheduled today across the selected leagues.",
                "total_games": 0
            }

        # 2. Run AI analysis on full day's slate
        result = analytics_service.analyze(
            data=today,
            context=f"Daily sports digest for {today['date']}",
            output_format="report" if platform == "general" else "post"
        )

        return {
            "success": True,
            "result": result.get("result"),
            "model_used": result.get("model_used"),
            "tokens_used": result.get("tokens_used"),
            "data": {
                "date": today["date"],
                "total_games": today["total_games"],
                "leagues": list(today["leagues"].keys())
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"/espn/today-ai error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Sportsbook Data Endpoints ──────────────────────────────────────────────────

@app.get("/sportsbook/sports")
async def sportsbook_sports(authorized: bool = Depends(get_api_key)):
    """List all 24 supported sports with available sportsbooks."""
    result = await sportsbook_service.get_sports()
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.get("/sportsbook/books")
async def sportsbook_books(authorized: bool = Depends(get_api_key)):
    """List all 34 supported sportsbooks."""
    result = await sportsbook_service.get_sportsbooks()
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.get("/sportsbook/odds/{sport}")
async def sportsbook_odds(
    sport: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Get raw aggregated odds for a sport across all sportsbooks.

    - **sport**: nba | nfl | mlb | nhl | ncaaf | ncaab | soccer | mma | boxing | tennis | golf | etc.
    """
    result = await sportsbook_service.get_odds(sport)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.get("/sportsbook/odds/{sport}/{book}")
async def sportsbook_odds_by_book(
    sport: str,
    book: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Get odds for a sport from one specific sportsbook.

    - **sport**: nba | nfl | mlb | nhl | etc.
    - **book**: Sportsbook name (e.g. Bovada, FanDuel, DraftKings, BetMGM)
    """
    result = await sportsbook_service.get_odds(sport, book)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.get("/sportsbook/compare/{sport}")
async def sportsbook_compare(
    sport: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Compare odds across all sportsbooks for a sport.
    Returns best prices, line shopping data, and full odds breakdown per event.

    - **sport**: nba | nfl | mlb | nhl | soccer | etc.
    """
    result = await sportsbook_service.get_compare(sport)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.get("/sportsbook/events/{sport}")
async def sportsbook_events(
    sport: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Get all events for a sport, grouped by matchup with multi-book odds view.

    - **sport**: nba | nfl | mlb | nhl | soccer | etc.
    """
    result = await sportsbook_service.get_events(sport)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.get("/sportsbook/live/{sport}")
async def sportsbook_live(
    sport: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Get live/in-progress events and odds for a sport.

    - **sport**: nba | nfl | mlb | nhl | soccer | etc.
    """
    result = await sportsbook_service.get_live(sport)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.get("/sportsbook/best-bets/{sport}")
async def sportsbook_best_bets(
    sport: str,
    authorized: bool = Depends(get_api_key)
):
    """
    Find top value bet opportunities by comparing lines across all sportsbooks.
    Returns events with biggest line discrepancies (most line shopping value).

    - **sport**: nba | nfl | mlb | nhl | soccer | etc.
    """
    result = await sportsbook_service.get_best_bets(sport)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


# ── Sportsbook + AI Combo Endpoints ─────────────────────────────────────────────

@app.post("/sportsbook/odds-ai/{sport}", response_model=APIResponse)
async def sportsbook_odds_ai(
    sport: str,
    request: SportsbookOddsAIRequest = SportsbookOddsAIRequest(sport="nba"),
    authorized: bool = Depends(get_api_key)
):
    """
    Auto-fetch live odds from all sportsbooks + run AI analysis in one call.

    - **sport**: nba | nfl | mlb | nhl | soccer | etc.
    - **sportsbook**: Optional - filter to one sportsbook
    - **analysis_type**: value | best_lines | comparison | live | picks
    - **platform**: twitter | instagram | discord | general
    """
    try:
        from services.prompts import get_sportsbook_odds_prompt
        raw_odds = await sportsbook_service.get_odds(sport, request.sportsbook)
        if "error" in raw_odds:
            raise HTTPException(status_code=502, detail=raw_odds["error"])

        parsed = sportsbook_service._parse_odds_for_ai(raw_odds)
        prompt = get_sportsbook_odds_prompt(parsed, sport, request.analysis_type)
        result = analytics_service.ask(question=prompt, sport=sport)

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error"))

        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"],
            data={
                "sport": sport,
                "analysis_type": request.analysis_type,
                "total_events": parsed["total_events"],
                "sportsbooks_queried": parsed["sportsbooks_queried"],
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/sportsbook/odds-ai error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sportsbook/compare-ai/{sport}", response_model=APIResponse)
async def sportsbook_compare_ai(
    sport: str,
    request: SportsbookCompareAIRequest = SportsbookCompareAIRequest(sport="nba"),
    authorized: bool = Depends(get_api_key)
):
    """
    Auto-fetch odds comparison across all sportsbooks + AI line-shopping analysis.

    - **sport**: nba | nfl | mlb | nhl | soccer | etc.
    - **platform**: twitter | instagram | discord | general
    """
    try:
        from services.prompts import get_sportsbook_compare_prompt
        compare_data = await sportsbook_service.get_compare(sport)
        if "error" in compare_data:
            raise HTTPException(status_code=502, detail=compare_data["error"])

        parsed = sportsbook_service._parse_compare_for_ai(compare_data)
        prompt = get_sportsbook_compare_prompt(parsed, sport, request.platform)
        result = analytics_service.ask(question=prompt, sport=sport)

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error"))

        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"],
            data={
                "sport": sport,
                "total_events": parsed["total_events"],
                "multi_book_events": parsed["multi_book_events"],
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/sportsbook/compare-ai error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sportsbook/live-ai/{sport}", response_model=APIResponse)
async def sportsbook_live_ai(
    sport: str,
    request: SportsbookLiveAIRequest = SportsbookLiveAIRequest(sport="nba"),
    authorized: bool = Depends(get_api_key)
):
    """
    Auto-fetch live in-game odds + AI real-time betting breakdown.

    - **sport**: nba | nfl | mlb | nhl | soccer | etc.
    """
    try:
        from services.prompts import get_sportsbook_live_prompt
        live_data = await sportsbook_service.get_live(sport)
        if "error" in live_data:
            raise HTTPException(status_code=502, detail=live_data["error"])

        live_count = live_data.get("live_count", 0)
        if live_count == 0:
            return APIResponse(
                success=True,
                result=f"No live {sport.upper()} games at the moment. Check back when games are in progress.",
                model_used="none",
                tokens_used=0,
                data={"sport": sport, "live_count": 0}
            )

        parsed = sportsbook_service._parse_live_for_ai(live_data)
        prompt = get_sportsbook_live_prompt(parsed, sport)
        result = analytics_service.ask(question=prompt, sport=sport)

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error"))

        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"],
            data={"sport": sport, "live_count": live_count}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/sportsbook/live-ai error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sportsbook/best-bets-ai/{sport}", response_model=APIResponse)
async def sportsbook_best_bets_ai(
    sport: str,
    request: SportsbookBestBetsRequest = SportsbookBestBetsRequest(sport="nba"),
    authorized: bool = Depends(get_api_key)
):
    """
    Auto-find best value bets across 34 sportsbooks + AI content generation.
    Returns ready-to-post best bets content for your platform.

    - **sport**: nba | nfl | mlb | nhl | soccer | etc.
    - **platform**: twitter | instagram | discord | general
    """
    try:
        from services.prompts import get_sportsbook_best_bets_prompt
        best_bets = await sportsbook_service.get_best_bets(sport)
        if "error" in best_bets:
            raise HTTPException(status_code=502, detail=best_bets["error"])

        if best_bets.get("total_opportunities", 0) == 0:
            return APIResponse(
                success=True,
                result=f"No significant line discrepancies found for {sport.upper()} right now. Markets appear sharp.",
                model_used="none",
                tokens_used=0,
                data={"sport": sport, "opportunities": 0}
            )

        prompt = get_sportsbook_best_bets_prompt(best_bets, sport, request.platform)
        result = analytics_service.ask(question=prompt, sport=sport)

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error"))

        return APIResponse(
            success=True,
            result=result["result"],
            model_used=result["model_used"],
            tokens_used=result["tokens_used"],
            data={
                "sport": sport,
                "platform": request.platform,
                "total_opportunities": best_bets["total_opportunities"],
                "top_bets_count": len(best_bets.get("top_bets", [])),
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/sportsbook/best-bets-ai error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ── Error Handlers ────────────────────────────────────────────────────────────
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={"success": False, "error": "Endpoint not found", "docs": "/docs"}
    )

@app.exception_handler(500)
async def server_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Internal server error"}
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)