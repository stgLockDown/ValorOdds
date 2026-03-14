"""
GLM Sports Analytics SDK - Custom Exceptions
"""


class GLMSportsError(Exception):
    """Base exception for all GLM Sports SDK errors"""
    def __init__(self, message: str, status_code: int = None, response: dict = None):
        self.message = message
        self.status_code = status_code
        self.response = response
        super().__init__(self.message)

    def __str__(self):
        if self.status_code:
            return f"[{self.status_code}] {self.message}"
        return self.message


class GLMAuthError(GLMSportsError):
    """Raised when API key authentication fails"""
    def __init__(self, message: str = "Invalid or missing API key. Check your SERVICE_API_KEY."):
        super().__init__(message, status_code=403)


class GLMRateLimitError(GLMSportsError):
    """Raised when Groq rate limits are hit"""
    def __init__(self, message: str = "Rate limit exceeded. Please wait before retrying."):
        super().__init__(message, status_code=429)


class GLMAPIError(GLMSportsError):
    """Raised when the API returns an unexpected error"""
    def __init__(self, message: str, status_code: int = 500, response: dict = None):
        super().__init__(message, status_code=status_code, response=response)


class GLMConnectionError(GLMSportsError):
    """Raised when the API cannot be reached"""
    def __init__(self, base_url: str):
        super().__init__(
            f"Could not connect to GLM Sports API at {base_url}. "
            "Check your BASE_URL and ensure the service is running."
        )


class GLMTimeoutError(GLMSportsError):
    """Raised when a request times out"""
    def __init__(self, timeout: int):
        super().__init__(
            f"Request timed out after {timeout}s. "
            "Try increasing the timeout or simplifying your request."
        )