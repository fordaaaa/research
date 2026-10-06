"""Practice variety: dedupe passages, due-card inclusion, fresh-first ranking.

Failing-first coverage for repeated-question quality without changing the
glossary endpoint or API shapes.
"""
from datetime import timedelta

from core.models import Chunk, Source, utcnow
from core.store import new_id


TEXT = (
    "Photosynthesis converts sunlight into chemical energy inside chloroplasts. "
    "Chlorophyll pigments capture photons in the thylakoid membranes. "
    "Mitochondria release energy from glucose during cellular respiration. "
    "Meiosis produces four haploid cells with half the chromosomes."
)


def _norm(text: str) -> str:
    return " ".join(text.lower().split())


def _support(task: dict) -> str:
    if "____" in task["prompt"]:
        return _norm(task["prompt"].replace("____", task["answer"]))
    return _norm(task["answer"])


def _setup(client, *, minutes=20, text=TEXT, focus=None):
    notebook = client.post("/api/notebooks", json={"name": "Variety"}).json()
    path = f"/api/notebooks/{notebook['id']}/coach"
    source = None
    if text is not None:
        source = client.post(
            f"/api/notebooks/{notebook['id']}/sources/text",
            json={"title": "Lecture", "text": text},
        ).json()
    goal = {
        "title": "Midterm",
        "exam_date": (utcnow().date() + timedelta(days=7)).isoformat(),
        "daily_minutes": minutes,
        "focus_topics": focus or [],
    }
    response = client.put(path + "/goal", json=goal)
    assert response.status_code == 200, response.text
    return notebook, path, source, goal


def _draft(client, path, **body):
    response = client.post(path + "/sessions", json=body)
    assert response.status_code in (200, 201), response.text
    return response.json()


def _start_single(client, path, session, task):
    response = client.post(
        f"{path}/sessions/{session['id']}/start", json={"task_ids": [task["id"]]}
    )
    assert response.status_code == 200, response.text
    return response.json()


