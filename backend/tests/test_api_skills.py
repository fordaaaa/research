from __future__ import annotations

from api import ai as ai_api
from core import skills
from core.models import Skill


def _skill(name="Exam prep", instructions="Answer with flashcards.", triggers=("exam",)):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    return Skill(
        id="abc123def456", name=name, instructions=instructions,
        triggers=list(triggers), created_at=now, updated_at=now,
    )


def test_match_skills_finds_trigger_case_insensitive():
    matched = skills.match_skills([_skill()], "help me study for the EXAM")
    assert [s.name for s in matched] == ["Exam prep"]
    assert skills.match_skills([_skill()], "unrelated question") == []


def test_match_skills_caps_at_three():
    many = [_skill(name=f"s{i}", triggers=(f"t{i}",)) for i in range(5)]
    matched = skills.match_skills(many, "t0 t1 t2 t3 t4")
    assert len(matched) == 3


def test_skills_crud_round_trip(client):
    created = client.post(
        "/api/skills",
        json={"name": "Exam prep", "instructions": "Answer with flashcards.", "triggers": ["Exam", " quiz "]},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["triggers"] == ["exam", "quiz"]

    assert [s["id"] for s in client.get("/api/skills").json()] == [body["id"]]
    assert client.get(f"/api/skills/{body['id']}").json()["name"] == "Exam prep"

    updated = client.patch(f"/api/skills/{body['id']}", json={"name": "Quiz mode"}).json()
    assert updated["name"] == "Quiz mode"

    assert client.delete(f"/api/skills/{body['id']}").status_code == 204
    assert client.get(f"/api/skills/{body['id']}").status_code == 404


def test_skills_validate_input(client):
    assert client.post("/api/skills", json={"name": "", "instructions": "x"}).status_code == 422
    assert client.post("/api/skills", json={"name": "x", "instructions": ""}).status_code == 422
    assert client.get("/api/skills/not-an-id").status_code == 400


def test_memory_round_trip_per_notebook(client):
    one = client.post("/api/notebooks", json={"name": "One"}).json()
    two = client.post("/api/notebooks", json={"name": "Two"}).json()
    assert client.get(f"/api/notebooks/{one['id']}/memory").json() == {"notes": ""}

    saved = client.put(f"/api/notebooks/{one['id']}/memory", json={"notes": "midterm covers chapters 1-3"}).json()
    assert saved == {"notes": "midterm covers chapters 1-3"}
    assert client.get(f"/api/notebooks/{two['id']}/memory").json() == {"notes": ""}


def test_memory_404_unknown_notebook(client):
    assert client.get("/api/notebooks/aaaaaaaaaaaa/memory").status_code == 404


def test_chat_includes_matched_skill_and_memory(client, monkeypatch):
    nb = client.post("/api/notebooks", json={"name": "Study"}).json()
    client.put(
        "/api/settings/ai",
        json={"provider": "gemini", "api_key": "a-key-that-is-long-enough", "model": "gemini-test"},
    )
    client.post(f"/api/notebooks/{nb['id']}/sources/text", json={"title": "Notes", "text": "Mitosis has four phases."})
    client.post(
        "/api/skills",
        json={"name": "Exam prep", "instructions": "Answer with flashcards.", "triggers": ["exam"]},
    )
    client.put(f"/api/notebooks/{nb['id']}/memory", json={"notes": "midterm covers mitosis"})

    prompts: list[str] = []

    def fake_generate(provider, key, model, prompt):
        prompts.append(prompt)
        return ("Answer [1].", model)

    monkeypatch.setattr(ai_api.providers, "generate", fake_generate)
    response = client.post(f"/api/notebooks/{nb['id']}/chat", json={"message": "quiz me for the exam"})
    assert response.status_code == 200
    assert "Answer with flashcards." in prompts[0]
    assert "midterm covers mitosis" in prompts[0]


def test_chat_ignores_unmatched_skills(client, monkeypatch):
    nb = client.post("/api/notebooks", json={"name": "Study"}).json()
    client.put(
        "/api/settings/ai",
        json={"provider": "gemini", "api_key": "a-key-that-is-long-enough", "model": "gemini-test"},
    )
    client.post(f"/api/notebooks/{nb['id']}/sources/text", json={"title": "Notes", "text": "Mitosis facts."})
    client.post(
        "/api/skills",
        json={"name": "Exam prep", "instructions": "Answer with flashcards.", "triggers": ["exam"]},
    )

    prompts: list[str] = []

    def fake_generate(provider, key, model, prompt):
        prompts.append(prompt)
        return ("Answer [1].", model)

    monkeypatch.setattr(ai_api.providers, "generate", fake_generate)
    assert client.post(f"/api/notebooks/{nb['id']}/chat", json={"message": "summarize this"}).status_code == 200
    assert "flashcards" not in prompts[0]
