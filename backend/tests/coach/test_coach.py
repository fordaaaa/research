from datetime import timedelta
import json

import pytest

from core import providers
from core.models import utcnow
from core.store import Store


TEXT = (
    "Photosynthesis converts sunlight into chemical energy inside chloroplasts. "
    "Chlorophyll pigments capture photons in the thylakoid membranes. "
    "Mitochondria release energy from glucose during cellular respiration. "
    "Meiosis produces four haploid cells with half the chromosomes."
)


def setup(client, *, minutes=20, material=True):
    notebook = client.post("/api/notebooks", json={"name": "Biology exam"}).json()
    path = f"/api/notebooks/{notebook['id']}/coach"
    source = None
    if material:
        source = client.post(f"/api/notebooks/{notebook['id']}/sources/text", json={
            "title": "Lecture", "text": TEXT,
        }).json()
    goal = {"title": "Biology midterm", "exam_date": (utcnow().date() + timedelta(days=7)).isoformat(),
            "daily_minutes": minutes, "focus_topics": []}
    response = client.put(path + "/goal", json=goal)
    assert response.status_code == 200, response.text
    return notebook, path, source, goal


def draft(client, path, **body):
    response = client.post(path + "/sessions", json=body)
    assert response.status_code in (200, 201), response.text
    return response.json()


def start(client, path, session, ids=None):
    response = client.post(f"{path}/sessions/{session['id']}/start", json={
        "task_ids": ids or [task["id"] for task in session["tasks"]],
    })
    assert response.status_code == 200, response.text
    return response.json()


def rate(client, path, session, rating):
    task = session["tasks"][0]
    response = client.post(f"{path}/sessions/{session['id']}/attempts", json={
        "task_id": task["id"], "rating": rating, "response": "My answer before checking.",
    })
    assert response.status_code == 200, response.text
    return response.json()


def test_persisted_revision_loop_prioritizes_latest_missed_topic(client, monkeypatch):
    monkeypatch.setattr(providers, "generate", lambda *args: pytest.fail("basic study must not call AI"))
    notebook, path, source, goal = setup(client)
    session = draft(client, path)
    assert session["generated_by"] == "basic"
    assert 1 <= len(session["tasks"]) <= 10
    assert sum(task["minutes"] for task in session["tasks"]) <= goal["daily_minutes"]
    assert all(task["source_id"] == source["id"] for task in session["tasks"])
    active = start(client, path, session, [session["tasks"][0]["id"]])
    assert active["status"] == "active"
    attempted = rate(client, path, active, "revise")
    uid = client.app.state.store.get_session_user(client.headers["authorization"].split()[1]).id
    persisted = Store(root=client.app.state.store.root).get_coach_state(uid, notebook["id"])
    assert persisted.sessions[0].attempts[0].response == "My answer before checking."
    finished = client.post(f"{path}/sessions/{session['id']}/finish", json={})
    assert finished.status_code == 200
    assert finished.json()["status"] == "completed"
    assert finished.json()["completed_at"]
    next_session = draft(client, path)
    assert next_session["tasks"][0]["topic"] == attempted["tasks"][0]["topic"]
    assert "missed" in next_session["tasks"][0]["reason"].lower()
    active = start(client, path, next_session, [next_session["tasks"][0]["id"]])
    rate(client, path, active, "got_it")
    assert client.post(f"{path}/sessions/{active['id']}/finish", json={}).status_code == 200
    third = draft(client, path)
    old_topic = attempted["tasks"][0]["topic"]
    assert all("missed" not in task["reason"].lower() for task in third["tasks"] if task["topic"] == old_topic)