def _rate(client, path, session, task_id, rating):
    response = client.post(
        f"{path}/sessions/{session['id']}/attempts",
        json={"task_id": task_id, "rating": rating, "response": "My answer."},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_missed_flashcard_uses_edited_content_in_next_session(client):
    notebook, path, _, _ = _setup(client, text=None)
    cards_path = f"/api/notebooks/{notebook['id']}/cards"
    card = client.post(cards_path, json={"front": "ATP", "back": "Old answer"}).json()
    first = _draft(client, path)
    task = first["tasks"][0]
    _start_single(client, path, first, task)
    _rate(client, path, first, task["id"], "revise")
    assert client.post(f"{path}/sessions/{first['id']}/finish", json={}).status_code == 200
    updated = client.patch(cards_path + "/" + card["id"], json={"front": "ATP definition", "back": "Adenosine triphosphate"})
    assert updated.status_code == 200, updated.text
    next_session = _draft(client, path)
    next_task = next_session["tasks"][0]
    assert next_task["card_id"] == card["id"]
    assert next_task["prompt"] == "ATP definition"
    assert next_task["answer"] == "Adenosine triphosphate"
    assert next_task["reason"].startswith("Revisit")


def test_basic_session_dedupes_identical_passages(client):
    _, path, _, _ = _setup(client, minutes=20)
    session = _draft(client, path)
    assert session["tasks"], "tiny/basic material must still yield practice"
    supports = [_support(task) for task in session["tasks"]]
    assert len(set(supports)) == len(supports), (
        f"basic session repeats identical passages: {supports}"
    )


def test_basic_session_dedupes_near_identical_passages(client):
    import difflib

    notebook, path, _, _ = _setup(client, minutes=40, text=None)
    store = client.app.state.store
    first = (
        "Photosynthesis converts sunlight into chemical energy inside chloroplasts with enzymes."
    )
    second = (
        "Photosynthesis converts sunlight into chemical energy inside chloroplasts with tissues."
    )
    source = Source(
        id=new_id(),
        notebook_id=notebook["id"],
        kind="paste",
        title="Lecture",
        created_at=utcnow(),
        chunks=[Chunk(seq=0, pages=[1], text=f"{first} {second}")],
    )
    store.create_source(source)
    session = _draft(client, path)
    assert session["tasks"]
    supports = [_support(task) for task in session["tasks"]]
    for index, left in enumerate(supports):
        for right in supports[index + 1 :]:
            ratio = difflib.SequenceMatcher(None, left, right).ratio()
            assert ratio < 0.9, (
                f"near-identical passages repeat (ratio {ratio:.2f}): {left!r} vs {right!r}"
            )


def test_due_cards_are_not_starved_by_quiz(client):
    notebook, path, _, _ = _setup(client, minutes=8)
    for front, back in [
        ("What is osmosis?", "Movement of water through a selectively permeable membrane."),
        ("What is diffusion?", "Movement of particles from high to low concentration."),
    ]:
        response = client.post(
            f"/api/notebooks/{notebook['id']}/cards", json={"front": front, "back": back}
        )
        assert response.status_code in (200, 201), response.text
    session = _draft(client, path)
    assert session["tasks"]
    assert any(task.get("card_id") for task in session["tasks"]), (
        "due cards starved: quiz filled the time budget with no card practice"
    )


def test_fresh_topic_preferred_after_got_it(client):
    _, path, _, _ = _setup(client, minutes=20)
    first = _draft(client, path)
    assert len(first["tasks"]) >= 2, "need multiple topics to test fresh preference"
    old_topic = first["tasks"][0]["topic"]
    active = _start_single(client, path, first, first["tasks"][0])
    _rate(client, path, active, active["tasks"][0]["id"], "got_it")
    assert client.post(f"{path}/sessions/{first['id']}/finish", json={}).status_code == 200
    second = _draft(client, path)
    assert second["tasks"]
    assert second["tasks"][0]["topic"] != old_topic, (
        f"got_it topic repeats first: {old_topic!r} still leads {second['tasks'][0]['topic']!r}"
    )


def test_focus_and_missed_outrank_due_and_fresh(client):
    _, path, source, _ = _setup(client, minutes=20)
    first = _draft(client, path)
    photo_task = next(
        task for task in first["tasks"] if "photosynthesi" in task["topic"].lower()
    )
    active = _start_single(client, path, first, photo_task)
    _rate(client, path, active, active["tasks"][0]["id"], "revise")
    assert client.post(f"{path}/sessions/{first['id']}/finish", json={}).status_code == 200
    # Remove the original source so retry is filtered; ranking must still
    # prefer the missed/focus topics found in current material over frequent fresh.
    assert client.delete(f"/api/sources/{source['id']}").status_code == 204
    store = client.app.state.store
    # Find notebook id from path.
    notebook_id = path.split("/")[3]
    fresh = "Quantum entanglement links particles across distances. " * 6
    rare_missed = "Photosynthesis converts sunlight into chemical energy inside chloroplasts."
    rare_focus = "Meiosis produces four haploid cells with half the chromosomes."
    combined = Source(
        id=new_id(),
        notebook_id=notebook_id,
        kind="paste",
        title="Lecture 2",
        created_at=utcnow(),
        chunks=[
            Chunk(seq=0, pages=[1], text=fresh + " " + rare_missed + " " + rare_focus),
        ],
    )
    store.create_source(combined)
    card = client.post(
        f"/api/notebooks/{notebook_id}/cards",
        json={"front": "What is osmosis?", "back": "Movement of water through a membrane."},
    ).json()
    assert card["id"]
    # Explicit focus plus persisted missed must both outrank due/fresh.
    goal_update = {
        "title": "Midterm",
        "exam_date": (utcnow().date() + timedelta(days=7)).isoformat(),
        "daily_minutes": 20,
        "focus_topics": ["Meiosis"],
    }
    assert client.put(path + "/goal", json=goal_update).status_code == 200
    session = _draft(client, path)
    assert session["tasks"]
    topics = [task["topic"].lower() for task in session["tasks"]]
    assert any("photosynthesi" in topic for topic in topics[:2]), (
        f"missed did not take precedence over frequent fresh: {topics}"
    )
    assert any("meiosi" in topic for topic in topics[:2]), (
        f"focus did not take precedence over frequent fresh: {topics}"
    )


def test_tiny_material_still_usable(client):
    _, path, _, _ = _setup(
        client, minutes=20, text="Osmosis moves water through membranes."
    )
    session = _draft(client, path)
    assert session["tasks"], "tiny material must still yield a usable session"
    assert sum(task["minutes"] for task in session["tasks"]) <= 20
    assert all(task["source_id"] for task in session["tasks"])


def test_changed_deleted_sources_handled(client):
    notebook, path, source, _ = _setup(client, minutes=20)
    first = _draft(client, path)
    active = _start_single(client, path, first, first["tasks"][0])
    _rate(client, path, active, active["tasks"][0]["id"], "revise")
    assert client.post(f"{path}/sessions/{first['id']}/finish", json={}).status_code == 200
    assert client.delete(f"/api/sources/{source['id']}").status_code == 204
    card = client.post(
        f"/api/notebooks/{notebook['id']}/cards",
        json={"front": "What is osmosis?", "back": "Movement of water through a membrane."},
    ).json()
    session = _draft(client, path)
    assert session["tasks"], "deleted sources must fall back to remaining cards/material"
    assert all(task["source_id"] != source["id"] for task in session["tasks"])
    assert any(task.get("card_id") == card["id"] for task in session["tasks"])


def test_all_practised_returns_review_session(client):
    _, path, _, _ = _setup(
        client, minutes=20, text="Osmosis moves water through membranes."
    )
    first = _draft(client, path)
    assert first["tasks"]
    active = client.post(
        f"{path}/sessions/{first['id']}/start",
        json={"task_ids": [task["id"] for task in first["tasks"]]},
    )
    assert active.status_code == 200, active.text
    active_session = active.json()
    for task in active_session["tasks"]:
        _rate(client, path, active_session, task["id"], "got_it")
    assert client.post(f"{path}/sessions/{first['id']}/finish", json={}).status_code == 200
    second = _draft(client, path)
    assert second["tasks"], "all practised must keep a valid session, not empty"
    assert any("review" in task["reason"].lower() for task in second["tasks"]), (
        f"expected honest review reason, got: {[task['reason'] for task in second['tasks']]}"
    )


def test_basic_first_question_names_the_concept_not_a_repeated_verb(client):
    _, path, _, _ = _setup(client, minutes=5)
    session = _draft(client, path)
    assert session["tasks"][0]["topic"] in {"Photosynthesis", "Chlorophyll", "Mitochondria", "Meiosis"}
