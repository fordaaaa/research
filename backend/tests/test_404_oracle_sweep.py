"""404-oracle sweep: malformed ids return bodies identical to well-formed foreign ids."""
from __future__ import annotations

FOREIGN = "deadbeefcafe"  # well-formed 12-hex, absent
MALFORMED = "notahexid!!"  # not 12-hex


def _setup(client):
    nb = client.post("/api/notebooks", json={"name": "Sweep"}).json()
    nid = nb["id"]
    src = client.post(
        f"/api/notebooks/{nid}/sources/text",
        json={"title": "T", "text": "sweep fixture content here"},
    ).json()
    note = client.post(
        f"/api/notebooks/{nid}/notes", json={"title": "nt", "body": "b"}
    ).json()
    card = client.post(
        f"/api/notebooks/{nid}/cards", json={"front": "f", "back": "b"}
    ).json()
    outline = client.post(
        f"/api/notebooks/{nid}/outlines",
        json={"topic": "sweep topic", "items": [], "fields": []},
    ).json()
    skill = client.post(
        "/api/skills", json={"name": "s", "instructions": "do x", "triggers": []}
    ).json()
    session = client.post(
        f"/api/notebooks/{nid}/chat/sessions", json={"title": "t"}
    ).json()
    return {
        "nid": nid,
        "sid": src["id"],
        "note": note["id"],
        "card": card["id"],
        "outline": outline["id"],
        "skill": skill["id"],
        "session": session["id"],
    }


