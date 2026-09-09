"""Local skills library and per-notebook memory. All reads/writes are keyless;
skills and memory only reach a provider inside the AI endpoints that use them."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException

from api.deps import get_store, notebook_or_404, safe_id
from core.models import MemoryResponse, MemoryUpdate, Skill, SkillCreate, SkillUpdate, utcnow
from core.store import new_id


def _clean_triggers(triggers: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for trigger in triggers:
        clean = " ".join(trigger.split()).lower()
        if clean and clean not in seen:
            seen.add(clean)
            out.append(clean)
    return out


def register(app: FastAPI) -> None:
    @app.get("/api/skills", response_model=list[Skill])
    def list_skills():
        return get_store(app).list_skills()

    @app.post("/api/skills", response_model=Skill, status_code=201)
    def create_skill(body: SkillCreate):
        now = utcnow()
        skill = Skill(
            id=new_id(),
            name=body.name.strip(),
            instructions=body.instructions.strip(),
            triggers=_clean_triggers(body.triggers),
            created_at=now,
            updated_at=now,
        )
        return get_store(app).save_skill(skill)

    @app.get("/api/skills/{skill_id}", response_model=Skill)
    def get_skill(skill_id: str):
        skill_id = safe_id(skill_id, "skill_id")
        skill = get_store(app).get_skill(skill_id)
        if skill is None:
            raise HTTPException(status_code=404, detail="skill not found")
        return skill

    @app.patch("/api/skills/{skill_id}", response_model=Skill)
    def update_skill(skill_id: str, body: SkillUpdate):
        skill_id = safe_id(skill_id, "skill_id")
        store = get_store(app)
        skill = store.get_skill(skill_id)
        if skill is None:
            raise HTTPException(status_code=404, detail="skill not found")
        if body.name is not None:
            skill.name = body.name.strip()
        if body.instructions is not None:
            skill.instructions = body.instructions.strip()
        if body.triggers is not None:
            skill.triggers = _clean_triggers(body.triggers)
        skill.updated_at = utcnow()
        return store.save_skill(skill)

    @app.delete("/api/skills/{skill_id}", status_code=204)
    def delete_skill(skill_id: str):
        skill_id = safe_id(skill_id, "skill_id")
        if not get_store(app).delete_skill(skill_id):
            raise HTTPException(status_code=404, detail="skill not found")

    @app.get("/api/notebooks/{notebook_id}/memory", response_model=MemoryResponse)
    def get_memory(notebook_id: str):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, notebook_id)
        return MemoryResponse(notes=store.get_memory(notebook_id))

    @app.put("/api/notebooks/{notebook_id}/memory", response_model=MemoryResponse)
    def put_memory(notebook_id: str, body: MemoryUpdate):
        notebook_id = safe_id(notebook_id, "notebook_id")
        store = get_store(app)
        notebook_or_404(store, notebook_id)
        return MemoryResponse(notes=store.set_memory(notebook_id, body.notes))
