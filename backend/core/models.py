from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Page(BaseModel):
    number: int  # 1-based
    text: str


class Chunk(BaseModel):
    seq: int  # position within the source, 0-based
    pages: list[int]  # page numbers this chunk draws from; never spans pages
    text: str


SourceKind = Literal["pdf", "docx", "txt", "md", "paste", "url"]


class Source(BaseModel):
    id: str
    notebook_id: str
    kind: SourceKind
    title: str
    tags: list[str] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    pages: list[Page] = Field(default_factory=list)
    chunks: list[Chunk] = Field(default_factory=list)


class SourceSummary(BaseModel):
    id: str
    notebook_id: str
    kind: SourceKind
    title: str
    tags: list[str] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    chunk_count: int


class Notebook(BaseModel):
    id: str
    name: str
    created_at: datetime


class SearchHit(BaseModel):
    source_id: str
    source_title: str
    pages: list[int]
    score: float
    snippet: str
    matched_terms: list[str] = Field(default_factory=list)


class NotebookCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class PasteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200, default="Pasted note")
    text: str = Field(min_length=1, max_length=5_000_000)


class SourceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    tags: list[str] | None = None


class UrlCreate(BaseModel):
    url: str = Field(min_length=5, max_length=2000)


class WebSearchResult(BaseModel):
    title: str
    url: str
    snippet: str


AIProvider = Literal["gemini", "openrouter"]

AI_DEFAULT_MODELS: dict[str, str] = {
    "gemini": "gemini-2.5-flash",
    "openrouter": "meta-llama/llama-3.3-70b-instruct:free",
}


class AISettingsUpdate(BaseModel):
    provider: AIProvider = "gemini"
    api_key: str = Field(min_length=10, max_length=500)
    model: str = Field(default="gemini-2.5-flash", min_length=1, max_length=100)

    @model_validator(mode="before")
    @classmethod
    def _default_model(cls, data: Any) -> Any:
        if isinstance(data, dict) and not data.get("model"):
            provider = data.get("provider", "gemini")
            if provider in AI_DEFAULT_MODELS:
                data = {**data, "model": AI_DEFAULT_MODELS[provider]}
        return data


class AISettings(BaseModel):
    configured: bool
    provider: AIProvider | None = None
    model: str | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4_000)


class Citation(BaseModel):
    source_id: str
    source_title: str
    pages: list[int]


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    model: str | None = None
