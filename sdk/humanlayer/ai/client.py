"""HTTP client for HumanLayer backend API."""
import queue
import threading
import time
import logging
import httpx
from typing import Optional

from humanlayer.ai.config import HumanLayerConfig
from humanlayer.ai.exceptions import APIError, ConfigurationError

logger = logging.getLogger("humanlayer.client")


class HumanLayerClient:
    """Unified client handling event batching and API communication."""

    def __init__(self, config: HumanLayerConfig):
        self._config = config
        self._queue: queue.Queue = queue.Queue(maxsize=config.max_queue_size)
        self._running = True
        self._http = httpx.Client(
            base_url=config.api_base_url,
            headers={"X-API-Key": config.api_key or ""},
            timeout=10.0,
        )
        # Background flush thread
        self._flush_thread = threading.Thread(
            target=self._flush_loop, daemon=True, name="humanlayer-flush"
        )
        self._flush_thread.start()

    def verify_api_key(self) -> None:
        """Validate API key with backend. Raises ConfigurationError on failure."""
        try:
            resp = self._http.get("/api/ingest/verify")
            if resp.status_code == 401:
                raise ConfigurationError("Invalid or revoked HumanLayer API key.")
            if resp.status_code == 403:
                raise ConfigurationError("API key unauthorized.")
            if not resp.is_success:
                raise ConfigurationError(f"API key validation failed: {resp.status_code}")
        except httpx.ConnectError:
            raise ConfigurationError(
                f"Cannot connect to HumanLayer backend at {self._config.api_base_url}"
            )

    def enqueue_event(self, event: dict) -> None:
        """Non-blocking event enqueue."""
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            if self._config.debug:
                logger.warning("Event queue full, dropping event")

    def send_session(self, session_data: dict) -> None:
        """Synchronously send session upsert."""
        try:
            resp = self._http.post("/api/ingest/sessions", json=session_data)
            if not resp.is_success and self._config.debug:
                logger.warning(f"Session send failed: {resp.status_code} {resp.text}")
        except Exception as e:
            if self._config.debug:
                logger.warning(f"Session send error: {e}")

    def create_hitl_event(
        self, tool_name: str, tool_input: dict, context: dict = None, session_id: str = None
    ) -> str:
        """Create a HITL approval request. Returns event_id."""
        payload = {
            "tool_name": tool_name,
            "tool_input": tool_input,
            "context": context or {},
            "project_id": self._config.project_id,
            "session_id": session_id,
        }
        resp = self._http.post("/api/hitl/request", json=payload)
        if not resp.is_success:
            raise APIError(f"HITL request failed: {resp.status_code} {resp.text}")
        return resp.json()["event_id"]

    def get_hitl_decision(self, event_id: str) -> dict:
        """Poll for HITL decision. Returns dict with 'status' key."""
        resp = self._http.get(f"/api/hitl/events/{event_id}/decision")
        if not resp.is_success:
            raise APIError(f"HITL poll failed: {resp.status_code}")
        return resp.json()

    def flush(self) -> None:
        """Force immediate flush of queued events."""
        self._do_flush()

    def shutdown(self) -> None:
        """Flush remaining events and stop background thread."""
        self._running = False
        self._do_flush()
        self._http.close()

    # --- Internal ---

    def _flush_loop(self) -> None:
        while self._running:
            time.sleep(self._config.flush_interval)
            self._do_flush()

    def _do_flush(self) -> None:
        if self._queue.empty():
            return
        events = []
        while not self._queue.empty():
            try:
                events.append(self._queue.get_nowait())
            except queue.Empty:
                break
        if not events:
            return
        try:
            payload = {
                "events": events,
                "project_id": self._config.project_id,
                "environment": self._config.environment,
            }
            resp = self._http.post("/api/ingest/events", json=payload)
            if self._config.debug:
                logger.debug(f"Flushed {len(events)} events → {resp.status_code}")
        except Exception as e:
            if self._config.debug:
                logger.warning(f"Flush error: {e}")
