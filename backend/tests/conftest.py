from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture()
def data_dir(tmp_path: Path) -> Path:
    return tmp_path / "data"


@pytest.fixture()
def client(data_dir: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("RESEARCH_DATA_DIR", str(data_dir))
    from fastapi.testclient import TestClient

    from api.main import app

    with TestClient(app) as c:
        yield c
