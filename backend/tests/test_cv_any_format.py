"""A CV comes in whatever form the person keeps it in (Shivam, 2026-11-22).

`read_cv_file` is the one door: the bytes decide what the file is, never its name
or the browser's MIME. Text layers are read locally. A scan, a phone photo or a
screenshot has no text layer, so a vision model transcribes it, and from there it
is ordinary CV text. Only files we truly cannot read are refused, and the refusal
says what to do instead.
"""

from __future__ import annotations

import asyncio
import io

import pymupdf
import pytest

from app.services import cv_parser
from app.services.cv_parser import CVReaderUnavailable, UnsupportedCVFile, read_cv_file
from app.services.llm_provider import LLMProviderError

_CV_LINES = [
    "Asha Rao - Data Analyst",
    "Built the weekly sales dashboard in Power BI and SQL for 40 stores.",
    "Cut month-end reporting from three days to four hours with Python.",
]
_TRANSCRIPT = "\n".join(_CV_LINES)


class _Vision:
    """Records every call; answers with a transcript or fails like a provider outage."""

    def __init__(self, reply: str = _TRANSCRIPT, *, fail: bool = False) -> None:
        self.reply = reply
        self.fail = fail
        self.calls: list[list[dict]] = []

    async def complete(self, messages, max_tokens=4096, temperature=None) -> str:  # noqa: ANN001
        self.calls.append(messages)
        if self.fail:
            raise LLMProviderError("every vision provider failed")
        return self.reply

    def images_sent(self) -> list[str]:
        return [
            part["image_url"]["url"]
            for message in self.calls[-1]
            if isinstance(message["content"], list)
            for part in message["content"]
            if part["type"] == "image_url"
        ]


def _read(data: bytes, vision: _Vision) -> str:
    return asyncio.run(read_cv_file(data, vision=vision))


def _text_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    for i, line in enumerate(_CV_LINES):
        page.insert_text((72, 90 + 20 * i), line, fontsize=11)
    return doc.tobytes()


def _photo(fmt: str = "jpg") -> bytes:
    """A rendered CV page as image bytes: what a phone photo or screenshot is."""
    doc = pymupdf.open()
    page = doc.new_page()
    for i, line in enumerate(_CV_LINES):
        page.insert_text((72, 90 + 20 * i), line, fontsize=11)
    return page.get_pixmap(dpi=60).tobytes(fmt)


def _scanned_pdf(pages: int = 1) -> bytes:
    """A PDF whose pages are only pictures of text: what a scanner or a phone scan app makes."""
    doc = pymupdf.open()
    for _ in range(pages):
        doc.new_page().insert_image(pymupdf.Rect(0, 0, 595, 842), stream=_photo("png"))
    return doc.tobytes()


def _docx() -> bytes:
    from docx import Document

    doc = Document()
    for line in _CV_LINES:
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ── Files with a text layer are read here, never sent to the vision model ─────


def test_a_text_pdf_reads_locally() -> None:
    vision = _Vision()
    assert "Power BI and SQL" in _read(_text_pdf(), vision)
    assert vision.calls == []


def test_a_word_file_reads_locally() -> None:
    vision = _Vision()
    assert _read(_docx(), vision).splitlines() == _CV_LINES
    assert vision.calls == []


@pytest.mark.parametrize("encoded", [
    _TRANSCRIPT.encode("utf-8"),
    b"\xef\xbb\xbf" + _TRANSCRIPT.encode("utf-8"),
    _TRANSCRIPT.encode("utf-16"),
])
def test_a_plain_text_file_reads_as_its_text(encoded: bytes) -> None:
    vision = _Vision()
    assert _read(encoded, vision).splitlines() == _CV_LINES
    assert vision.calls == []


# ── Files with no text layer are transcribed by the vision model ──────────────


@pytest.mark.parametrize(("fmt", "mime"), [("jpg", "image/jpeg"), ("png", "image/png")])
def test_a_photo_of_a_cv_is_transcribed(fmt: str, mime: str) -> None:
    vision = _Vision()

    assert _read(_photo(fmt), vision) == _TRANSCRIPT
    [image] = vision.images_sent()
    assert image.startswith(f"data:{mime};base64,")


def test_a_webp_screenshot_is_transcribed() -> None:
    webp = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 24
    vision = _Vision()

    assert _read(webp, vision) == _TRANSCRIPT
    [image] = vision.images_sent()
    assert image.startswith("data:image/webp;base64,")


def test_a_scanned_pdf_sends_its_pages_as_pictures() -> None:
    vision = _Vision()

    assert _read(_scanned_pdf(pages=2), vision) == _TRANSCRIPT
    images = vision.images_sent()
    assert len(images) == 2
    assert all(url.startswith("data:image/jpeg;base64,") for url in images)


def test_a_long_scan_sends_only_its_first_pages() -> None:
    vision = _Vision()

    _read(_scanned_pdf(pages=6), vision)

    assert len(vision.images_sent()) == cv_parser.SCAN_PAGE_LIMIT


def test_a_photo_with_no_cv_on_it_reads_as_empty_text() -> None:
    assert _read(_photo(), _Vision(reply="   ")) == ""


def test_a_vision_outage_is_a_retryable_failure_not_an_unreadable_file() -> None:
    with pytest.raises(CVReaderUnavailable):
        _read(_photo(), _Vision(fail=True))


# ── Files nobody can read here are refused with what to do instead ────────────


def test_an_old_word_doc_is_refused_with_how_to_save_it() -> None:
    ole = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 512

    with pytest.raises(UnsupportedCVFile) as refused:
        _read(ole, _Vision())

    assert ".doc" in refused.value.message
    assert "PDF" in refused.value.message


@pytest.mark.parametrize("data", [
    b"GIF89a" + b"\x00\x01" * 64,
    bytes(range(256)) * 4,
    b"{\\rtf1\\ansi Asha Rao, Data Analyst}",
])
def test_bytes_that_are_no_format_we_read_are_refused(data: bytes) -> None:
    vision = _Vision()

    with pytest.raises(UnsupportedCVFile):
        _read(data, vision)
    assert vision.calls == []


def test_a_pdf_that_does_not_open_reads_as_empty_text() -> None:
    vision = _Vision()
    assert _read(b"%PDF-1.7 truncated in transit", vision) == ""
    assert vision.calls == []
