from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Literal

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


class ImportantPassage(BaseModel):
    text: str
    score: float = 0.0
    chunk_seq: int = Field(ge=0)
    pages: list[int] = Field(default_factory=list)


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
    canonical_url: str | None = None
    site_name: str | None = None
    byline: str | None = None
    published: str | None = None
    important_passages: list[ImportantPassage] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _restore_extraction_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        meta = data.get("meta") or {}
        if not isinstance(meta, dict):
            return data
        restored = dict(data)
        restored.setdefault("canonical_url", meta.get("canonical_url"))
        restored.setdefault("site_name", meta.get("site_name"))
        restored.setdefault("byline", meta.get("byline"))
        restored.setdefault("published", meta.get("published"))
        restored.setdefault("important_passages", meta.get("important_passages", []))
        return restored


class SourceSummary(BaseModel):
    id: str
    notebook_id: str
    kind: SourceKind
    title: str
    tags: list[str] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    chunk_count: int


class NoteCitation(BaseModel):
    source_id: str = Field(min_length=12, max_length=12, pattern=r"^[a-f0-9]{12}$")
    chunk_seq: int = Field(ge=0, le=100_000)


class Note(BaseModel):
    id: str
    notebook_id: str
    title: str
    body: str
    tags: list[str] = Field(default_factory=list)
    citations: list[NoteCitation] = Field(default_factory=list)
    rev: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime


class NoteSummary(BaseModel):
    id: str
    notebook_id: str
    title: str
    tags: list[str] = Field(default_factory=list)
    citations: list[NoteCitation] = Field(default_factory=list)
    rev: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=1_000_000)
    tags: list[Annotated[str, Field(min_length=1, max_length=50)]] = Field(default_factory=list, max_length=20)
    citations: list[NoteCitation] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def _title_not_blank(self) -> "NoteCreate":
        if not self.title.strip():
            raise ValueError("title must not be blank")
        return self


class NoteUpdate(BaseModel):
    base_rev: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=1_000_000)
    tags: list[Annotated[str, Field(min_length=1, max_length=50)]] | None = Field(default=None, max_length=20)
    citations: list[NoteCitation] | None = Field(default=None, max_length=100)


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
    "openrouter": "nvidia/nemotron-3-ultra-550b-a55b:free",
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


class ChatSession(BaseModel):
    id: str
    notebook_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ChatSessionCreate(BaseModel):
    title: str = Field(default="New conversation", min_length=1, max_length=200)

    @model_validator(mode="after")
    def _title_not_blank(self) -> "ChatSessionCreate":
        if not self.title.strip():
            raise ValueError("title must not be blank")
        return self


class ChatMessage(BaseModel):
    id: str
    session_id: str
    role: Literal["user", "assistant"]
    text: str
    citations: list[Citation] = Field(default_factory=list)
    model: str | None = None
    created_at: datetime


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    model: str | None = None


_StrQuery = Annotated[str, Field(min_length=1, max_length=200)]


class ResearchPlanRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=300)


class ResearchPlanResponse(BaseModel):
    topic: str
    queries: list[str]
    origin: Literal["ai", "heuristic"]


class ResearchGatherRequest(BaseModel):
    queries: list[_StrQuery] = Field(min_length=1, max_length=6)
    per_query: int = Field(default=6, ge=3, le=10)


class ResearchCandidate(BaseModel):
    title: str
    url: str
    snippet: str
    score: int
    matched_queries: list[str]


class ResearchGatherResponse(BaseModel):
    candidates: list[ResearchCandidate]
    failed_queries: list[str]


class ResearchSynthesizeRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=300)
    queries: list[_StrQuery] = Field(default_factory=list, max_length=6)
    source_ids: list[str] | None = None


class ResearchSynthesisResponse(BaseModel):
    source: SourceSummary
    origin: Literal["ai", "digest"]
    model: str | None = None


class OutlineItem(BaseModel):
    id: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=200)


class OutlineField(BaseModel):
    id: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=120)


class ResearchOutline(BaseModel):
    id: str
    notebook_id: str
    topic: str
    items: list[OutlineItem] = Field(default_factory=list)
    fields: list[OutlineField] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class OutlineItemInput(BaseModel):
    id: str | None = Field(default=None, min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=200)


class OutlineFieldInput(BaseModel):
    id: str | None = Field(default=None, min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=120)


class OutlineCreate(BaseModel):
    topic: str = Field(min_length=3, max_length=300)
    items: list[OutlineItemInput] = Field(default_factory=list, max_length=30)
    fields: list[OutlineFieldInput] = Field(default_factory=list, max_length=15)


