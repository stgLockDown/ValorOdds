"""
GLM Sports Analytics API
Powered by Groq + Llama 3.3 70B
Deploy on Railway - connects your platform to AI-powered sports analytics
"""

import os
import logging
from contextlib import asynccontextmanager
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
    APIResponse
)
from services.analytics import SportsAnalyticsService

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    global analytics_service
    logger.info("Starting GLM Sports Analytics API...")
    analytics_service = SportsAnalyticsService()
    logger.info("✅ Analytics service ready")
    yield
    logger.info("Shutting down GLM Sports Analytics API...")

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
            "GET /health": "Service health check"
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