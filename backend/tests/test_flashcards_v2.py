"""Flashcards v2: spaced-review state, review queue, keyless suggestions."""
from __future__ import annotations


def _nb(client, name="CardsV2"):
    return client.post("/api/notebooks", json={"name": name}).json()


def _add_source(client, nb_id, title="Mitosis notes", text=None):
    text = text or (
        "Mitosis divides the nucleus into two identical sets. "
        "Chromosomes condense during prophase for orderly separation. "
        "Sister chromatids split apart during anaphase."
    )
    resp = client.post(
        f"/api/notebooks/{nb_id}/sources/text", json={"title": title, "text": text}
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def test_new_card_has_review_defaults(client):
    nb = _nb(client)
    card = client.post(
        f"/api/notebooks/{nb['id']}/cards",
        json={"front": "What splits in anaphase?", "back": "Sister chromatids."},
    ).json()
    assert card["review_count"] == 0
    assert card["interval_days"] == 0
    assert card["last_reviewed_at"] is None
    assert card["due_at"] is not None


def test_legacy_card_row_migrates_with_defaults(client, data_dir, monkeypatch):
    import sqlite3

    nb = _nb(client)
    card = client.post(
        f"/api/notebooks/{nb['id']}/cards",
        json={"front": "Q legacy?", "back": "A legacy."},
    ).json()
    # Simulate a pre-v2 database: no review columns and no due index.
    db_path = data_dir / "app.db"
    con = sqlite3.connect(str(db_path))
    con.execute("DROP INDEX IF EXISTS idx_cards_notebook_due")
    cols = [r[1] for r in con.execute("PRAGMA table_info(cards)").fetchall()]
    for col in ("due_at", "last_reviewed_at", "interval_days", "review_count"):
        if col in cols:
            con.execute(f"ALTER TABLE cards DROP COLUMN {col}")
    con.commit()
    con.close()
    # Reopening the store must migrate safely and old cards stay readable.
    from core.store import Store

    store = Store(root=data_dir)
    legacy = store.get_card(nb["id"], card["id"])
    assert legacy is not None
    assert legacy.review_count == 0
    assert legacy.interval_days == 0
    assert legacy.last_reviewed_at is None
    assert legacy.due_at is not None
    listed = client.get(f"/api/notebooks/{nb['id']}/cards").json()
    assert any(c["id"] == card["id"] for c in listed)


def test_review_scheduling_transitions(client):
    nb = _nb(client)
    card = client.post(
        f"/api/notebooks/{nb['id']}/cards",
        json={"front": "Q?", "back": "A."},
    ).json()
    cid = card["id"]

    again = client.post(
        f"/api/notebooks/{nb['id']}/cards/{cid}/review", json={"rating": "again"}
    )
    assert again.status_code == 200, again.text
    assert again.json()["review_count"] == 1
    assert again.json()["interval_days"] == 0
    assert again.json()["last_reviewed_at"] is not None

    good = client.post(
        f"/api/notebooks/{nb['id']}/cards/{cid}/review", json={"rating": "good"}
    ).json()
    assert good["review_count"] == 2
    assert good["interval_days"] > 0

    prev_interval = good["interval_days"]
    easy = client.post(
        f"/api/notebooks/{nb['id']}/cards/{cid}/review", json={"rating": "easy"}
    ).json()
    assert easy["review_count"] == 3
    assert easy["interval_days"] > prev_interval

    hard = client.post(
        f"/api/notebooks/{nb['id']}/cards/{cid}/review", json={"rating": "hard"}
    ).json()
    assert hard["review_count"] == 4
    assert hard["interval_days"] > 0


def test_review_rejects_malformed_rating(client):
    nb = _nb(client)
    card = client.post(
        f"/api/notebooks/{nb['id']}/cards",
        json={"front": "Q?", "back": "A."},
    ).json()
    resp = client.post(
        f"/api/notebooks/{nb['id']}/cards/{card['id']}/review",
        json={"rating": "superb"},
    )
    assert resp.status_code == 422
    assert client.post(
        f"/api/notebooks/{nb['id']}/cards/{card['id']}/review", json={}
    ).status_code == 422


def test_review_queue_lists_due_first(client):
    nb = _nb(client)
    c1 = client.post(
        f"/api/notebooks/{nb['id']}/cards",
        json={"front": "Due card?", "back": "Yes."},
    ).json()
    c2 = client.post(
        f"/api/notebooks/{nb['id']}/cards",
        json={"front": "Later card?", "back": "Later."},
    ).json()
    # Push c2 into the future with an easy rating chain.
    client.post(
        f"/api/notebooks/{nb['id']}/cards/{c2['id']}/review", json={"rating": "easy"}
    )
    queue = client.get(f"/api/notebooks/{nb['id']}/cards/review").json()
    ids = [c["id"] for c in queue]
    assert c1["id"] in ids
    # Due card sorts before the far-future card (or future card is excluded).
    assert ids[0] == c1["id"]


def test_suggestions_grounded_with_provenance_and_dedup(client):
    nb = _nb(client)
    _add_source(client, nb["id"])
    _add_source(
        client,
        nb["id"],
        title="Mitosis notes",
        text=(
            "Mitosis divides the nucleus into two identical sets. "
            "Chromosomes condense during prophase for orderly separation."
        ),
    )
    resp = client.get(f"/api/notebooks/{nb['id']}/cards/suggestions?limit=5")
    assert resp.status_code == 200, resp.text
    suggestions = resp.json()
    assert 1 <= len(suggestions) <= 5
    for s in suggestions:
        assert s["front"].strip() and s["back"].strip()
        assert s["source_id"] and s["source_title"]
    fronts = [s["front"].strip().lower() for s in suggestions]
    assert len(set(fronts)) == len(fronts)
    # Nothing is persisted until the client creates a card.
    assert client.get(f"/api/notebooks/{nb['id']}/cards").json() == []


def test_suggestions_limit_enforced(client):
    nb = _nb(client)
    _add_source(client, nb["id"])
    assert client.get(
        f"/api/notebooks/{nb['id']}/cards/suggestions?limit=50"
    ).status_code == 422
    ok = client.get(f"/api/notebooks/{nb['id']}/cards/suggestions?limit=2").json()
    assert len(ok) <= 2


def test_suggestions_no_sources(client):
    nb = _nb(client)
    resp = client.get(f"/api/notebooks/{nb['id']}/cards/suggestions")
    assert resp.status_code == 400


def test_blank_card_content_rejected(client):
    nb = _nb(client)
    assert client.post(
        f"/api/notebooks/{nb['id']}/cards", json={"front": "   ", "back": "A."}
    ).status_code == 422
    assert client.post(
        f"/api/notebooks/{nb['id']}/cards", json={"front": "Q?", "back": "   "}
    ).status_code == 422


def test_review_and_suggest_enforce_ownership(client, data_dir, monkeypatch):
    from fastapi.testclient import TestClient

    from api.main import app

    nb = _nb(client)
    card = client.post(
        f"/api/notebooks/{nb['id']}/cards",
        json={"front": "Q?", "back": "A."},
    ).json()
    _add_source(client, nb["id"])

    with TestClient(app) as anon:
        other = anon.post(
            "/api/auth/register",
            json={"email": "other@example.com", "password": "password123"},
        )
        assert other.status_code == 201
        token = other.json()["token"]
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as outsider:
        assert outsider.get(f"/api/notebooks/{nb['id']}/cards/review").status_code == 404
        assert outsider.post(
            f"/api/notebooks/{nb['id']}/cards/{card['id']}/review",
            json={"rating": "good"},
        ).status_code == 404
        assert outsider.get(
            f"/api/notebooks/{nb['id']}/cards/suggestions"
        ).status_code == 404
        # Cross-notebook card id must also 404.
        foreign_nb = outsider.post("/api/notebooks", json={"name": "Foreign"}).json()
        assert client.post(
            f"/api/notebooks/{foreign_nb['id']}/cards/{card['id']}/review",
            json={"rating": "good"},
        ).status_code == 404


PHOTO_TEXT = (
    "Photosynthesis converts light energy into chemical energy in chloroplasts. "
    "Photosynthesis sustains plant growth through glucose production. "
    "Cellular respiration releases energy from glucose for cellular work. "
    "Respiration supports maintenance and growth in plant tissues. "
)


def test_suggestions_use_surface_forms_not_stems(client):
    import re

    nb = _nb(client, name="SuggestSurface")
    src = _add_source(client, nb["id"], title="Bio notes", text=PHOTO_TEXT)
    resp = client.get(f"/api/notebooks/{nb['id']}/cards/suggestions?limit=5")
    assert resp.status_code == 200, resp.text
    suggestions = resp.json()
    assert suggestions
    chunks_body = client.get(f"/api/sources/{src['id']}/chunks").json()
    chunk_list = chunks_body["chunks"] if isinstance(chunks_body, dict) else chunks_body
    chunk_texts = " ".join(c["text"] for c in chunk_list)
    for s in suggestions:
        assert not re.search(r"\bphotosynthesi\b", s["front"].lower())
        assert not re.search(r"\brespirate\b", s["front"].lower())
        assert s["back"] in chunk_texts
    fronts = " ".join(s["front"].lower() for s in suggestions)
    assert "photosynthesis" in fronts or "respiration" in fronts
