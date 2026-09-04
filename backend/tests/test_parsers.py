from __future__ import annotations

import io

import pymupdf
from docx import Document

from core import parsers


def _pdf_bytes() -> bytes:
    doc = pymupdf.open()
    for text in ("Page one discusses photosynthesis.", "Page two discusses chlorophyll."):
        page = doc.new_page()
        page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def _docx_bytes() -> bytes:
    doc = Document()
    doc.add_paragraph("A docx paragraph about mitochondria.")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_detect_pdf_by_magic():
    assert parsers.detect_kind("x.txt", None, b"%PDF-1.7 fake") == "pdf"


def test_detect_docx_by_zip_magic():
    assert parsers.detect_kind("x.bin", None, _docx_bytes()) == "docx"


def test_detect_md_by_extension():
    assert parsers.detect_kind("notes.md", None, b"# Title") == "md"


def test_detect_unknown():
    assert parsers.detect_kind(None, None, b"MZ\x90\x00garbage") is None


def test_parse_pdf_pages():
    pages = parsers.parse(_pdf_bytes(), "pdf")
    assert [p.number for p in pages] == [1, 2]
    assert "photosynthesis" in pages[0].text
    assert "chlorophyll" in pages[1].text


def test_parse_docx():
    pages = parsers.parse(_docx_bytes(), "docx")
    assert len(pages) == 1
    assert "mitochondria" in pages[0].text


def test_parse_txt_replacement_chars():
    pages = parsers.parse(b"caf\xe9 naive text", "txt")
    assert "caf" in pages[0].text


def test_parse_invalid_pdf_raises():
    try:
        parsers.parse(b"%PDF not really", "pdf")
        assert False, "expected ValueError"
    except ValueError:
        pass