def _routes(fx):
    nid = fx["nid"]
    n = lambda p: p  # noqa: E731 - placeholder
    _ = n
    return [
        ("GET", f"/api/notebooks/{FOREIGN}", None, f"/api/notebooks/{MALFORMED}", None),
        ("GET", f"/api/notebooks/{FOREIGN}/export", None, f"/api/notebooks/{MALFORMED}/export", None),
        ("GET", f"/api/notebooks/{FOREIGN}/sources", None, f"/api/notebooks/{MALFORMED}/sources", None),
        ("POST", f"/api/notebooks/{FOREIGN}/sources/text", {"title": "x", "text": "y"},
         f"/api/notebooks/{MALFORMED}/sources/text", {"title": "x", "text": "y"}),
        ("GET", f"/api/notebooks/{FOREIGN}/notes", None, f"/api/notebooks/{MALFORMED}/notes", None),
        ("GET", f"/api/notebooks/{nid}/notes/{FOREIGN}", None, f"/api/notebooks/{nid}/notes/{MALFORMED}", None),
        ("PATCH", f"/api/notebooks/{nid}/notes/{FOREIGN}", {"base_rev": 1, "body": "x"},
         f"/api/notebooks/{nid}/notes/{MALFORMED}", {"base_rev": 1, "body": "x"}),
        ("DELETE", f"/api/notebooks/{nid}/notes/{FOREIGN}", None, f"/api/notebooks/{nid}/notes/{MALFORMED}", None),
        ("GET", f"/api/sources/{FOREIGN}", None, f"/api/sources/{MALFORMED}", None),
        ("GET", f"/api/sources/{FOREIGN}/chunks", None, f"/api/sources/{MALFORMED}/chunks", None),
        ("PATCH", f"/api/sources/{FOREIGN}", {"title": "x"}, f"/api/sources/{MALFORMED}", {"title": "x"}),
        ("DELETE", f"/api/sources/{FOREIGN}", None, f"/api/sources/{MALFORMED}", None),
        ("PATCH", f"/api/notebooks/{nid}/cards/{FOREIGN}", {"front": "x"},
         f"/api/notebooks/{nid}/cards/{MALFORMED}", {"front": "x"}),
        ("DELETE", f"/api/notebooks/{nid}/cards/{FOREIGN}", None, f"/api/notebooks/{nid}/cards/{MALFORMED}", None),
        ("POST", f"/api/notebooks/{nid}/cards/{FOREIGN}/review", {"rating": "good"},
         f"/api/notebooks/{nid}/cards/{MALFORMED}/review", {"rating": "good"}),
        ("GET", f"/api/notebooks/{nid}/outlines/{FOREIGN}", None, f"/api/notebooks/{nid}/outlines/{MALFORMED}", None),
        ("PATCH", f"/api/notebooks/{nid}/outlines/{FOREIGN}", {"topic": "new topic here"},
         f"/api/notebooks/{nid}/outlines/{MALFORMED}", {"topic": "new topic here"}),
        ("DELETE", f"/api/notebooks/{nid}/outlines/{FOREIGN}", None, f"/api/notebooks/{nid}/outlines/{MALFORMED}", None),
        ("GET", f"/api/skills/{FOREIGN}", None, f"/api/skills/{MALFORMED}", None),
        ("PATCH", f"/api/skills/{FOREIGN}", {"name": "x"}, f"/api/skills/{MALFORMED}", {"name": "x"}),
        ("DELETE", f"/api/skills/{FOREIGN}", None, f"/api/skills/{MALFORMED}", None),
        ("GET", f"/api/notebooks/{nid}/chat/sessions/{FOREIGN}", None,
         f"/api/notebooks/{nid}/chat/sessions/{MALFORMED}", None),
        ("DELETE", f"/api/notebooks/{nid}/chat/sessions/{FOREIGN}", None,
         f"/api/notebooks/{nid}/chat/sessions/{MALFORMED}", None),
        ("GET", f"/api/notebooks/{FOREIGN}/search", {"q": "x"}, f"/api/notebooks/{MALFORMED}/search", {"q": "x"}),
        ("GET", f"/api/notebooks/{FOREIGN}/cards", None, f"/api/notebooks/{MALFORMED}/cards", None),
        ("GET", f"/api/notebooks/{FOREIGN}/cards/review", None, f"/api/notebooks/{MALFORMED}/cards/review", None),
        ("GET", f"/api/notebooks/{FOREIGN}/cards/suggestions", None, f"/api/notebooks/{MALFORMED}/cards/suggestions", None),
        ("GET", f"/api/notebooks/{FOREIGN}/glossary", None, f"/api/notebooks/{MALFORMED}/glossary", None),
        ("GET", f"/api/notebooks/{FOREIGN}/quiz", None, f"/api/notebooks/{MALFORMED}/quiz", None),
        ("GET", f"/api/notebooks/{FOREIGN}/cards/export", None, f"/api/notebooks/{MALFORMED}/cards/export", None),
        ("GET", f"/api/notebooks/{FOREIGN}/guide", None, f"/api/notebooks/{MALFORMED}/guide", None),
        ("GET", f"/api/notebooks/{FOREIGN}/mindmap", None, f"/api/notebooks/{MALFORMED}/mindmap", None),
        ("GET", f"/api/notebooks/{FOREIGN}/mindmap/export", None, f"/api/notebooks/{MALFORMED}/mindmap/export", None),
        ("GET", f"/api/notebooks/{FOREIGN}/outlines", None, f"/api/notebooks/{MALFORMED}/outlines", None),
        ("GET", f"/api/notebooks/{FOREIGN}/chat/sessions", None, f"/api/notebooks/{MALFORMED}/chat/sessions", None),
        ("GET", f"/api/notebooks/{FOREIGN}/memory", None, f"/api/notebooks/{MALFORMED}/memory", None),
        ("PUT", f"/api/notebooks/{FOREIGN}/memory", {"notes": "x"}, f"/api/notebooks/{MALFORMED}/memory", {"notes": "x"}),
        ("DELETE", f"/api/notebooks/{FOREIGN}", None, f"/api/notebooks/{MALFORMED}", None),
    ]


def _send(client, method, url, payload):
    if payload is None:
        return client.request(method, url)
    if method == "GET":
        return client.request(method, url, params=payload)
    return client.request(method, url, json=payload)


def test_oracle_sweep_path_ids_identical_404_bodies(client):
    fx = _setup(client)
    for method, furl, fbody, murl, mbody in _routes(fx):
        foreign = _send(client, method, furl, fbody)
        malformed = _send(client, method, murl, mbody if mbody is not None else fbody)
        assert foreign.status_code == malformed.status_code, (method, furl, foreign.status_code, malformed.status_code)
        assert foreign.json() == malformed.json(), (method, furl)
        assert foreign.status_code == 404, (method, furl, foreign.status_code)


def test_oracle_sweep_before_cursor_identical_404_bodies(client):
    fx = _setup(client)
    base = f"/api/notebooks/{fx['nid']}/chat/sessions/{fx['session']}/messages"
    foreign = client.get(base, params={"before": FOREIGN})
    malformed = client.get(base, params={"before": MALFORMED})
    assert foreign.status_code == 404, foreign.text
    assert malformed.status_code == 404, malformed.text
    assert foreign.json() == malformed.json()
