"""
Core analytics service - handles all Groq API calls
"""
import os
import json
import logging
from groq import Groq
from services.prompts import (
    get_analyze_prompt,
    get_summarize_prompt,
    get_odds_prompt,
    get_ask_prompt,
    get_espn_prompt
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Best free Groq models for sports analytics
PRIMARY_MODEL = "llama-3.3-70b-versatile"
FAST_MODEL = "llama-3.1-8b-instant"
REASONING_MODEL = "deepseek-r1-distill-llama-70b"


class SportsAnalyticsService:
    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY environment variable not set")
        self.client = Groq(api_key=api_key)
        logger.info("SportsAnalyticsService initialized successfully")

    def _format_data(self, data) -> str:
        """Convert any data type to clean string for prompt"""
        if isinstance(data, (dict, list)):
            return json.dumps(data, indent=2)
        return str(data)

    def _call_groq(self, prompt: str, model: str = None, temperature: float = 0.7, max_tokens: int = 2048) -> dict:
        """Core Groq API call with error handling"""
        model = model or PRIMARY_MODEL
        try:
            logger.info(f"Calling Groq API with model: {model}")
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an elite sports analyst and content creator. Provide expert, data-driven insights for sports analytics, betting markets, and content generation."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            
            result_text = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            logger.info(f"Groq API call successful. Tokens used: {tokens_used}")
            
            return {
                "success": True,
                "result": result_text,
                "model_used": model,
                "tokens_used": tokens_used
            }
            
        except Exception as e:
            logger.error(f"Groq API error: {str(e)}")
            # Try fallback to fast model
            if model != FAST_MODEL:
                logger.info(f"Retrying with fallback model: {FAST_MODEL}")
                try:
                    response = self.client.chat.completions.create(
                        model=FAST_MODEL,
                        messages=[
                            {"role": "system", "content": "You are an elite sports analyst."},
                            {"role": "user", "content": prompt}
                        ],
                        temperature=temperature,
                        max_tokens=max_tokens,
                    )
                    return {
                        "success": True,
                        "result": response.choices[0].message.content,
                        "model_used": FAST_MODEL,
                        "tokens_used": response.usage.total_tokens if response.usage else 0
                    }
                except Exception as fallback_error:
                    logger.error(f"Fallback model also failed: {str(fallback_error)}")
            
            return {
                "success": False,
                "result": None,
                "error": str(e),
                "model_used": model,
                "tokens_used": 0
            }

    def analyze(self, data, context: str = None, output_format: str = "summary") -> dict:
        """Analyze sports data and return insights"""
        formatted_data = self._format_data(data)
        prompt = get_analyze_prompt(formatted_data, context, output_format)
        return self._call_groq(prompt, model=PRIMARY_MODEL, temperature=0.5)

    def summarize(self, data, platform: str = "general", tone: str = "informative", max_length: int = None) -> dict:
        """Generate ready-to-post summaries"""
        formatted_data = self._format_data(data)
        prompt = get_summarize_prompt(formatted_data, platform, tone, max_length)
        return self._call_groq(prompt, model=PRIMARY_MODEL, temperature=0.8)

    def analyze_odds(self, odds_data, sport: str = None, analysis_type: str = "value") -> dict:
        """Analyze sportsbook odds data"""
        formatted_data = self._format_data(odds_data)
        prompt = get_odds_prompt(formatted_data, sport, analysis_type)
        # Use reasoning model for odds analysis - better for math/probability
        return self._call_groq(prompt, model=REASONING_MODEL, temperature=0.3, max_tokens=3000)

    def ask(self, question: str, context=None, sport: str = None) -> dict:
        """Answer sports questions with optional data context"""
        formatted_context = self._format_data(context) if context else None
        prompt = get_ask_prompt(question, formatted_context, sport)
        return self._call_groq(prompt, model=PRIMARY_MODEL, temperature=0.6)

    def process_espn(self, espn_data, report_type: str = "recap", platform: str = "general") -> dict:
        """Process ESPN data into publishable content"""
        formatted_data = self._format_data(espn_data)
        prompt = get_espn_prompt(formatted_data, report_type, platform)
        return self._call_groq(prompt, model=PRIMARY_MODEL, temperature=0.7)

    def batch_analyze(self, items: list, analysis_type: str = "summarize", platform: str = "general") -> list:
        """Process multiple items in batch"""
        results = []
        for i, item in enumerate(items):
            logger.info(f"Processing batch item {i+1}/{len(items)}")
            if analysis_type == "summarize":
                result = self.summarize(item, platform=platform)
            elif analysis_type == "analyze":
                result = self.analyze(item)
            elif analysis_type == "odds":
                result = self.analyze_odds(item)
            else:
                result = self.analyze(item)
            results.append({
                "index": i,
                "input": item,
                "output": result
            })
        return results