def test_draft_selection_snapshot_and_incomplete_finish(client):
    _, path, _, goal = setup(client)
    session = draft(client, path)
    ids = [task["id"] for task in reversed(session["tasks"][:2])]
    assert len(ids) == 2
    updated = {**goal, "title": "Final exam", "daily_minutes": 5}
    assert client.put(path + "/goal", json=updated).status_code == 200
    active = start(client, path, session, ids)
    assert [task["id"] for task in active["tasks"]] == ids
    assert active["goal"] == goal
    assert client.post(f"{path}/sessions/{session['id']}/finish", json={}).status_code == 409
    assert client.post(path + "/sessions", json={}).status_code == 409
    assert client.post(f"{path}/sessions/{session['id']}/start", json={"task_ids": ids[::-1]}).status_code == 409


def test_duplicate_attempt_and_finish_do_not_duplicate_progress(client):
    notebook, path, _, _ = setup(client)
    session = draft(client, path)
    active = start(client, path, session, [session["tasks"][0]["id"]])
    rate(client, path, active, "got_it")
    retried = rate(client, path, active, "got_it")
    assert len(retried["attempts"]) == 1
    endpoint = f"{path}/sessions/{session['id']}/finish"
    first = client.post(endpoint, json={}).json()
    assert client.post(endpoint, json={}).json() == first
    uid = client.app.state.store.get_session_user(client.headers["authorization"].split()[1]).id
    days = client.app.state.store.list_activity_days(uid, utcnow().date().isoformat())
    assert days[0].reviews == 1
    assert client.post(f"{path}/sessions/{session['id']}/attempts", json={
        "task_id": active["tasks"][0]["id"], "rating": "revise", "response": "Changed",
    }).status_code == 409
    assert client.delete(f"/api/notebooks/{notebook['id']}").status_code == 204
    with client.app.state.store._connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM coach_sessions").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM coach_goals").fetchone()[0] == 0


def test_basic_missing_material_and_invalid_goal(client):
    _, path, _, goal = setup(client, material=False)
    assert client.post(path + "/sessions", json={}).status_code == 400
    for changes in [{"daily_minutes": 0}, {"daily_minutes": 121}, {"title": "   "},
                    {"focus_topics": [" "]}, {"exam_date": "invalid-date"}]:
        assert client.put(path + "/goal", json={**goal, **changes}).status_code == 422


def test_every_coach_route_requires_auth_and_hides_other_owners(client):
    _, path, _, _ = setup(client)
    session = draft(client, path)
    task = session["tasks"][0]
    other = client.post("/api/auth/register", json={"email": "other-coach@example.test", "password": "password123"}).json()
    routes = [("GET", path, None), ("PUT", path + "/goal", session["goal"]),
              ("POST", path + "/sessions", {}),
              ("POST", f"{path}/sessions/{session['id']}/start", {"task_ids": [task["id"]]}),
              ("POST", f"{path}/sessions/{session['id']}/attempts", {"task_id": task["id"], "rating": "got_it", "response": "Answer"}),
              ("POST", f"{path}/sessions/{session['id']}/finish", {}),
              ("POST", f"{path}/sessions/{session['id']}/tasks/{task['id']}/explain", {})]
    for method, endpoint, body in routes:
        assert client.request(method, endpoint, json=body, headers={"Authorization": ""}).status_code == 401
        assert client.request(method, endpoint, json=body, headers={"Authorization": f"Bearer {other['token']}"}).status_code == 404


def test_ai_plan_uses_validated_source_evidence_and_explanation(client, monkeypatch):
    _, path, source, _ = setup(client)
    client.put("/api/settings/ai", json={"provider": "groq", "api_key": "gsk-test-key-long-enough"})
    payload = {"tasks": [{"topic": "Photosynthesis", "prompt": "What does photosynthesis convert?",
                          "answer": "Photosynthesis converts sunlight into chemical energy inside chloroplasts.",
                          "source_id": source["id"], "chunk_seq": 0}]}
    calls = []
    def generate(provider, key, model, prompt):
        calls.append(prompt)
        return json.dumps(payload), model
    monkeypatch.setattr(providers, "generate", generate)
    session = draft(client, path, use_ai=True)
    assert session["generated_by"] == "ai"
    assert session["tasks"][0]["source_id"] == source["id"]
    assert session["tasks"][0]["pages"] == [1]
    assert "gsk-test-key" not in calls[0]
    monkeypatch.setattr(providers, "generate", lambda provider, key, model, prompt: (json.dumps({"answer": "Sunlight is converted into stored chemical energy [1].", "evidence_quote": "Photosynthesis converts sunlight into chemical energy inside chloroplasts."}), model))
    task = session["tasks"][0]
    result = client.post(f"{path}/sessions/{session['id']}/tasks/{task['id']}/explain", json={"use_ai": True})
    assert result.status_code == 200
    assert result.json()["generated_by"] == "ai"
    assert result.json()["citations"][0]["source_id"] == source["id"]


