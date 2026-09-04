from __future__ import annotations

import io
import logging

import pymupdf
from docx import Document as DocxDocument
from docx.opc.exceptions import OpcError

from core.models import Page

logger = logging.getLogger(__name__)

MAX_BYTES = 50 * 1024 * 1024

_PDF_MAGIC = b"%PDF"
_ZIP_MAGIC = b"PK\x03\x04"

_EXT_KIND = {"pdf": "pdf", "docx": "docx", "txt": "txt", "md": "md", "markdown": "md"}
_CONTENT_TYPE_KIND = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/markdown": "md",
}


def detect_kind(filename: str | None, content_type: str | None, data: bytes) -> str | None:
    """Best-effort source kind from magic bytes, then extension, then content type."""
    if data.startswith(_PDF_MAGIC):
        return "pdf"
    if data.startswith(_ZIP_MAGIC):
        return "docx"  # OOXML zip; validated by the docx parser
    ext = (filename or "").rsplit(".", 1)[-1].lower() if filename and "." in filename else ""
    if ext in _EXT_KIND:
        return _EXT_KIND[ext]
    if content_type:
        base = content_type.split(";", 1)[0].strip().lower()
        if base in _CONTENT_TYPE_KIND:
            return _CONTENT_TYPE_KIND[base]
    return None


def parse(data: bytes, kind: str) -> list[Page]:
    """Parse source bytes into page-attributed text (empty page text is kept)."""
    if kind == "pdf":
        return _parse_pdf(data)
    if kind == "docx":
        return _parse_docx(data)
    if kind in ("txt", "md"):
        return _parse_text(data)
    raise ValueError(f"unsupported source kind: {kind}")


def _parse_pdf(data: bytes) -> list[Page]:
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except (pymupdf.FileDataError, pymupdf.EmptyFileError, RuntimeError, ValueError) as exc:
        logger.warning("invalid pdf upload (%d bytes): %s", len(data), exc)
        raise ValueError("invalid pdf") from exc
    pages = []
    for i, page in enumerate(doc):
        pages.append(Page(number=i + 1, text=page.get_text("text").strip()))
    doc.close()
    return pages


def _parse_docx(data: bytes) -> list[Page]:
    try:
        doc = DocxDocument(io.BytesIO(data))
    except (OpcError, KeyError, ValueError) as exc:
        logger.warning("invalid docx upload (%d bytes): %s", len(data), exc)
        raise ValueError("invalid docx") from exc
    text = "\n".join(p.text for p in doc.paragraphs).strip()
    return [Page(number=1, text=text)]


def _parse_text(data: bytes) -> list[Page]:
    return [Page(number=1, text=data.decode("utf-8", errors="replace").strip())]
