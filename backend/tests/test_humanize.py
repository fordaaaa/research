from __future__ import annotations

from api import humanize as humanize_api
from core import humanize


def test_analyze_flags_contrast_and_runup():
    findings = humanize.analyze(
        "It's not just a river but a lifeline. Let's dive in and delve into the details."
    )
    keys = {f["pattern"] for f in findings}
    assert "not_x_but_y" in keys
    assert "staged_runup" in keys
    assert all(f["excerpt"] and f["suggestion"] for f in findings)


def test_analyze_flags_vocab_inflation_and_residue():
    text = (
        "Great question! Nestled along the banks, this pivotal moment showcases "
        "our vibrant tapestry. I hope this helps!"
    )
    keys = {f["pattern"] for f in humanize.analyze(text)}
    assert {"ai_words", "inflated_significance", "chatbot_residue"} <= keys


def test_analyze_flags_formatting_and_rhythm():
    text = "She noted the **results**. She noted the method. A — b — c — d e f g h i j k l m n o p."
    keys = {f["pattern"] for f in humanize.analyze(text)}
    assert "bold_decoration" in keys
    assert "repeated_opening" in keys
    assert "dash_connector" in keys


def test_analyze_clean_text_returns_no_findings():
    findings = humanize.analyze("The river runs north. It floods each spring.")
    assert findings == []


def test_analyze_endpoint_is_keyless(client):
    response = client.post("/api/humanize/analyze", json={"text": "Let's dive in, friends."})
    assert response.status_code == 200
    body = response.json()
    assert body["signal_count"] == len(body["findings"]) >= 1


def test_analyze_validates_length(client):
    assert client.post("/api/humanize/analyze", json={"text": ""}).status_code == 422
    assert client.post("/api/humanize/analyze", json={"text": "x" * 20001}).status_code == 422


def test_rewrite_requires_ai_key(client):
    response = client.post("/api/humanize/rewrite", json={"text": "Let's dive in."})
    assert response.status_code == 503


def test_rewrite_uses_provider_when_configured(client, monkeypatch):
    client.put(
        "/api/settings/ai",
        json={"provider": "gemini", "api_key": "a-key-that-is-long-enough", "model": "gemini-test"},
    )
    monkeypatch.setattr(
        humanize_api.providers,
        "generate",
        lambda provider, key, model, prompt: ("We looked at the river.", model),
    )
    response = client.post("/api/humanize/rewrite", json={"text": "Let's dive into rivers."})
    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "We looked at the river."
    assert body["model"] == "gemini-test"


def test_rewrite_falls_back_to_502_on_ai_error(client, monkeypatch):
    client.put(
        "/api/settings/ai",
        json={"provider": "gemini", "api_key": "a-key-that-is-long-enough", "model": "gemini-test"},
    )

    def boom(provider, key, model, prompt):
        raise humanize_api.providers.AIError("rate-limited")

    monkeypatch.setattr(humanize_api.providers, "generate", boom)
    response = client.post("/api/humanize/rewrite", json={"text": "Let's dive in."})
    assert response.status_code == 502


def test_apply_fixes_is_deterministic_idempotent_and_reports_counts():
    text = "“Hello,” she said. **Note**: ➜ Start here. Let's dive in. We learn. We learn."
    result = humanize.apply_fixes(
        text,
        ["straighten_quotes", "remove_decoration", "remove_staged_runup", "reduce_repeated_openings"],
    )
    assert result["text"] == '"Hello," she said. Note: Start here. We learn. We learn.'
    assert result["operations"] == [
        {"operation": "straighten_quotes", "count": 2},
        {"operation": "remove_decoration", "count": 2},
        {"operation": "remove_staged_runup", "count": 1},
        {"operation": "reduce_repeated_openings", "count": 0},
    ]
    assert humanize.apply_fixes(result["text"], [op["operation"] for op in result["operations"]]) == {
        "text": result["text"],
        "operations": [{"operation": op["operation"], "count": 0} for op in result["operations"]],
    }


def test_apply_fixes_rejects_unknown_operations():
    try:
        humanize.apply_fixes("A sentence.", ["invent_new_facts"])
    except ValueError as exc:
        assert "unknown humanize operation" in str(exc)
    else:
        raise AssertionError("unknown operation should be rejected")


def test_fix_endpoint_is_keyless_and_returns_preview(client):
    response = client.post(
        "/api/humanize/fix",
        json={"text": "**Hello** ➜ Let's dive in.", "operations": ["remove_decoration", "remove_staged_runup"]},
    )
    assert response.status_code == 200
    assert response.json() == {
        "text": "Hello",
        "operations": [
            {"operation": "remove_decoration", "count": 2},
            {"operation": "remove_staged_runup", "count": 1},
        ],
    }


def test_fix_endpoint_rejects_unknown_operation(client):
    response = client.post("/api/humanize/fix", json={"text": "A sentence.", "operations": ["bad"]})
    assert response.status_code == 422
