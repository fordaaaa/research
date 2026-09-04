from core.chunker import TARGET, chunk_pages
from core.models import Page


def _page(text: str, number: int = 1) -> Page:
    return Page(number=number, text=text)


def _repeated(sentence: str, n: int) -> str:
    return " ".join(sentence for _ in range(n))


def test_empty_page_yields_no_chunks():
    assert chunk_pages([_page("   \n  ")]) == []


def test_short_text_single_chunk():
    chunks = chunk_pages([_page("Photosynthesis converts light into chemical energy.")])
    assert len(chunks) == 1
    assert chunks[0].pages == [1]
    assert "Photosynthesis" in chunks[0].text


def test_chunks_respect_target_size():
    text = _repeated("Sentence number ten explains a small fact.", 200)
    chunks = chunk_pages([_page(text)])
    assert len(chunks) > 1
    for c in chunks:
        assert len(c.text) <= TARGET + 100  # +100 allows the trailing merge
    assert all(len(c.text) > TARGET / 3 for c in chunks[:-1])


def test_chunks_never_span_pages():
    pages = [_page(_repeated(f"Page {n} fact with detail.", 120), number=n) for n in (1, 2, 3)]
    chunks = chunk_pages(pages)
    assert len(chunks) > 3
    for c in chunks:
        assert len(c.pages) == 1
    seqs = [c.pages[0] for c in chunks]
    assert seqs == sorted(seqs)


def test_consecutive_chunks_overlap():
    text = _repeated("The chloroplast absorbs sunlight for energy.", 100)
    chunks = chunk_pages([_page(text)])
    assert len(chunks) > 1
    assert chunks[1].text[:40] in chunks[0].text


def test_long_sentence_is_hard_split():
    text = " ".join(["word"] * 900)  # one giant "sentence", ~3600 chars
    chunks = chunk_pages([_page(text)])
    assert len(chunks) >= 3
    assert all(len(c.text) <= TARGET for c in chunks)
