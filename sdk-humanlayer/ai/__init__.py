"""HumanLayer AI subpackage — main SDK entry point.

Usage:
    import humanlayer.ai
    humanlayer.ai.init(api_key="adr_...", project_id="my-agent")
    tools = humanlayer.ai.wrap_tools(tools, approval_required=["book_meeting"])

Or:
    from humanlayer import ai
    ai.init(...)
"""

from __future__ import annotations

import atexit
import logging
from typing import Optional, List

from humanlayer.ai.config import HumanLayerConfig, DEFAULT_API_BASE_URL
from humanlayer.ai.client import HumanLayerClient
from humanlayer.ai.callback_handler import HumanLayerCallbackHandler
from humanlayer.ai.session import Session, get_current_session, set_current_session
from humanlayer.ai.exceptions import (
    HumanLayerError, APIError, ConfigurationError,
    NotInitializedError, SessionError, HITLRejectedError, HITLTimeoutError,
)
from humanlayer.ai.hitl import wrap_tools, request_approval, _set_client as _set_hitl_client

__version__ = "0.2.1"
__all__ = [
    "init", "shutdown", "flush", "wrap_tools", "request_approval",
    "get_callback_handler", "is_initialized",
    "HumanLayerCallbackHandler", "HumanLayerConfig", "Session",
    "HumanLayerError", "APIError", "ConfigurationError",
    "NotInitializedError", "SessionError", "HITLRejectedError", "HITLTimeoutError",
    "__version__",
]

logger = logging.getLogger("humanlayer.ai")

_client: Optional[HumanLayerClient] = None
_config: Optional[HumanLayerConfig] = None
_callback_handler: Optional[HumanLayerCallbackHandler] = None
_default_session: Optional[Session] = None
_initialized = False


def init(
    api_key: str,
    project_id: str,
    *,
    api_base_url: str = DEFAULT_API_BASE_URL,
    debug: bool = False,
    auto_instrument: bool = True,
    session_name: str = None,
) -> None:
    """
    Initialize HumanLayer SDK.

    Required args:
        api_key:    Your HumanLayer API key (adr_...). Get one from the dashboard.
        project_id: Project identifier string (e.g. "my-agent").

    Optional args:
        api_base_url:    Backend URL. Default: https://hitl-agent-v1.preview.emergentagent.com
                         Override with HUMANLAYER_API_BASE_URL env var (e.g. http://localhost:8001
                         when running locally — Kubernetes blocks ingress calls from the same pod).
        debug:           Enable debug logging. Default: False.
        auto_instrument: Auto-patch LangChain Runnable.invoke. Default: True.
        session_name:    Custom session name. Default: auto-generated from project_id.

    Example:
        import humanlayer.ai as humanlayer

        humanlayer.init(
            api_key="adr_...",
            project_id="my-agent",
        )
        tools = humanlayer.wrap_tools(tools, approval_required=["book_meeting"])
    """
    global _client, _config, _callback_handler, _default_session, _initialized

    if debug:
        logging.basicConfig(level=logging.DEBUG)
        logger.setLevel(logging.DEBUG)

    _config = HumanLayerConfig.from_env(
        api_key=api_key,
        project_id=project_id,
        api_base_url=api_base_url,
        debug=debug,
    )

    if not _config.enabled:
        logger.info("HumanLayer disabled via HUMANLAYER_ENABLED=false")
        return

    _client = HumanLayerClient(_config)

    if _config.use_api:
        try:
            _client.verify_api_key()
            if debug:
                logger.info(f"API key verified — project: {_config.project_id}")
        except ConfigurationError as e:
            logger.warning(f"HumanLayer API validation failed: {e}. Events will be dropped.")

    _set_hitl_client(_client)
    _callback_handler = HumanLayerCallbackHandler()

    name = session_name or f"session-{_config.project_id or 'default'}"
    _default_session = Session(name=name)
    _default_session.bind_client(_client)
    _default_session.start()
    set_current_session(_default_session)

    if auto_instrument:
        _patch_langchain()

    atexit.register(shutdown)
    _initialized = True

    logger.info(
        f"HumanLayer {__version__} initialized | project={_config.project_id} | "
        f"backend={_config.api_base_url}"
    )


def flush() -> None:
    """Force flush all queued events to the backend."""
    if _client:
        _client.flush()


def shutdown() -> None:
    """Flush events, end session, and clean up."""
    global _initialized
    if not _initialized:
        return
    if _default_session:
        _default_session.end("completed")
    if _client:
        _client.flush()
        _client.shutdown()
    _initialized = False


def get_callback_handler() -> Optional[HumanLayerCallbackHandler]:
    """Return the global callback handler for manual attachment."""
    return _callback_handler


def is_initialized() -> bool:
    return _initialized


def _get_handler() -> Optional[HumanLayerCallbackHandler]:
    return _callback_handler


def _patch_langchain() -> None:
    """Patch Runnable.invoke to inject HumanLayer callbacks automatically."""
    try:
        from langchain_core.runnables.base import Runnable
        from langchain_core.runnables.config import ensure_config

        if getattr(Runnable, "_humanlayer_patched", False):
            return

        _orig_invoke = Runnable.invoke
        _orig_ainvoke = Runnable.ainvoke

        def _inject(config):
            handler = _get_handler()
            if handler is None:
                return ensure_config(config)
            config = ensure_config(config)
            callbacks = config.get("callbacks") or []
            if hasattr(callbacks, "handlers"):
                callbacks = list(callbacks.handlers)
            elif not isinstance(callbacks, list):
                callbacks = [callbacks] if callbacks else []
            else:
                callbacks = list(callbacks)
            if "HumanLayerCallbackHandler" not in [type(h).__name__ for h in callbacks]:
                callbacks.insert(0, handler)
            config["callbacks"] = callbacks
            return config

        def patched_invoke(self, input, config=None, **kwargs):
            return _orig_invoke(self, input, _inject(config), **kwargs)

        async def patched_ainvoke(self, input, config=None, **kwargs):
            return await _orig_ainvoke(self, input, _inject(config), **kwargs)

        Runnable.invoke = patched_invoke
        Runnable.ainvoke = patched_ainvoke
        Runnable._humanlayer_patched = True
        logger.debug("LangChain Runnable patched for auto-instrumentation")
    except ImportError:
        logger.debug("langchain-core not available; skipping auto-instrumentation")
    except Exception as e:
        logger.warning(f"Auto-instrumentation failed: {e}")
