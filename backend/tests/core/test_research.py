from __future__ import annotations

from core import chunker
from core.models import Page, Source, WebSearchResult, utcnow
from core.research import (
    build_digest,
    build_synthesis_prompt,
    normalize_url,
    parse_ai_queries,
    plan_queries,
    rank_candidates,
)
from core.store import new_id


def _source(title: str, text: str, url: str | None = None) -> Source:
    meta: dict = {}
    if url:
        meta["url"] = url
    return Source(
        id=new_id(),
        notebook_id=new_id(),
        kind="url" if url else "paste",
        title=title,
        meta=meta,
        created_at=utcnow(),
        pages=[Page(number=1, text=text)],
        chunks=chunker.chunk_pages([Page(number=1, text=text)]),
    )


def _result(url: str, title: str = "", snippet: str = "") -> WebSearchResult:
    return WebSearchResult(title=title or url, url=url, snippet=snippet)


def test_heuristic_plan_makes_five_distinct_queries():
    queries = plan_queries("large language models")
    assert len(queries) == 5
    assert queries[0] == "large language models"
    assert len({q.lower() for q in queries}) == 5


def test_heuristic_plan_dedupes_case_insensitively():
    queries = plan_queries("What is what is")
    assert len(queries) == len({q.lower() for q in queries})


def test_heuristic_plan_uses_given_year():
    queries = plan_queries("quantum computing", year=2026)
    assert "quantum computing recent developments 2026" in queries


def test_parse_ai_queries_strips_numbering_and_bullets():
    assert parse_ai_queries("1. crab overview\n- crab examples\n\n3) crab risks") == [
        "crab overview",
        "crab examples",
        "crab risks",
    ]


def test_parse_ai_queries_drops_prose_and_links():
    queries = parse_ai_queries(
        "Here are queries:\n"
        "crab overview\n"
        "see https://example.com/crabs\n"
        "crab examples\n"
        f"{'crab ' * 30}long line\n"
    )
    assert queries == ["crab overview", "crab examples"]


def test_parse_ai_queries_caps_at_six():
    answer = "\n".join(f"query {n}" for n in range(1, 10))
    assert len(parse_ai_queries(answer)) == 6


def test_parse_ai_queries_returns_empty_when_unusable():
    assert parse_ai_queries("Sorry, I cannot help with that.") == []


def test_normalize_url_merges_www_trailing_slash_and_fragment():
    assert normalize_url("https://WWW.Example.com/a/") == normalize_url("https://example.com/a#x")
    assert normalize_url("https://www.example.com/a/") == "https://example.com/a"


def test_normalize_url_keeps_query_strings_distinct():
    assert normalize_url("https://example.com/a?x=1") != normalize_url("https://example.com/a?x=2")


def test_rank_candidates_rewards_cross_query_matches():
    shared = _result("https://shared.example/article", "shared article", "about the topic")
    solo = _result("https://solo.example/top-hit", "top hit about the topic", "about the topic")
    candidates = rank_candidates(
        [
            ("topic", [_result("https://filler1.example/a"), _result("https://filler2.example/a"), shared]),
            ("topic depth", [solo, shared]),
        ],
        set(),
    )
    urls = [c["url"] for c in candidates]
    assert urls.index("https://shared.example/article") < urls.index("https://solo.example/top-hit")


def test_rank_candidates_gives_position_bonus():
    candidates = rank_candidates(
        [("topic", [_result("https://a.example/rank1"), _result("https://b.example/rank8")])],
        set(),
    )
    assert candidates[0]["url"] == "https://a.example/rank1"


def test_rank_candidates_scores_snippet_overlap():
    candidates = rank_candidates(
        [
            (
                "mitochondria energy",
                [
                    _result("https://a.example/x", "cells", "totally unrelated words here"),
                    _result("https://b.example/y", "cells", "mitochondria energy production"),
                ],
            )
        ],
        set(),
    )
    assert candidates[0]["url"] == "https://b.example/y"


def test_rank_candidates_excludes_existing_urls():
    candidates = rank_candidates(
        [
            (
                "topic",
                [
                    _result("https://existing.example/dup"),
                    _result("https://fresh.example/new", "fresh", "topic words"),
                ],
            )
        ],
        {normalize_url("https://existing.example/dup/")},
    )
    assert [c["url"] for c in candidates] == ["https://fresh.example/new"]


def test_rank_candidates_limits_two_per_domain():
    candidates = rank_candidates(
        [
            (
                "topic",
                [
                    _result("https://same.example/1"),
                    _result("https://same.example/2"),
                    _result("https://same.example/3"),
                    _result("https://other.example/1"),
                ],
            )
        ],
        set(),
    )
    hosts = [c["url"].split("/")[2] for c in candidates]
    assert hosts.count("same.example") == 2


def test_rank_candidates_caps_and_breaks_ties_deterministically():
    results = [_result(f"https://r{n:02d}.example/page", "same title", "same snippet") for n in range(20)]
    candidates = rank_candidates([("topic", results)], set())
    assert len(candidates) == 15
    urls = [c["url"] for c in candidates]
    assert urls == sorted(urls)


def test_rank_candidates_records_matched_queries():
    candidates = rank_candidates(
        [("alpha query", [_result("https://x.example/a")]), ("beta query", [_result("https://x.example/a")])],
        set(),
    )
    assert candidates[0]["matched_queries"] == ["alpha query", "beta query"]


def test_build_digest_includes_topic_queries_and_sources():
    source = _source("Crabs Explained", "Crabs are decapod crustaceans. " * 40, url="https://crabs.example")
    digest = build_digest("crabs", ["what are crabs"], [source])
    assert "Research overview: crabs" in digest
    assert "- what are crabs" in digest
    assert "Crabs Explained" in digest
    assert "https://crabs.example" in digest
    excerpt_line = next(line for line in digest.splitlines() if "decapod" in line)
    assert len(excerpt_line.strip()) <= 402


def test_build_synthesis_prompt_demands_citations():
    prompt = build_synthesis_prompt("crabs", ["[1] excerpt text"])
    assert "TOPIC: crabs" in prompt
    assert "only" in prompt
    assert "[1] excerpt text" in prompt
