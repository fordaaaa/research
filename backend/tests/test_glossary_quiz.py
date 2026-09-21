"""Keyless glossary + quiz: deterministic, grounded, bounded, owned."""
from __future__ import annotations

TEXT = (
    "Mitosis divides the nucleus into two identical sets. "
    "Chromosomes condense during prophase for orderly separation. "
    "Sister chromatids split apart during anaphase."
)


def _nb(client, name="GlossQuiz"):
    return client.post("/api/notebooks", json={"name": name}).json()


def _add_source(client, nb_id, title="Mitosis notes", text=TEXT):
    resp = client.post(
        f"/api/notebooks/{nb_id}/sources/text", json={"title": title, "text": text}
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _chunks(client, source_id):
    body = client.get(f"/api/sources/{source_id}/chunks").json()
    return body["chunks"] if isinstance(body, dict) else body


def test_glossary_grounded_with_provenance(client):
    nb = _nb(client)
    src = _add_source(client, nb["id"])
    resp = client.get(f"/api/notebooks/{nb['id']}/glossary")
    assert resp.status_code == 200, resp.text
    entries = resp.json()
    assert 1 <= len(entries) <= 20
    chunk_texts = " ".join(c["text"] for c in _chunks(client, src["id"]))
    for e in entries:
        assert e["term"].strip()
        assert len(e["explanation"]) >= 30
        assert e["explanation"] in chunk_texts
        assert e["source_id"] == src["id"]
        assert e["source_title"] == src["title"]
        assert isinstance(e["pages"], list)
        assert e["chunk_seq"] >= 0


def test_glossary_deterministic_and_deduplicated(client):
    nb = _nb(client)
    _add_source(client, nb["id"])
    _add_source(client, nb["id"], title="Mitosis notes", text=TEXT)
    first = client.get(f"/api/notebooks/{nb['id']}/glossary").json()
    second = client.get(f"/api/notebooks/{nb['id']}/glossary").json()
    assert first == second
    terms = [e["term"].strip().lower() for e in first]
    assert len(set(terms)) == len(terms)


def test_glossary_bounds(client):
    nb = _nb(client)
    _add_source(client, nb["id"])
    assert client.get(f"/api/notebooks/{nb['id']}/glossary?limit=500").status_code == 422
    assert client.get(f"/api/notebooks/{nb['id']}/glossary?limit=0").status_code == 422
    capped = client.get(f"/api/notebooks/{nb['id']}/glossary?limit=2").json()
    assert len(capped) <= 2


def test_glossary_no_sources(client):
    nb = _nb(client)
    assert client.get(f"/api/notebooks/{nb['id']}/glossary").status_code == 400


def test_quiz_grounded_with_answers_and_provenance(client):
    nb = _nb(client)
    _add_source(client, nb["id"])
    glossary = client.get(f"/api/notebooks/{nb['id']}/glossary").json()
    gloss_keys = {(g["term"], g["source_id"], g["chunk_seq"]) for g in glossary}
    resp = client.get(f"/api/notebooks/{nb['id']}/quiz")
    assert resp.status_code == 200, resp.text
    questions = resp.json()
    assert 1 <= len(questions) <= 10
    for q in questions:
        assert q["question_type"] in ("short_answer", "cloze")
        assert q["prompt"].strip() and q["answer"].strip()
        assert q["source_id"] and q["source_title"]
        assert (q["term"], q["source_id"], q["chunk_seq"]) in gloss_keys
        if q["question_type"] == "short_answer":
            chunk_texts = " ".join(c["text"] for c in _chunks(client, q["source_id"]))
            assert q["answer"] in chunk_texts
        else:
            assert "____" in q["prompt"]


def test_quiz_reproducible_bounded_and_not_persisted(client):
    nb = _nb(client)
    _add_source(client, nb["id"])
    before_cards = client.get(f"/api/notebooks/{nb['id']}/cards").json()
    before_sources = client.get(f"/api/notebooks/{nb['id']}/sources").json()
    first = client.get(f"/api/notebooks/{nb['id']}/quiz").json()
    second = client.get(f"/api/notebooks/{nb['id']}/quiz").json()
    assert first == second
    assert client.get(f"/api/notebooks/{nb['id']}/quiz?limit=3").json().__len__() <= 3
    assert client.get(f"/api/notebooks/{nb['id']}/quiz?limit=99").status_code == 422
    assert client.get(f"/api/notebooks/{nb['id']}/cards").json() == before_cards
    assert client.get(f"/api/notebooks/{nb['id']}/sources").json() == before_sources


def test_quiz_no_sources(client):
    nb = _nb(client)
    assert client.get(f"/api/notebooks/{nb['id']}/quiz").status_code == 400


PHOTO_TEXT = (
    "Photosynthesis converts light energy into chemical energy in chloroplasts. "
    "Photosynthesis sustains plant growth through glucose production. "
    "Cellular respiration releases energy from glucose for cellular work. "
    "Respiration supports maintenance and growth in plant tissues. "
)


def test_glossary_uses_surface_forms_not_stems(client):
    nb = _nb(client, name="GlossSurface")
    src = _add_source(client, nb["id"], title="Bio notes", text=PHOTO_TEXT)
    entries = client.get(f"/api/notebooks/{nb['id']}/glossary").json()
    terms_lower = [e["term"].lower() for e in entries]
    assert "photosynthesi" not in terms_lower
    assert "respirate" not in terms_lower
    assert "photosynthesis" in terms_lower
    assert "respiration" in terms_lower
    chunk_texts = " ".join(c["text"] for c in _chunks(client, src["id"]))
    for e in entries:
        assert e["term"].lower() in chunk_texts.lower()


def test_quiz_prompts_use_surface_forms_not_stems(client):
    import re

    nb = _nb(client, name="QuizSurface")
    src = _add_source(client, nb["id"], title="Bio notes", text=PHOTO_TEXT)
    questions = client.get(f"/api/notebooks/{nb['id']}/quiz").json()
    assert questions
    chunk_texts = " ".join(c["text"] for c in _chunks(client, src["id"]))
    for q in questions:
        assert not re.search(r"\bphotosynthesi\b", q["prompt"].lower())
        assert not re.search(r"\brespirate\b", q["prompt"].lower())
        assert q["term"].strip().lower() not in ("photosynthesi", "respirate")
        assert q["term"].lower() in chunk_texts.lower()
        if q["question_type"] == "cloze":
            assert "____" in q["prompt"]
            assert q["answer"].lower() in chunk_texts.lower()


def test_glossary_and_quiz_enforce_ownership(client):
    from fastapi.testclient import TestClient

    from api.main import app

    nb = _nb(client)
    _add_source(client, nb["id"])
    with TestClient(app) as anon:
        other = anon.post(
            "/api/auth/register",
            json={"email": "other@example.com", "password": "password123"},
        )
        assert other.status_code == 201
        token = other.json()["token"]
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as outsider:
        assert outsider.get(f"/api/notebooks/{nb['id']}/glossary").status_code == 404
        assert outsider.get(f"/api/notebooks/{nb['id']}/quiz").status_code == 404
