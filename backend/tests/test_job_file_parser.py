"""Unit tests for the Add-a-job file parser (detection + JSON lift + URL fetch)."""

import pytest

from app.services.job_file_parser import (
    JobFileParseError,
    JobUrlFetchError,
    _assert_public_http_url,
    html_to_text,
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

def testhtml_to_text_drops_script_and_style():
    html = (
        "<html><head><style>.x{color:red}</style></head>"
        "<body><script>steal()</script>"
        "<h1>Senior PM</h1><p>Build &amp; ship products.</p></body></html>"
    )
    text = html_to_text(html)
    assert "steal()" not in text
    assert "color:red" not in text
    assert "Senior PM" in text
    assert "Build & ship products." in text


def testhtml_to_text_preserves_block_breaks():
    text = html_to_text("<li>One</li><li>Two</li>")
    assert "One" in text and "Two" in text
    assert "OneTwo" not in text


# ── The posting's own contact details survive the trip to the model ──────────
# The provider redacts identifiers on the way out, and the extractor's
# job_description is the model's copy of the posting. Without a ledger the
# model's copy is what got saved: Sterlite's "Send your CV to <email>" landed
# in Myro as "[REDACTED_EMAIL]" (2026-11-27), and the apply step lost its
# address. The parser redacts with a ledger and puts the originals back.


class _EgressEchoProvider:
    """Behaves like the real provider at egress: redacts what it is sent, and
    the model echoes the posting body it saw as job_description."""

    def __init__(self) -> None:
        self.sent: list[str] = []

    async def complete(self, messages, max_tokens=None, temperature=None):
        import json

        from app.security.personal_data import sanitize_ai_messages

        seen = sanitize_ai_messages(messages)[-1]["content"]
        self.sent.append(seen)
        return json.dumps({
            "company": "Sterlite Group",
            "role": "Chief Manager – BD & Strategy",
            "location": "Mumbai",
            "job_description": seen,
        })


POSTING = (
    "Chief Manager – Business Development & Strategy\n"
    "Sterlite Group, Mumbai.\n"
    "How to apply: send your CV to rohit.jaiswal@sterlite.com or call +91 98765 43210."
)


@pytest.mark.asyncio
async def test_hiring_email_and_phone_come_back_on_the_saved_posting():
    from app.services.job_file_parser import extract_job_from_text

    provider = _EgressEchoProvider()
    parsed = await extract_job_from_text(POSTING, provider)

    assert "rohit.jaiswal@sterlite.com" in parsed["job_description"]
    assert "+91 98765 43210" in parsed["job_description"]
    assert "[REDACTED" not in parsed["job_description"]


@pytest.mark.asyncio
async def test_the_model_still_never_sees_the_identifiers():
    from app.services.job_file_parser import extract_job_from_text

    provider = _EgressEchoProvider()
    await extract_job_from_text(POSTING, provider)

    assert "rohit.jaiswal@sterlite.com" not in provider.sent[0]
    assert "98765 43210" not in provider.sent[0]
