from pydantic import BaseModel
from typing import Optional, List, Any, Dict


class AnalyzeRequest(BaseModel):
    data: Any  # Raw sports data - can be dict, list, string
    context: Optional[str] = None  # Additional context (e.g., "NBA playoffs", "NFL week 5")
    output_format: Optional[str] = "summary"  # summary, bullets, post, report


class SummarizeRequest(BaseModel):
    data: Any  # Sports data to summarize
    platform: Optional[str] = "general"  # twitter, instagram, discord, general
    tone: Optional[str] = "informative"  # informative, hype, analytical, casual
    max_length: Optional[int] = None  # Max character length for the post


class OddsRequest(BaseModel):
    odds_data: Any  # Sportsbook odds data
    sport: Optional[str] = None  # nba, nfl, mlb, nhl, soccer, etc.
    analysis_type: Optional[str] = "value"  # value, prediction, comparison, movement


class AskRequest(BaseModel):
    question: str  # The question to ask
    context: Optional[Any] = None  # Optional data context to reference
    sport: Optional[str] = None  # Sport context


class ESPNRequest(BaseModel):
    espn_data: Any  # ESPN API data
    report_type: Optional[str] = "recap"  # recap, preview, standings, stats
    platform: Optional[str] = "general"  # Where the output will be posted


class APIResponse(BaseModel):
    success: bool
    result: Optional[str] = None
    data: Optional[Dict] = None
    error: Optional[str] = None
    model_used: Optional[str] = None
    tokens_used: Optional[int] = None


# ─────────────────────────────────────────
# Sportsbook Models
# ─────────────────────────────────────────

class SportsbookOddsAIRequest(BaseModel):
    sport: str  # nba, nfl, mlb, nhl, soccer, etc.
    sportsbook: Optional[str] = None  # filter to specific sportsbook
    analysis_type: Optional[str] = "value"  # value, best_lines, comparison, live, picks
    platform: Optional[str] = "general"  # twitter, instagram, discord, general


class SportsbookCompareAIRequest(BaseModel):
    sport: str
    platform: Optional[str] = "general"


class SportsbookBestBetsRequest(BaseModel):
    sport: str
    platform: Optional[str] = "general"  # twitter, instagram, discord, general


class SportsbookLiveAIRequest(BaseModel):
    sport: str