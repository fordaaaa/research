"""Study key-terms: common-words sentence must not leak junk terms."""


def test_r2_fox_sentence_yields_no_junk_terms():
    from core.models import Chunk, Source, utcnow
    from core.study import key_terms

    text = "The quick brown fox jumps over the lazy dog. " * 3
    src = Source(
        id="s1",
        notebook_id="n1",
        kind="paste",
        title="Fox",
        created_at=utcnow(),
        chunks=[Chunk(seq=0, pages=[1], text=text)],
    )
    terms = [t for t, _ in key_terms([src])]
    junk = {"quick", "brown", "fox", "jump", "jumps", "lazy"}
    assert not (set(terms) & junk), f"junk terms leaked: {terms}"
