"""Keyless research workflow: plan sub-queries, gather ranked web candidates,
and write an overview note. AI improves planning/synthesis when configured but
never blocks the keyless path."""
from __future__ import annotations

from time import sleep

from fastapi import FastAPI, HTTPException

from api.deps import get_store, notebook_or_404, safe_id
from api.sources import _summary
from core import ingest, providers, research, settings
from core.context import build_context
from core.models import (
    ResearchCandidate,
    ResearchGatherRequest,
    ResearchGatherResponse,
    ResearchPlanRequest,
    ResearchPlanResponse,
    ResearchSynthesizeRequest,
    ResearchSynthesisResponse,
)
from core.websearch import WebSearchError, search_web

QUERY_DELAY = 0.35


def register(app: FastAPI) -> None:
    @app.post("/api/notebooks/{notebook_id}/research/plan", response_model=ResearchPlanResponse)
    def plan(notebook_id: str, body: ResearchPlanRequest):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, notebook_id)
        origin = "heuristic"
        queries = research.plan_queries(body.topic)
        key = settings.api_key(store.root)
        configured = settings.get_ai_settings(store.root)
        if key and configured.model:
            try:
                answer, _ = providers.generate(
                    configured.provider, key, configured.model, research.build_planner_prompt(body.topic)
                )
                ai_queries = research.parse_ai_queries(answer)
            except providers.AIError:
                ai_queries = []
            if len(ai_queries) >= 2:
                queries, origin = ai_queries, "ai"
        return ResearchPlanResponse(topic=body.topic, queries=queries, origin=origin)

    @app.post("/api/notebooks/{notebook_id}/research/gather", response_model=ResearchGatherResponse)
    def gather(notebook_id: str, body: ResearchGatherRequest):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, notebook_id)
        results_per_query: list[tuple[str, list]] = []
        failed_queries: list[str] = []
        for index, query in enumerate(body.queries):
            if index and results_per_query:
                sleep(QUERY_DELAY)
            try:
                results_per_query.append((query, search_web(query, limit=body.per_query)))
            except WebSearchError:
                failed_queries.append(query)
        if not results_per_query:
            raise HTTPException(status_code=503, detail="web search is temporarily unavailable")
        existing_urls = {
            research.normalize_url(summary.meta["url"])
            for summary in store.list_sources(notebook_id)
            if summary.meta.get("url")
        }
        candidates = [
            ResearchCandidate(**candidate)
            for candidate in research.rank_candidates(results_per_query, existing_urls)
        ]
        return ResearchGatherResponse(candidates=candidates, failed_queries=failed_queries)

    @app.post(
        "/api/notebooks/{notebook_id}/research/synthesize",
        response_model=ResearchSynthesisResponse,
        status_code=201,
    )
    def synthesize(notebook_id: str, body: ResearchSynthesizeRequest):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, notebook_id)
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
            raise HTTPException(status_code=400, detail="add a source before synthesizing")

        origin, model = "digest", None
        text = research.build_digest(body.topic, body.queries, sources)
        key = settings.api_key(store.root)
        configured = settings.get_ai_settings(store.root)
        if key and configured.model:
            try:
                excerpts, citations = build_context(store, notebook_id, source_ids=set(body.source_ids) if body.source_ids else None)
                answer, model = providers.generate(
                    configured.provider,
                    key,
                    configured.model,
                    research.build_synthesis_prompt(body.topic, excerpts),
                )
                lines = [answer, "", "Sources:"]
                lines.extend(
                    f"[{number}] {citation.source_title} (pages {', '.join(map(str, citation.pages))})"
                    for number, citation in enumerate(citations, start=1)
                )
                text, origin = "\n".join(lines), "ai"
            except providers.AIError:
                origin, model = "digest", None

        extra_meta: dict = {"research_topic": body.topic, "queries": body.queries, "origin": origin}
        if model:
            extra_meta["model"] = model
        source = ingest.ingest_text(
            store, notebook_id, f"Research overview: {body.topic}", text, extra_meta=extra_meta
        )
        return ResearchSynthesisResponse(
            source=_summary(source),
            origin=origin,
            model=model,
        )
