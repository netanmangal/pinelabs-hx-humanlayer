"""LangChain callback handler for HumanLayer event capture."""
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from langchain_core.callbacks.base import BaseCallbackHandler

from humanlayer.ai.session import get_current_session

logger = logging.getLogger("humanlayer.callback")


class HumanLayerCallbackHandler(BaseCallbackHandler):
    """Captures all LangChain/LangGraph lifecycle events with standardized format."""

    # Always run regardless of other handlers
    raise_error = False

    def __init__(self, session=None):
        super().__init__()
        self._session = session
        self._run_id = str(uuid.uuid4())

    @property
    def session(self):
        return self._session or get_current_session()

    # ── LLM Events ──────────────────────────────────────────────────────────

    def on_chat_model_start(self, serialized, messages, *, run_id, parent_run_id=None, tags=None, metadata=None, **kwargs):
        name = self._extract_name(serialized)
        model = self._extract_model(serialized)
        flat_msgs = []
        for batch in messages:
            for m in batch:
                flat_msgs.append(getattr(m, "content", str(m)))
        self._log("llm_start", "llm", {
            "run_id": str(run_id), "parent_run_id": str(parent_run_id) if parent_run_id else None,
            "name": name, "model": model,
            "messages": flat_msgs[:3],
        })

    def on_llm_start(self, serialized, prompts, *, run_id, parent_run_id=None, **kwargs):
        self._log("llm_start", "llm", {
            "run_id": str(run_id), "parent_run_id": str(parent_run_id) if parent_run_id else None,
            "name": self._extract_name(serialized),
            "model": self._extract_model(serialized),
            "prompts": prompts[:2],
        })

    def on_llm_end(self, response, *, run_id, parent_run_id=None, **kwargs):
        output = None
        usage = {}
        try:
            gen = response.generations
            if gen and gen[0]:
                output = getattr(gen[0][0], "text", None) or str(gen[0][0])
        except Exception:
            pass
        try:
            usage = response.llm_output.get("token_usage", {}) if response.llm_output else {}
        except Exception:
            pass
        self._log("llm_end", "llm", {
            "run_id": str(run_id),
            "output": output,
            "token_usage": usage,
        })

    def on_llm_error(self, error, *, run_id, **kwargs):
        self._log("llm_error", "llm", {"run_id": str(run_id), "error": str(error)})

    # ── Tool Events ──────────────────────────────────────────────────────────

    def on_tool_start(self, serialized, input_str, *, run_id, parent_run_id=None, **kwargs):
        self._log("tool_start", "tool", {
            "run_id": str(run_id), "parent_run_id": str(parent_run_id) if parent_run_id else None,
            "name": self._extract_name(serialized),
            "inputs": input_str,
        })

    def on_tool_end(self, output, *, run_id, **kwargs):
        self._log("tool_end", "tool", {
            "run_id": str(run_id),
            "output": self._serialize(output),
        })

    def on_tool_error(self, error, *, run_id, **kwargs):
        self._log("tool_error", "tool", {"run_id": str(run_id), "error": str(error)})

    # ── Chain Events ─────────────────────────────────────────────────────────

    def on_chain_start(self, serialized, inputs, *, run_id, parent_run_id=None, **kwargs):
        name = self._extract_name(serialized)
        self._log("chain_start", "chain", {
            "run_id": str(run_id), "parent_run_id": str(parent_run_id) if parent_run_id else None,
            "name": name, "inputs": self._serialize(inputs),
        })

    def on_chain_end(self, outputs, *, run_id, **kwargs):
        self._log("chain_end", "chain", {
            "run_id": str(run_id),
            "outputs": self._serialize(outputs),
        })

    def on_chain_error(self, error, *, run_id, **kwargs):
        self._log("chain_error", "chain", {"run_id": str(run_id), "error": str(error)})

    # ── Agent Events ─────────────────────────────────────────────────────────

    def on_agent_action(self, action, *, run_id, **kwargs):
        self._log("agent_action", "agent", {
            "run_id": str(run_id),
            "tool": getattr(action, "tool", "unknown"),
            "tool_input": self._serialize(getattr(action, "tool_input", {})),
            "log": getattr(action, "log", ""),
        })

    def on_agent_finish(self, finish, *, run_id, **kwargs):
        rv = getattr(finish, "return_values", {})
        self._log("agent_finish", "agent", {
            "run_id": str(run_id),
            "output": self._serialize(rv.get("output", rv)),
            "log": getattr(finish, "log", ""),
        })

    # ── Internals ────────────────────────────────────────────────────────────

    def _log(self, event_type: str, component: str, raw_data: dict) -> None:
        session = self.session
        if not session:
            return

        data = self._standardize(raw_data)
        if self._should_filter(data, event_type):
            return

        event = {
            "event_id": str(uuid.uuid4()),
            "run_id": self._run_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "component": component,
            "data": data,
        }
        session.log_event(event)

    def _standardize(self, raw: dict) -> dict:
        out: dict = {}

        for k in ("run_id", "parent_run_id", "name", "model", "tool"):
            if k in raw and raw[k] is not None:
                out[k] = raw[k]

        # Standardise input
        inp = None
        for key in ("inputs", "prompts", "messages", "tool_input"):
            if key in raw:
                inp = raw[key]
                break
        if inp:
            cleaned = self._clean(inp)
            if cleaned:
                out["input"] = cleaned

        # Standardise output
        outp = None
        for key in ("output", "outputs", "response"):
            if key in raw:
                outp = raw[key]
                break
        if outp:
            cleaned = self._clean(outp)
            if cleaned:
                out["output"] = cleaned

        # Metadata bucket
        meta = {}
        if raw.get("log"):
            meta["agent_log"] = raw["log"][:300]
        if raw.get("token_usage"):
            meta["token_usage"] = raw["token_usage"]
        if raw.get("error"):
            meta["error"] = str(raw["error"])[:300]
        if meta:
            out["metadata"] = meta

        return out

    def _should_filter(self, data: dict, event_type: str) -> bool:
        if event_type in ("agent_action", "agent_finish") or "error" in event_type:
            return False
        if event_type in ("tool_start", "tool_end"):
            return False
        if event_type in ("llm_start", "llm_end"):
            return not ("input" in data or "output" in data or "model" in data)
        if event_type in ("chain_start", "chain_end"):
            name = data.get("name", "")
            keep = {"AgentExecutor", "RunnableSequence", "PromptTemplate"}
            return name not in keep and "input" not in data
        return False

    def _clean(self, value) -> Any:
        s = self._serialize(value)
        if not s:
            return None
        if isinstance(s, str) and len(s) > 1000:
            return s[:1000] + "…"
        return s

    def _serialize(self, value, depth=0) -> Any:
        if depth > 3 or value is None:
            return None
        if isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, dict):
            return {k: self._serialize(v, depth + 1) for k, v in list(value.items())[:20]}
        if isinstance(value, (list, tuple)):
            return [self._serialize(v, depth + 1) for v in list(value)[:10]]
        if hasattr(value, "content"):
            return getattr(value, "content", "")
        if hasattr(value, "dict"):
            try:
                return self._serialize(value.dict(), depth + 1)
            except Exception:
                pass
        return str(value)[:500]

    def _extract_name(self, serialized) -> str:
        if not serialized:
            return "unknown"
        return (
            serialized.get("name")
            or serialized.get("id", ["unknown"])[-1]
            or "unknown"
        )

    def _extract_model(self, serialized) -> Optional[str]:
        if not serialized:
            return None
        kw = serialized.get("kwargs", {})
        return kw.get("model_name") or kw.get("model") or serialized.get("name")
