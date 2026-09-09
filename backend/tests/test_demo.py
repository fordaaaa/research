from __future__ import annotations


def test_demo_creates_notebook_with_content(client):
    response = client.post("/api/demo")
    assert response.status_code == 201, response.text
    notebook = response.json()
    assert notebook["name"] == "Cell biology demo"

    sources = client.get(f"/api/notebooks/{notebook['id']}/sources").json()
    assert len(sources) == 3
    assert {s["title"] for s in sources} == {
        "Photosynthesis in one page",
        "Mitosis in one page",
        "How to study from sources",
    }

    outlines = client.get(f"/api/notebooks/{notebook['id']}/outlines").json()
    assert len(outlines) == 1
    assert outlines[0]["items"]
    assert outlines[0]["fields"]

    memory = client.get(f"/api/notebooks/{notebook['id']}/memory").json()
    assert "Bio 101" in memory["notes"]
