"""Local-only settings storage for optional providers."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from core.models import AISettings, AISettingsUpdate


def _path(data_dir: Path) -> Path:
    return data_dir / "settings.json"


def _read(path: Path) -> dict[str, Any]:
    try:
        import json

        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def get_ai_settings(data_dir: Path) -> AISettings:
    data = _read(_path(data_dir)).get("ai", {})
    if not isinstance(data, dict) or not data.get("api_key"):
        return AISettings(configured=False)
    return AISettings(configured=True, provider="gemini", model=data.get("model", "gemini-2.5-flash"))


def save_ai_settings(data_dir: Path, body: AISettingsUpdate) -> AISettings:
    import json
    import os

    path = _path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"ai": body.model_dump()}, ensure_ascii=False))
    os.replace(tmp, path)
    return AISettings(configured=True, provider=body.provider, model=body.model)


def clear_ai_settings(data_dir: Path) -> None:
    path = _path(data_dir)
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def api_key(data_dir: Path) -> str | None:
    value = _read(_path(data_dir)).get("ai", {})
    key = value.get("api_key") if isinstance(value, dict) else None
    return key if isinstance(key, str) and key else None
