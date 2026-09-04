from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel


class AIConfig(BaseModel):
    enabled: bool = False
    provider: str | None = None
    api_key: str | None = None


class SearxngConfig(BaseModel):
    enabled: bool = False
    url: str = "http://localhost:8888"


class SearchConfig(BaseModel):
    order: list[str] = ["ddgs", "wikipedia", "arxiv"]
    searxng: SearxngConfig = SearxngConfig()


class Settings(BaseModel):
    ai: AIConfig = AIConfig()
    search: SearchConfig = SearchConfig()


def load_settings(path: str | Path | None = None) -> Settings:
    """Load config.yaml; missing file or keys fall back to all-off defaults."""
    file = Path(path) if path else Path(__file__).resolve().parents[1] / "config.yaml"
    if file.exists():
        data = yaml.safe_load(file.read_text()) or {}
        return Settings.model_validate(data)
    return Settings()
