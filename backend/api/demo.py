"""One-click demo notebook so a new student can try every workflow with no setup.

All content is original, keyless, and local: three short study sources, a starter
outline, and memory notes. Nothing is fetched and no key is needed.
"""
from __future__ import annotations

from fastapi import FastAPI

from api.deps import get_store
from core import ingest
from core.models import Notebook, OutlineField, OutlineItem, ResearchOutline, utcnow
from core.store import new_id


def _short_id() -> str:
    return new_id()[:8]


DEMO_SOURCES: list[tuple[str, str]] = [
    (
        "Photosynthesis in one page",
        """Photosynthesis converts light energy into chemical energy stored as glucose.
It happens in chloroplasts, mostly in leaf mesophyll cells. Chlorophyll a absorbs
mostly red and blue light and reflects green, which is why plants look green.

The process has two stages. The light-dependent reactions run in the thylakoid
membranes: water is split (photolysis), releasing oxygen, and the energy is stored
briefly as ATP and NADPH. The Calvin cycle runs in the stroma: carbon dioxide is
fixed by the enzyme RuBisCO and, using ATP and NADPH, built into three-carbon
sugars that later form glucose.

Overall equation: 6CO2 + 6H2O + light -> C6H12O6 + 6O2.

Rate factors to remember: light intensity (up to a saturation point), carbon
dioxide concentration, temperature (enzymes denature when too hot), and water
supply (stomata close when dry, which blocks CO2 entry). C4 plants like maize
concentrate CO2 to cut photorespiration losses in hot climates.""",
    ),
    (
        "Mitosis in one page",
        """Mitosis divides one nucleus into two genetically identical nuclei. It is
followed by cytokinesis, which splits the cytoplasm. The stages form the PMAT
sequence students memorize: prophase, metaphase, anaphase, telophase.

In prophase, chromatin condenses into visible chromosomes, each made of two sister
chromatids joined at the centromere, and the nuclear envelope breaks down. In
metaphase, spindle fibers pull chromosomes onto the metaphase plate at the cell
equator. In anaphase, sister chromatids separate and move to opposite poles. In
telophase, nuclear envelopes reform around each set and chromosomes decondense.

Checkpoints guard the cycle: G1 (cell size and nutrients), G2/M (DNA replication
complete, damage repaired), and the spindle checkpoint in metaphase (every
chromosome attached). Cancer is often a failure of these checkpoints, letting
damaged cells divide. Mitosis produces two diploid cells for growth and repair;
meiosis, by contrast, produces four haploid cells for reproduction.""",
    ),
    (
        "How to study from sources",
        """Active recall beats rereading. After reading a page, close it and write down
everything you remember before checking what you missed. The gaps you find are
exactly what to put on flashcards.

Space repetitions instead of cramming: review new cards after one day, then three
days, then a week. Short daily sessions beat one long night before the exam.

Interleave topics. Studying photosynthesis and respiration side by side forces you
to notice contrasts, like chloroplasts versus mitochondria, which mixed practice
locks in better than blocked practice.

Elaborate while you read. Ask why each fact is true and how it connects to
something you already know. A fact with two connections is roughly twice as easy
to recall as an isolated one.

Sleep consolidates memory. An all-nighter trades tomorrow's recall for tonight's
familiarity, which is a bad trade before an exam.""",
    ),
]

DEMO_ITEMS = ["Photosynthesis", "Mitosis", "Active recall", "Spaced repetition"]
DEMO_FIELDS = ["Definition", "Key steps", "Common exam traps"]
DEMO_MEMORY = "Bio 101, midterm covers cells and energetics, prefer bullet points."


def register(app: FastAPI) -> None:
    @app.post("/api/demo", response_model=Notebook, status_code=201)
    def create_demo():
        store = get_store(app)
        notebook = store.create_notebook("Cell biology demo")
        for title, text in DEMO_SOURCES:
            ingest.ingest_text(store, notebook.id, title, text)
        now = utcnow()
        outline = ResearchOutline(
            id=new_id(),
            notebook_id=notebook.id,
            topic="cell biology midterm",
            items=[OutlineItem(id=_short_id(), label=label) for label in DEMO_ITEMS],
            fields=[OutlineField(id=_short_id(), label=label) for label in DEMO_FIELDS],
            created_at=now,
            updated_at=now,
        )
        store.save_outline(outline)
        store.set_memory(notebook.id, DEMO_MEMORY)
        return notebook
