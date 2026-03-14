"""
GLM Sports Analytics SDK - Response Models
Clean dataclasses for all API responses
"""
from dataclasses import dataclass, field
from typing import Optional, List, Any, Dict


@dataclass
class BaseResult:
    """Base result with common fields"""
    success: bool
    result: Optional[str]
    model_used: Optional[str] = None
    tokens_used: Optional[int] = None
    error: Optional[str] = None

    def __str__(self):
        if self.success:
            return self.result or ""
        return f"Error: {self.error}"

    def __repr__(self):
        if self.success:
            return f"<{self.__class__.__name__} model={self.model_used} tokens={self.tokens_used}>"
        return f"<{self.__class__.__name__} error={self.error}>"


@dataclass
class AnalysisResult(BaseResult):
    """Result from /analyze endpoint"""
    context: Optional[str] = None
    output_format: Optional[str] = None


@dataclass
class SummaryResult(BaseResult):
    """Result from /summarize endpoint"""
    platform: Optional[str] = None
    tone: Optional[str] = None
    character_count: Optional[int] = field(default=None)

    def __post_init__(self):
        if self.result:
            self.character_count = len(self.result)


@dataclass
class OddsResult(BaseResult):
    """Result from /odds endpoint"""
    sport: Optional[str] = None
    analysis_type: Optional[str] = None


@dataclass
class AskResult(BaseResult):
    """Result from /ask endpoint"""
    question: Optional[str] = None
    sport: Optional[str] = None


@dataclass
class ESPNResult(BaseResult):
    """Result from /espn endpoint"""
    report_type: Optional[str] = None
    platform: Optional[str] = None


@dataclass
class BatchItem:
    """Single item in a batch result"""
    index: int
    input: Any
    output: BaseResult

    def __str__(self):
        return f"[{self.index}] {self.output}"


@dataclass
class BatchResult:
    """Result from /batch endpoint"""
    success: bool
    total: int
    results: List[BatchItem] = field(default_factory=list)
    error: Optional[str] = None

    def __iter__(self):
        return iter(self.results)

    def __len__(self):
        return self.total

    def __getitem__(self, index):
        return self.results[index]

    def get_texts(self) -> List[str]:
        """Return just the result text from all batch items"""
        return [
            item["output"].get("result", "") if isinstance(item, dict)
            else str(item.output)
            for item in self.results
        ]

    def __repr__(self):
        return f"<BatchResult total={self.total} success={self.success}>"