@pytest.mark.parametrize("result", ["not json", '{"tasks": [{"source_id": "ffffffffffff", "chunk_seq": 0, "topic": "Fake", "prompt": "Fake?", "answer": "Invented"}]}', '{"tasks": []}'])
def test_ai_invalid_plan_falls_back_with_notice(client, monkeypatch, result):
    _, path, _, _ = setup(client)
    client.put("/api/settings/ai", json={"provider": "groq", "api_key": "gsk-test-key-long-enough"})
    monkeypatch.setattr(providers, "generate", lambda provider, key, model, prompt: (result, model))
    session = draft(client, path, use_ai=True)
    assert session["generated_by"] == "basic"
    assert session["notice"]
    assert session["tasks"]


def test_manual_flashcards_and_keyless_ai_request_remain_usable(client, monkeypatch):
    monkeypatch.setattr(providers, "generate", lambda *args: pytest.fail("no provider request without a key"))
    notebook, path, _, _ = setup(client, material=False)
    card = client.post(f"/api/notebooks/{notebook['id']}/cards", json={"front": "What is osmosis?", "back": "Movement of water through a selectively permeable membrane."}).json()
    session = draft(client, path, use_ai=True)
    assert session["generated_by"] == "basic" and session["notice"]
    assert session["tasks"][0]["card_id"] == card["id"]
    result = client.post(f"{path}/sessions/{session['id']}/tasks/{session['tasks'][0]['id']}/explain", json={"use_ai": True}).json()
    assert result["answer"] == card["back"] and result["notice"]


def test_same_user_cannot_mix_sessions_between_notebooks(client):
    _, first, _, _ = setup(client)
    _, second, _, _ = setup(client)
    session = draft(client, first)
    task = session["tasks"][0]
    for endpoint, body in [("start", {"task_ids": [task["id"]]}), ("attempts", {"task_id": task["id"], "rating": "revise", "response": "Answer"}), ("finish", {}), (f"tasks/{task['id']}/explain", {})]:
        assert client.post(f"{second}/sessions/{session['id']}/{endpoint}", json=body).status_code == 404


def test_ai_rejects_unsupported_answer_even_with_correct_source(client, monkeypatch):
    _, path, source, _ = setup(client)
    client.put("/api/settings/ai", json={"provider": "groq", "api_key": "gsk-test-key-long-enough"})
    payload = {"tasks": [{"topic": "Photosynthesis", "prompt": "What is it?", "answer": "Invented information absent from this source.", "source_id": source["id"], "chunk_seq": 0}]}
    monkeypatch.setattr(providers, "generate", lambda provider, key, model, prompt: (json.dumps(payload), model))
    session = draft(client, path, use_ai=True)
    assert session["generated_by"] == "basic" and session["notice"]
    assert all("Invented information" not in task["answer"] for task in session["tasks"])


