"""Unit tests for the Add-a-job file parser (detection + JSON lift)."""

import pytest

from app.services.job_file_parser import (
    JobFileParseError,
    _parse_fields_json,
    detect_file_kind,
)


def test_detect_pdf_by_magic_bytes():
    assert detect_file_kind(None, "x", b"%PDF-1.7\n...") == "pdf"


def test_detect_docx_by_magic_and_ext():
    assert detect_file_kind(None, "jd.docx", b"PK\x03\x04rest") == "docx"


def test_detect_image_png_jpeg_webp():
    assert detect_file_kind(None, "s.png", b"\x89PNG\r\n\x1a\n") == "image"
    assert detect_file_kind(None, "s.jpg", b"\xff\xd8\xff\xe0") == "image"
    assert detect_file_kind(None, "s.webp", b"RIFF....WEBP") == "image"


def test_detect_falls_back_to_content_type_then_extension():
    assert detect_file_kind("application/pdf", "noext", b"garbage") == "pdf"
    assert detect_file_kind(None, "resume.pdf", b"garbage") == "pdf"


def test_detect_unknown():
    assert detect_file_kind("text/plain", "notes.txt", b"hello") == "unknown"


def test_parse_fields_plain_json():
    out = _parse_fields_json('{"company":"Stripe","role":"PM","location":"Remote","job_description":"Do things."}')
    assert out == {"company": "Stripe", "role": "PM", "location": "Remote", "job_description": "Do things."}


def test_parse_fields_strips_code_fence_and_prose():
    raw = 'Here you go:\n```json\n{"company":"Acme","role":"Eng","location":"","job_description":"x"}\n```'
    out = _parse_fields_json(raw)
    assert out["company"] == "Acme"
    assert out["location"] == ""


def test_parse_fields_missing_keys_default_empty():
    out = _parse_fields_json('{"role":"Designer"}')
    assert out == {"company": "", "role": "Designer", "location": "", "job_description": ""}


def test_parse_fields_raises_on_non_json():
    with pytest.raises(JobFileParseError):
        _parse_fields_json("the model refused to answer")
