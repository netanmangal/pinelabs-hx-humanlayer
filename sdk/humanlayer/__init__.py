"""
HumanLayer SDK namespace package.

New import style (recommended):
    import humanlayer.ai as humanlayer
    humanlayer.init(api_key="adr_...", project_id="my-agent")

Or:
    from humanlayer import ai
    ai.init(api_key="adr_...", project_id="my-agent")

Backward-compatible style (still works):
    import humanlayer
    humanlayer.init(api_key="adr_...", project_id="my-agent")

Only api_key and project_id are required. All other params are optional.
Default backend: https://hitl-agent-v1.preview.emergentagent.com
"""

# Re-export everything from humanlayer.ai for backward compatibility
from humanlayer.ai import (
    init, shutdown, flush, wrap_tools, request_approval,
    get_callback_handler, is_initialized,
    HumanLayerCallbackHandler, HumanLayerConfig, Session,
    HumanLayerError, APIError, ConfigurationError,
    NotInitializedError, SessionError, HITLRejectedError, HITLTimeoutError,
    __version__,
)

# Also expose the `ai` submodule directly
from humanlayer import ai

__all__ = [
    "ai",
    "init", "shutdown", "flush", "wrap_tools", "request_approval",
    "get_callback_handler", "is_initialized",
    "HumanLayerCallbackHandler", "HumanLayerConfig", "Session",
    "HumanLayerError", "APIError", "ConfigurationError",
    "NotInitializedError", "SessionError", "HITLRejectedError", "HITLTimeoutError",
    "__version__",
]
