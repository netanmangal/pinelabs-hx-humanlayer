"""Session management for HumanLayer SDK."""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

logger = logging.getLogger("humanlayer.session")

_current_session: Optional["Session"] = None


def get_current_session() -> Optional["Session"]:
    return _current_session


def set_current_session(session: Optional["Session"]) -> None:
    global _current_session
    _current_session = session


class Session:
    def __init__(self, name: str = "default", metadata: dict = None):
        self.session_id = str(uuid.uuid4())
        self.name = name
        self.metadata = metadata or {}
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.status = "inactive"
        self.events: List[dict] = []
        self._client = None

        # Stats
        self.total_tokens = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.llm_calls = 0
        self.tool_calls = 0
        self.errors = 0

    def bind_client(self, client) -> None:
        self._client = client

    def start(self) -> "Session":
        self.start_time = datetime.now(timezone.utc)
        self.status = "active"
        if self._client:
            self._client.send_session(self._to_dict())
        return self

    def end(self, status: str = "completed") -> None:
        self.end_time = datetime.now(timezone.utc)
        self.status = status
        if self._client:
            self._client.send_session(self._to_dict())

    def log_event(self, event: dict) -> None:
        """Called by callback handler to record an event."""
        event["session_id"] = self.session_id
        self.events.append(event)

        # Update token stats
        data = event.get("data", {})
        usage = data.get("metadata", {}).get("token_usage", {})
        if usage:
            self.total_tokens += usage.get("total_tokens", 0)
            self.prompt_tokens += usage.get("prompt_tokens", 0)
            self.completion_tokens += usage.get("completion_tokens", 0)

        etype = event.get("event_type", "")
        if "llm" in etype:
            self.llm_calls += 1
        elif "tool" in etype:
            self.tool_calls += 1
        elif "error" in etype:
            self.errors += 1

        # Enqueue to client
        if self._client:
            self._client.enqueue_event(event)

    def _to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "name": self.name,
            "status": self.status,
            "event_count": len(self.events),
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "metadata": self.metadata,
            "statistics": {
                "total_tokens": self.total_tokens,
                "prompt_tokens": self.prompt_tokens,
                "completion_tokens": self.completion_tokens,
                "llm_calls": self.llm_calls,
                "tool_calls": self.tool_calls,
                "errors": self.errors,
            },
        }

    def __enter__(self):
        return self

    def __exit__(self, exc_type, *_):
        self.end(status="failed" if exc_type else "completed")
