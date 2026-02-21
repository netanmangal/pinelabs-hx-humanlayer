"""Human-in-the-Loop: request_approval() and wrap_tools()."""
import time
import logging
from typing import List, Optional

from .exceptions import HITLRejectedError, HITLTimeoutError

logger = logging.getLogger("humanlayer.hitl")

_client = None  # Set by init()


def _set_client(client) -> None:
    global _client
    _client = client


def request_approval(
    tool_name: str,
    tool_input,
    context: dict = None,
    timeout: int = 300,
) -> bool:
    """
    Block until a human approves or rejects the given tool call.

    Args:
        tool_name: Name of the tool being intercepted.
        tool_input: Input arguments for the tool.
        context: Optional extra context for the reviewer.
        timeout: Max seconds to wait (default 300 = 5 min).

    Returns:
        True if approved.

    Raises:
        HITLRejectedError: If the human rejects the action.
        HITLTimeoutError: If timeout expires with no decision.
    """
    if _client is None:
        logger.warning("HumanLayer not initialized — skipping HITL, allowing execution")
        return True

    # Serialize input
    if hasattr(tool_input, "dict"):
        tool_input = tool_input.dict()
    elif not isinstance(tool_input, dict):
        tool_input = {"input": str(tool_input)}

    print(f"\n[HumanLayer] Requesting approval for: {tool_name}")
    print(f"[HumanLayer] Input: {tool_input}")
    print(f"[HumanLayer] Waiting for human decision (timeout: {timeout}s)...\n")

    try:
        event_id = _client.create_hitl_event(tool_name, tool_input, context)
    except Exception as e:
        logger.warning(f"HITL request failed ({e}) — allowing execution by default")
        return True

    start = time.time()
    while time.time() - start < timeout:
        try:
            decision = _client.get_hitl_decision(event_id)
            status = decision.get("status", "pending")

            if status == "approved":
                print(f"[HumanLayer] APPROVED: {tool_name}")
                return True

            if status == "rejected":
                comment = decision.get("decision_comment", "")
                print(f"[HumanLayer] REJECTED: {tool_name} — {comment}")
                raise HITLRejectedError(tool_name, comment)

        except HITLRejectedError:
            raise
        except Exception as e:
            if "poll failed" not in str(e).lower():
                logger.debug(f"Poll error: {e}")

        time.sleep(1.5)

    raise HITLTimeoutError(event_id, timeout)


def wrap_tools(tools: list, approval_required: List[str] = None) -> list:
    """
    Wrap LangChain tools to require human approval before execution.

    Args:
        tools: List of LangChain tools.
        approval_required: Tool names that need HITL. If None, wraps all.

    Returns:
        New list with wrapped tools.

    Example:
        tools = humanlayer.wrap_tools(tools, approval_required=["calendar_create_booking"])
    """
    if not approval_required:
        return tools

    approval_set = set(approval_required)
    wrapped = []
    for tool in tools:
        if tool.name in approval_set:
            wrapped.append(_wrap_one(tool))
            logger.debug(f"Wrapped tool with HITL: {tool.name}")
        else:
            wrapped.append(tool)
    return wrapped


def _wrap_one(tool):
    """Wrap a tool's underlying func with HITL approval.

    Wraps `tool.func` (not `tool._run`) so LangChain's internal `config`
    and `run_manager` kwargs never leak into the HITL payload.
    """
    original_func = tool.func  # The raw Python function — no config/run_manager

    def hitl_func(*args, **kwargs):
        # Build clean input dict from only the actual tool parameters
        tool_input = dict(kwargs) if kwargs else {}
        if args and not kwargs:
            tool_input = {"input": str(args[0]) if len(args) == 1 else [str(a) for a in args]}

        try:
            request_approval(tool.name, tool_input)
        except HITLRejectedError as e:
            return f"Action '{tool.name}' was rejected by human reviewer: {e.comment}"
        except HITLTimeoutError:
            return f"Action '{tool.name}' timed out waiting for human approval."

        return original_func(*args, **kwargs)

    tool.func = hitl_func
    return tool
