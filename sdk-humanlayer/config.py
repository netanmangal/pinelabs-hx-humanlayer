"""Configuration management for HumanLayer SDK."""
import os
from dataclasses import dataclass, field
from typing import Optional


DEFAULT_API_BASE_URL = "https://hitl-agent-v1.preview.emergentagent.com"
DEFAULT_FLUSH_INTERVAL = 5.0
DEFAULT_BATCH_SIZE = 50
DEFAULT_MAX_QUEUE_SIZE = 500


@dataclass
class HumanLayerConfig:
    api_key: Optional[str] = None
    project_id: Optional[str] = None
    api_base_url: str = DEFAULT_API_BASE_URL
    environment: str = "development"
    enabled: bool = True
    debug: bool = False
    flush_interval: float = DEFAULT_FLUSH_INTERVAL
    batch_size: int = DEFAULT_BATCH_SIZE
    max_queue_size: int = DEFAULT_MAX_QUEUE_SIZE

    @classmethod
    def from_env(
        cls,
        api_key: str = None,
        project_id: str = None,
        api_base_url: str = None,
        debug: bool = False,
        **kwargs,
    ) -> "HumanLayerConfig":
        return cls(
            api_key=api_key or os.environ.get("HUMANLAYER_API_KEY"),
            project_id=project_id or os.environ.get("HUMANLAYER_PROJECT_ID"),
            api_base_url=api_base_url
            or os.environ.get("HUMANLAYER_API_BASE_URL", DEFAULT_API_BASE_URL),
            environment=os.environ.get("HUMANLAYER_ENVIRONMENT", "development"),
            enabled=os.environ.get("HUMANLAYER_ENABLED", "true").lower() == "true",
            debug=debug or os.environ.get("HUMANLAYER_DEBUG", "false").lower() == "true",
        )

    @property
    def use_api(self) -> bool:
        return bool(self.api_key)
