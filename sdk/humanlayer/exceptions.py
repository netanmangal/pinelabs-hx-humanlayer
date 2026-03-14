"""Custom exceptions for HumanLayer SDK."""


class HumanLayerError(Exception):
    """Base exception for all HumanLayer errors."""
    pass


class ConfigurationError(HumanLayerError):
    """Raised when SDK is misconfigured (invalid key, missing config, etc.)."""
    pass


class APIError(HumanLayerError):
    """Raised when the HumanLayer backend returns an error."""
    def __init__(self, message: str, status_code: int = None):
        super().__init__(message)
        self.status_code = status_code


class NotInitializedError(HumanLayerError):
    """Raised when SDK is used before calling init()."""
    pass


class SessionError(HumanLayerError):
    """Raised on session lifecycle errors."""
    pass


class HITLRejectedError(HumanLayerError):
    """Raised when a human reviewer rejects a tool call."""
    def __init__(self, tool_name: str, comment: str = ""):
        self.tool_name = tool_name
        self.comment = comment
        super().__init__(
            f"Tool '{tool_name}' was rejected by human reviewer"
            + (f": {comment}" if comment else "")
        )


class HITLTimeoutError(HumanLayerError):
    """Raised when HITL approval polling times out."""
    def __init__(self, event_id: str, timeout: int):
        self.event_id = event_id
        self.timeout = timeout
        super().__init__(f"HITL approval timed out after {timeout}s (event: {event_id})")