class OutlineUpdate(BaseModel):
    topic: str | None = Field(default=None, min_length=3, max_length=300)
    items: list[OutlineItemInput] | None = Field(default=None, max_length=30)
    fields: list[OutlineFieldInput] | None = Field(default=None, max_length=15)


class OutlineDraftRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=300)


class OutlineDraftResponse(BaseModel):
    topic: str
    items: list[str]
    fields: list[str]
    origin: Literal["ai", "heuristic"]


class OutlineDeepRequest(BaseModel):
    per_item: int = Field(default=4, ge=1, le=6)
    per_query: int = Field(default=5, ge=3, le=10)


class OutlineDeepItemResult(BaseModel):
    item_id: str
    label: str
    queries: list[str]
    candidates: list[ResearchCandidate]


class OutlineDeepResponse(BaseModel):
    results: list[OutlineDeepItemResult]
    failed_items: list[str]


class OutlineReportRequest(BaseModel):
    source_ids: list[str] | None = None


class OutlineReportResponse(BaseModel):
    source: SourceSummary
    origin: Literal["ai", "digest"]
    model: str | None = None


class HumanizeFinding(BaseModel):
    pattern: str
    label: str
    excerpt: str
    suggestion: str


class HumanizeAnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class HumanizeAnalyzeResponse(BaseModel):
    findings: list[HumanizeFinding]
    signal_count: int


class HumanizeRewriteRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    voice_sample: str | None = Field(default=None, min_length=1, max_length=5_000)


class HumanizeRewriteResponse(BaseModel):
    text: str
    model: str | None = None


class Skill(BaseModel):
    id: str
    user_id: str = ""
    name: str
    instructions: str
    triggers: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SkillCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    instructions: str = Field(min_length=1, max_length=4_000)
    triggers: list[str] = Field(default_factory=list, max_length=10)


class SkillUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    instructions: str | None = Field(default=None, min_length=1, max_length=4_000)
    triggers: list[str] | None = Field(default=None, max_length=10)


class MemoryUpdate(BaseModel):
    notes: str = Field(max_length=10_000)


class MemoryResponse(BaseModel):
    notes: str


class User(BaseModel):
    id: str
    email: str
    created_at: datetime


class UserPublic(BaseModel):
    id: str
    email: str


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class AuthResponse(BaseModel):
    user: UserPublic
    token: str


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(min_length=10, max_length=8000)


class Flashcard(BaseModel):
    id: str
    notebook_id: str
    front: str
    back: str
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    interval_days: float = Field(default=0.0, ge=0.0)
    review_count: int = Field(default=0, ge=0)
    due_at: datetime = Field(default_factory=utcnow)
    last_reviewed_at: datetime | None = None


class CardCreate(BaseModel):
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=2_000)
    tags: list[str] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _content_not_blank(self) -> "CardCreate":
        if not self.front.strip():
            raise ValueError("front must not be blank")
        if not self.back.strip():
            raise ValueError("back must not be blank")
        return self


class CardUpdate(BaseModel):
    front: str | None = Field(default=None, min_length=1, max_length=500)
    back: str | None = Field(default=None, min_length=1, max_length=2_000)
    tags: list[str] | None = Field(default=None, max_length=10)

    @model_validator(mode="after")
    def _content_not_blank(self) -> "CardUpdate":
        if self.front is not None and not self.front.strip():
            raise ValueError("front must not be blank")
        if self.back is not None and not self.back.strip():
            raise ValueError("back must not be blank")
        return self


ReviewRating = Literal["again", "hard", "good", "easy"]


class CardReview(BaseModel):
    rating: ReviewRating


class CardSuggestion(BaseModel):
    front: str
    back: str
    source_id: str
    source_title: str
    pages: list[int] = Field(default_factory=list)
    chunk_seq: int = Field(default=0, ge=0)


class GlossaryEntry(BaseModel):
    term: str
    explanation: str
    source_id: str
    source_title: str
    pages: list[int] = Field(default_factory=list)
    chunk_seq: int = Field(default=0, ge=0)


QuizQuestionType = Literal["short_answer", "cloze"]


class QuizQuestion(BaseModel):
    question_type: QuizQuestionType
    prompt: str
    answer: str
    term: str
    source_id: str
    source_title: str
    pages: list[int] = Field(default_factory=list)
    chunk_seq: int = Field(default=0, ge=0)
