"""
GLM Sports Analytics SDK
Python client for the GLM Sports Analytics API
"""

from .client import GLMSportsClient
from .exceptions import GLMSportsError, GLMAuthError, GLMRateLimitError, GLMAPIError
from .models import (
    AnalysisResult,
    SummaryResult,
    OddsResult,
    AskResult,
    ESPNResult,
    BatchResult,
)

__version__ = "1.0.0"
__all__ = [
    "GLMSportsClient",
    "GLMSportsError",
    "GLMAuthError",
    "GLMRateLimitError",
    "GLMAPIError",
    "AnalysisResult",
    "SummaryResult",
    "OddsResult",
    "AskResult",
    "ESPNResult",
    "BatchResult",
]