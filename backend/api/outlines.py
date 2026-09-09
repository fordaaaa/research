"""Persistent deep-research outlines: draft items/fields, per-item deep pass,
and an outline-structured report. Keyless by default; AI upgrades drafting and
reporting when a provider key is configured but never blocks the keyless path."""
from __future__ import annotations

from time import sleep

from fastapi import Depends, FastAPI, HTTPException

from api.deps import get_current_user, get_store, notebook_or_404, safe_id
from api.sources import _summary
from core import deepresearch, ingest, providers, research, skills
from core.context import build_context
from core.models import (
    OutlineCreate,
    OutlineDeepItemResult,
    OutlineDeepRequest,
    OutlineDeepResponse,
    OutlineDraftRequest,
    OutlineDraftResponse,
    OutlineField,
    OutlineItem,
    OutlineReportRequest,
    OutlineReportResponse,
    OutlineUpdate,
    ResearchCandidate,
    ResearchOutline,
    User,
    utcnow,
)
from core.store import Store, new_id
from core.websearch import WebSearchError, search_web

QUERY_DELAY = 0.35
CANDIDATES_PER_ITEM = 6


def _get_outline(store: Store, notebook_id: str, outline_id: str) -> ResearchOutline:
    outline_id = safe_id(outline_id, "outline_id")
    outline = store.get_outline(notebook_id, outline_id)
    if outline is None:
        raise HTTPException(status_code=404, detail="outline not found")
    return outline


def _short_id() -> str:
    return new_id()[:8]


