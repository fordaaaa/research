"""One-shot import of single-user JSON data (pre-auth format) into SQLite.

Reads notebooks.json, per-notebook meta/outlines/cards/memory/source files,
the global skills.json, and settings.json from a data dir, and stores them
under one user. Run once per data dir, then delete the JSON files.

Usage (from backend/):
    uv run python scripts/migrate_json_to_sqlite.py --email you@example.com --password secret123
    RESEARCH_DATA_DIR=/path/to/data uv run python scripts/migrate_json_to_sqlite.py --email ...
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.models import (  # noqa: E402
    Flashcard,
    OutlineField,
    OutlineItem,
    ResearchOutline,
    Skill,
    Source,
)
from core.store import Store, new_id  # noqa: E402


def _read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--data-dir", default=None)
    args = parser.parse_args()

    root = Path(args.data_dir or os.environ.get("RESEARCH_DATA_DIR") or Path("data"))
    store = Store(root=root)
    try:
        user = store.create_user(args.email, args.password)
    except ValueError:
        found = store.get_user_by_email(args.email)
        assert found is not None
        user = found[0]
        print(f"using existing user {user.email}")

    index = _read_json(root / "notebooks.json", [])
    nb_map: dict[str, str] = {}
    for row in index:
        old_id = row.get("id")
        nb = store.create_notebook(user.id, row.get("name", "Untitled"))
        if old_id:
            nb_map[old_id] = nb.id

    nb_dir = root / "notebooks"
    for old_id, new_id_ in nb_map.items():
        folder = nb_dir / old_id
        meta = _read_json(folder / "meta.json", {}).get("sources", [])
        for summary in meta:
            data = _read_json(folder / f"{summary.get('id')}.json", None)
            if not data:
                continue
            data["notebook_id"] = new_id_
            try:
                store.create_source(Source.model_validate(data))
            except Exception as exc:  # keep going; report the skip
                print(f"skip source {summary.get('id')}: {exc}")
        for row in _read_json(folder / "outlines.json", []):
            row["notebook_id"] = new_id_
            try:
                store.save_outline(
                    ResearchOutline(
                        id=row.get("id") or new_id(),
                        notebook_id=new_id_,
                        topic=row.get("topic", ""),
                        items=[OutlineItem.model_validate(i) for i in row.get("items", [])],
                        fields=[OutlineField.model_validate(f) for f in row.get("fields", [])],
                        created_at=row.get("created_at"),
                        updated_at=row.get("updated_at", row.get("created_at")),
                    )
                )
            except Exception as exc:
                print(f"skip outline {row.get('id')}: {exc}")
        for row in _read_json(folder / "cards.json", []):
            row["notebook_id"] = new_id_
            try:
                store.save_card(Flashcard.model_validate(row))
            except Exception as exc:
                print(f"skip card {row.get('id')}: {exc}")
        notes = _read_json(folder / "memory.json", {}).get("notes", "")
        if notes:
            store.set_memory(new_id_, notes)

    for row in _read_json(root / "skills.json", []):
        try:
            store.save_skill(
                Skill(
                    id=row.get("id") or new_id(),
                    user_id=user.id,
                    name=row.get("name", ""),
                    instructions=row.get("instructions", ""),
                    triggers=row.get("triggers", []),
                    created_at=row.get("created_at"),
                    updated_at=row.get("updated_at", row.get("created_at")),
                )
            )
        except Exception as exc:
            print(f"skip skill {row.get('id')}: {exc}")

    ai = _read_json(root / "settings.json", {}).get("ai", {})
    if isinstance(ai, dict) and ai.get("api_key"):
        from core.models import AISettingsUpdate  # noqa: E402

        store.save_ai_settings(
            user.id,
            AISettingsUpdate(
                provider=ai.get("provider", "gemini"),
                api_key=ai["api_key"],
                model=ai.get("model", "gemini-2.5-flash"),
            ),
        )
        print("imported AI settings (re-enter the key if it fails; it was stored as-is)")

    print(f"done: {len(nb_map)} notebooks imported for {user.email}")


if __name__ == "__main__":
    main()
