"""Unit tests for the Add-a-job file parser (detection + JSON lift + URL fetch)."""

import pytest

from app.services.job_file_parser import (
    JobFileParseError,
    JobUrlFetchError,
    _assert_public_http_url,
    _html_to_text,
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


# --- URL fetch: SSRF guard ---

def test_url_guard_rejects_non_http_scheme():
    with pytest.raises(JobUrlFetchError):
        _assert_public_http_url("file:///etc/passwd")
    with pytest.raises(JobUrlFetchError):
        _assert_public_http_url("ftp://example.com/jd")


def test_url_guard_rejects_loopback():
    with pytest.raises(JobUrlFetchError):
        _assert_public_http_url("http://127.0.0.1/admin")
    with pytest.raises(JobUrlFetchError):
        _assert_public_http_url("http://localhost:8000/internal")


def test_url_guard_rejects_private_and_metadata_ranges():
    with pytest.raises(JobUrlFetchError):
        _assert_public_http_url("http://10.0.0.5/")
    with pytest.raises(JobUrlFetchError):
        _assert_public_http_url("http://192.168.1.1/")
    # AWS/GCP metadata endpoint — link-local, must be blocked
    with pytest.raises(JobUrlFetchError):
        _assert_public_http_url("http://169.254.169.254/latest/meta-data/")


def test_url_guard_rejects_missing_host():
    with pytest.raises(JobUrlFetchError):
        _assert_public_http_url("https://")


def test_url_guard_allows_public_host():
    # Resolves to a public IP; should not raise.
    _assert_public_http_url("https://boards.greenhouse.io/acme/jobs/123")


# --- URL fetch: HTML → text ---

def test_html_to_text_drops_script_and_style():
    html = (
        "<html><head><style>.x{color:red}</style></head>"
        "<body><script>steal()</script>"
        "<h1>Senior PM</h1><p>Build &amp; ship products.</p></body></html>"
    )
    text = _html_to_text(html)
    assert "steal()" not in text
    assert "color:red" not in text
    assert "Senior PM" in text
    assert "Build & ship products." in text


def test_html_to_text_preserves_block_breaks():
    text = _html_to_text("<li>One</li><li>Two</li>")
    assert "One" in text and "Two" in text
    assert "OneTwo" not in text
