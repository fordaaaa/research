from __future__ import annotations

import re

from core.models import Chunk, Page

TARGET = 1200  # target chunk size in characters
OVERLAP = 150  # characters of trailing overlap carried into the next chunk
MIN_CHUNK = 60  # trailing fragments smaller than this merge into the previous chunk
MAX_WORD = TARGET  # a single "sentence" longer than this is hard-split by words

_WHITESPACE = re.compile(r"[ \t]+")
_SENTENCE = re.compile(r"[^.!?\n]+[.!?]+[\"')\]]*|[^.!?\n]+")


def chunk_pages(pages: list[Page]) -> list[Chunk]:
    """Pack sentences into ~TARGET-char chunks, never spanning page boundaries."""
    chunks: list[Chunk] = []
    seq = 0
    for page in pages:
        text = _normalize(page.text)
        if not text:
            continue
        sentences = _split_sentences(text)
        parts = _pack(sentences)
        for part in parts:
            chunks.append(Chunk(seq=seq, pages=[page.number], text=part))
            seq += 1
    return chunks


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [_WHITESPACE.sub(" ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line).strip()


def _split_sentences(text: str) -> list[str]:
    return [m.group().strip() for m in _SENTENCE.finditer(text) if m.group().strip()]


def _pack(sentences: list[str]) -> list[str]:
    out: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for sentence in sentences:
        parts = (
            _split_long(sentence)
            if len(sentence) > MAX_WORD
            else [sentence]
        )
        for part in parts:
            if cur and cur_len + len(part) + 1 > TARGET:
                out.append(" ".join(cur))
                tail: list[str] = []
                tail_len = 0
                for t in reversed(cur):
                    if tail_len + len(t) + 1 > OVERLAP:
                        break
                    tail.insert(0, t)
                    tail_len += len(t) + 1
                cur, cur_len = tail, tail_len
            cur.append(part)
            cur_len += len(part) + 1
    if cur:
        out.append(" ".join(cur))
    if len(out) >= 2 and len(out[-1]) < MIN_CHUNK:
        out[-2] += " " + out.pop()
    return out


def _split_long(sentence: str, limit: int = TARGET) -> list[str]:
    words = sentence.split()
    if len(words) <= 1:
        return [sentence[i : i + limit] for i in range(0, len(sentence), limit)]
    parts: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for word in words:
        if cur and cur_len + len(word) + 1 > limit:
            parts.append(" ".join(cur))
            cur, cur_len = [], 0
        cur.append(word)
        cur_len += len(word) + 1
    if cur:
        parts.append(" ".join(cur))
    return parts