def register(app: FastAPI) -> None:
    @app.get("/api/notebooks/{notebook_id}/outlines", response_model=list[ResearchOutline])
    def list_outlines(notebook_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        return store.list_outlines(notebook_id)

    @app.post("/api/notebooks/{notebook_id}/outlines", response_model=ResearchOutline, status_code=201)
    def create_outline(notebook_id: str, body: OutlineCreate, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        now = utcnow()
        outline = ResearchOutline(
            id=new_id(),
            notebook_id=notebook_id,
            topic=body.topic.strip(),
            items=[OutlineItem(id=i.id or _short_id(), label=i.label.strip()) for i in body.items],
            fields=[OutlineField(id=f.id or _short_id(), label=f.label.strip()) for f in body.fields],
            created_at=now,
            updated_at=now,
        )
        return store.save_outline(outline)

    @app.get("/api/notebooks/{notebook_id}/outlines/{outline_id}", response_model=ResearchOutline)
    def get_outline(notebook_id: str, outline_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        return _get_outline(store, notebook_id, outline_id)

    @app.patch("/api/notebooks/{notebook_id}/outlines/{outline_id}", response_model=ResearchOutline)
    def update_outline(notebook_id: str, outline_id: str, body: OutlineUpdate, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        outline = _get_outline(store, notebook_id, outline_id)
        if body.topic is not None:
            outline.topic = body.topic.strip()
        if body.items is not None:
            outline.items = [
                OutlineItem(id=i.id or _short_id(), label=i.label.strip()) for i in body.items
            ]
        if body.fields is not None:
            outline.fields = [
                OutlineField(id=f.id or _short_id(), label=f.label.strip()) for f in body.fields
            ]
        outline.updated_at = utcnow()
        return store.save_outline(outline)

    @app.delete("/api/notebooks/{notebook_id}/outlines/{outline_id}", status_code=204)
    def delete_outline(notebook_id: str, outline_id: str, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        outline_id = safe_id(outline_id, "outline_id")
        if not store.delete_outline(notebook_id, outline_id):
            raise HTTPException(status_code=404, detail="outline not found")

    @app.post("/api/notebooks/{notebook_id}/outlines/draft", response_model=OutlineDraftResponse)
    def draft_outline(notebook_id: str, body: OutlineDraftRequest, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        origin = "heuristic"
        items, fields = deepresearch.draft_heuristic(body.topic)
        key = store.ai_key(user.id)
        configured = store.get_ai_settings(user.id)
        if key and configured.model:
            try:
                answer, _ = providers.generate(
                    configured.provider, key, configured.model,
                    deepresearch.build_draft_prompt(body.topic),
                )
                ai_items, ai_fields = deepresearch.parse_draft(answer)
            except providers.AIError:
                ai_items, ai_fields = [], []
            if len(ai_items) >= 2:
                items, origin = ai_items, "ai"
                if len(ai_fields) >= 2:
                    fields = ai_fields
        return OutlineDraftResponse(topic=body.topic, items=items, fields=fields, origin=origin)

    @app.post("/api/notebooks/{notebook_id}/outlines/{outline_id}/deep", response_model=OutlineDeepResponse)
    def deep_outline(notebook_id: str, outline_id: str, body: OutlineDeepRequest, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        outline = _get_outline(store, notebook_id, outline_id)
        if not outline.items:
            raise HTTPException(status_code=400, detail="add an outline item before deep research")
        existing_urls = {
            research.normalize_url(summary.meta["url"])
            for summary in store.list_sources(notebook_id)
            if summary.meta.get("url")
        }
        results: list[OutlineDeepItemResult] = []
        failed_items: list[str] = []
        any_success = False
        first = True
        for item in outline.items:
            queries = deepresearch.item_queries(outline.topic, item, outline.fields, body.per_item)
            per_query: list[tuple[str, list]] = []
            for query in queries:
                if not first:
                    sleep(QUERY_DELAY)
                first = False
                try:
                    per_query.append((query, search_web(query, limit=body.per_query)))
                except WebSearchError:
                    continue
            if not per_query:
                failed_items.append(item.label)
                continue
            any_success = True
            ranked = research.rank_candidates(per_query, existing_urls, limit=CANDIDATES_PER_ITEM)
            results.append(
                OutlineDeepItemResult(
                    item_id=item.id,
                    label=item.label,
                    queries=queries,
                    candidates=[ResearchCandidate(**c) for c in ranked],
                )
            )
        if not any_success:
            raise HTTPException(status_code=503, detail="web search is temporarily unavailable")
        return OutlineDeepResponse(results=results, failed_items=failed_items)

    @app.post(
        "/api/notebooks/{notebook_id}/outlines/{outline_id}/report",
        response_model=OutlineReportResponse,
        status_code=201,
    )
    def report_outline(notebook_id: str, outline_id: str, body: OutlineReportRequest, user: User = Depends(get_current_user)):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, user.id, notebook_id)
        outline = _get_outline(store, notebook_id, outline_id)
        summaries = store.list_sources(notebook_id)
        if body.source_ids is not None:
            known = {summary.id for summary in summaries}
            if not set(body.source_ids) <= known:
                raise HTTPException(status_code=400, detail="source not found")
        sources = []
        for summary in summaries:
            if body.source_ids is not None and summary.id not in set(body.source_ids):
                continue
            source = store.get_source(notebook_id, summary.id)
            if source:
                sources.append(source)
        if not sources:
            raise HTTPException(status_code=400, detail="add a source before writing the report")

        origin, model = "digest", None
        text = deepresearch.build_report_digest(outline.topic, outline.items, outline.fields, sources)
        key = store.ai_key(user.id)
        configured = store.get_ai_settings(user.id)
        if key and configured.model:
            try:
                excerpts, citations = build_context(
                    store, notebook_id,
                    source_ids=set(body.source_ids) if body.source_ids else None,
                )
                prompt = deepresearch.build_report_prompt(outline.topic, outline.items, excerpts)
                matched = skills.match_skills(store.list_skills(user.id), outline.topic)
                if matched:
                    prompt += "\n\n" + skills.skills_section(matched)
                notes = store.get_memory(notebook_id)
                if notes.strip():
                    prompt += "\n\n" + skills.memory_section(notes.strip())
                answer, model = providers.generate(
                    configured.provider, key, configured.model, prompt,
                )
                lines = [answer, "", "Sources:"]
                lines.extend(
                    f"[{number}] {citation.source_title} (pages {', '.join(map(str, citation.pages))})"
                    for number, citation in enumerate(citations, start=1)
                )
                text, origin = "\n".join(lines), "ai"
            except providers.AIError:
                origin, model = "digest", None

        extra_meta: dict = {
            "report_topic": outline.topic,
            "outline_id": outline.id,
            "origin": origin,
        }
        if model:
            extra_meta["model"] = model
        source = ingest.ingest_text(
            store, notebook_id, f"Research report: {outline.topic}", text, extra_meta=extra_meta
        )
        return OutlineReportResponse(source=_summary(source), origin=origin, model=model)
