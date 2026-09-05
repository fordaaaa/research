from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


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
