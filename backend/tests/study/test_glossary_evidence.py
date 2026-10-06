from core.models import Chunk, Source, utcnow
from core.study import build_glossary, build_quiz


def _source(text: str) -> Source:
    return Source(id="a" * 12, notebook_id="b" * 12, kind="paste",
                  title="Biology", created_at=utcnow(),
                  chunks=[Chunk(seq=0, pages=[7], text=text)])


def test_practice_answer_uses_the_sentence_about_its_topic():
    opening = "Photosynthesis turns light into chemical energy inside plant cells."
    evidence = "Chlorophyll pigments capture photons inside the thylakoid membranes."
    source = _source(f"{opening} {evidence}")

    entries = {entry["term"].lower(): entry for entry in build_glossary([source])}
    chlorophyll = entries["chlorophyll"]
    assert chlorophyll["explanation"] == evidence
    assert chlorophyll["pages"] == [7]
    questions = build_quiz([source], limit=20)
    question = next(item for item in questions if item["term"].lower() == "chlorophyll")
    if question["question_type"] == "short_answer":
        assert question["answer"] == evidence
    else:
        assert "capture photons" in question["prompt"]


def test_long_evidence_keeps_the_topic_inside_the_excerpt():
    text = ("Background information for this lecture provides context and framing " * 8
            + "chlorophyll captures photons in the thylakoid membranes during photosynthesis.")
    source = _source(text)

    entries = {entry["term"].lower(): entry for entry in build_glossary([source], limit=30)}

    explanation = entries["chlorophyll"]["explanation"]
    assert "chlorophyll captures photons" in explanation
    assert len(explanation) <= 280
    assert explanation in text