def test_concurrent_attempts_and_finish_preserve_progress_once(client):
    from concurrent.futures import ThreadPoolExecutor
    from core.models import CoachAttemptInput
    notebook, path, _, _ = setup(client)
    session = draft(client, path)
    active = start(client, path, session, [task["id"] for task in session["tasks"][:2]])
    store = client.app.state.store
    uid = store.get_session_user(client.headers["authorization"].split()[1]).id
    def record(task):
        return Store(root=store.root).update_coach_session(uid, notebook["id"], session["id"], "attempt", attempt=CoachAttemptInput(task_id=task["id"], rating="revise", response="Saved concurrently"))
    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(record, active["tasks"]))
    assert len(store.get_coach_session(uid, notebook["id"], session["id"]).attempts) == 2
    def finish(_):
        return Store(root=store.root).update_coach_session(uid, notebook["id"], session["id"], "finish")
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(finish, range(2)))
    assert results[0] == results[1]
    assert store.list_activity_days(uid, utcnow().date().isoformat())[0].reviews == 1


def test_rare_focus_topic_is_practised_before_repetitive_material(client, monkeypatch):
    from core.models import Chunk, Source
    from core.store import new_id
    notebook, path, _, goal = setup(client, minutes=5, material=False)
    repetitive = "Chloroplast pigments absorb photons through membranes during photosynthesis while mitochondria release glucose energy during cellular respiration. Stomata regulate exchange through guard cells and tissues containing enzymes and proteins. "
    source = Source(id=new_id(), notebook_id=notebook["id"], kind="paste", title="Long lecture", created_at=utcnow(),
        chunks=[Chunk(seq=index, text=repetitive * 4, pages=[index + 1]) for index in range(100)] + [Chunk(seq=100, text="Meiosis produces four haploid cells with half the original chromosomes.", pages=[101])])
    store = client.app.state.store
    store.create_source(source)
    monkeypatch.setattr(store, "get_source", lambda *args: pytest.fail("coach must page sources"))
    assert client.put(path + "/goal", json={**goal, "focus_topics": ["Meiosis"]}).status_code == 200
    session = draft(client, path)
    assert session["tasks"][0]["topic"] == "Meiosis"
    assert session["tasks"][0]["pages"] == [101]


def test_missed_topic_memory_survives_history_window(client):
    from core.models import CoachAttempt, CoachSession
    notebook, path, _, _ = setup(client)
    old = draft(client, path)
    active = start(client, path, old, [old["tasks"][0]["id"]])
    rate(client, path, active, "revise")
    assert client.post(f"{path}/sessions/{old['id']}/finish", json={}).status_code == 200
    store = client.app.state.store
    uid = store.get_session_user(client.headers["authorization"].split()[1]).id
    for index in range(21):
        recent = CoachSession.model_validate(old).model_copy(deep=True)
        recent.id = f"{index:012x}"
        recent.status = "completed"
        recent.created_at = utcnow() + timedelta(seconds=index)
        recent.completed_at = recent.created_at
        recent.tasks = [recent.tasks[1].model_copy(update={"topic": "Different topic"})]
        recent.attempts = [CoachAttempt(task_id=recent.tasks[0].id, rating="got_it", response="Later answer", created_at=recent.created_at)]
        store.create_coach_session(uid, recent)
    assert len(client.get(path).json()["sessions"]) == 20
    next_plan = draft(client, path)
    assert "missed" in next_plan["tasks"][0]["reason"].lower()
    assert next_plan["tasks"][0]["topic"] == old["tasks"][0]["topic"]


@pytest.mark.parametrize("answer", ["Invented plain explanation [99]", '{"answer":"Wrong citation [2]","evidence_quote":"Photosynthesis converts sunlight into chemical energy inside chloroplasts."}', '{"answer":"Claim [1]","evidence_quote":"Invented unsupported quote"}'])
def test_invalid_ai_explanation_falls_back_to_reference(client, monkeypatch, answer):
    _, path, _, _ = setup(client)
    session = draft(client, path)
    client.put("/api/settings/ai", json={"provider": "groq", "api_key": "gsk-test-key-long-enough"})
    monkeypatch.setattr(providers, "generate", lambda provider, key, model, prompt: (answer, model))
    task = session["tasks"][0]
    response = client.post(f"{path}/sessions/{session['id']}/tasks/{task['id']}/explain", json={"use_ai": True}).json()
    assert response["generated_by"] == "basic"
    assert response["answer"] == task["answer"] and response["notice"]
