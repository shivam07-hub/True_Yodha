"""Golden-artifact tests for CV exports (ADR-0020: every CV artifact is WYSIWYG).

Born from a real trust breach (2026-07-03): a user's one-tap download went
through a plain-text reportlab path that exploded his skills line one-per-line,
preserved raw PDF-extraction line breaks mid-sentence, and rendered every ₹ as
a ■ tofu box (Helvetica/WinAnsi has no rupee glyph). The path is deleted; these
tests pin the two surviving renderers to the failure pattern so it cannot
recur silently.

Fixture mirrors that CV's shape: ₹-figures in bullets, a long comma-separated
skills line, an em-dash and an en-dash (also outside WinAnsi-safe habits).
"""
from __future__ import annotations

import io
import zipfile

import pytest
from fastapi.routing import APIRoute

from app.main import app
from app.services.cv_docx import generate_cv_docx

RUPEE_BULLET = (
    "Managed a portfolio of 11 digital subscription products, owning P&L and "
    "GTM in partnership with broadcaster partners — Warner Brothers, Sony, "
    "FanCode, JioHotstar — driving ₹30Cr ARR"
)
SKILLS_LINE = (
    "Growth & Lifecycle Marketing, Digital GTM Strategy, Conversion Rate "
    "Optimization, Partner Management, P&L Ownership, Attribution Modelling, "
    "Mixpanel (User Analytics), WhatsApp Business Campaigns, A/B Testing & "
    "Funnel Optimization"
)

VISIBLE_CV = {
    "summary": "Marketing Manager scaling digital products across a ₹30Cr ARR portfolio.",
    "experience": [
        {
            "role": "Manager – Subscriber Marketing",
            "company": "Tata Play",
            "dates": "Apr 2025 – Present",
            "bullets": [RUPEE_BULLET, "Generated ₹88L incremental revenue via pricing initiatives"],
        }
    ],
    "projects": [],
    "education": [
        {
            "institution": "Indian Institute of Management Lucknow",
            "degree": "MBA, ABM",
            "grade": "",
            "dates": "2022–24",
        }
    ],
    "skills_line": SKILLS_LINE,
    "certs": [],
}
CONTACT = {
    "name": "Deveshwar Kashyap",
    "title": "Manager – Subscriber Marketing",
    "location": "Mumbai, India",
    "email": "user@example.com",
    "phone": "+91 90000 00000",
    "linkedin": "",
}


def _docx_paragraphs(docx_bytes: bytes) -> list[str]:
    """Paragraph texts from a .docx without needing python-docx at read time."""
    import re
    from xml.sax.saxutils import unescape

    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as zf:
        xml = zf.read("word/document.xml").decode("utf-8")
    paragraphs = []
    for para in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
        runs = re.findall(r"<w:t[^>]*>(.*?)</w:t>", para, flags=re.S)
        text = unescape("".join(runs))
        if text.strip():
            paragraphs.append(text)
    return paragraphs


def test_legacy_plain_text_pdf_route_is_gone():
    """ADR-0020 guard: no plain-text CV→PDF endpoint may exist. The only PDF
    route is the WYSIWYG /cv/export-pdf (sheet outerHTML → Chromium)."""
    pdf_paths = {
        route.path
        for route in app.routes
        if isinstance(route, APIRoute) and "pdf" in route.path and route.path.startswith("/cv")
    }
    assert "/cv/download-pdf" not in pdf_paths
    assert "/cv/export-pdf" in pdf_paths


def test_public_export_pdf_route_exists_and_is_anon():
    """ADR-0020: the logged-out playground download must go through the SAME
    Chromium renderer as the authed path — not browser print. Guard both that
    the anon twin exists AND that it takes no principal (so it never regresses
    back to a divergent `window.print()` shortcut for anon users)."""
    routes = {
        route.path: route
        for route in app.routes
        if isinstance(route, APIRoute)
    }
    assert "/public/cv/export-pdf" in routes
    dep_names = {
        d.call.__name__
        for d in routes["/public/cv/export-pdf"].dependant.dependencies
        if getattr(d, "call", None) is not None
    }
    assert "get_principal" not in dep_names


def test_public_and_authed_pdf_share_one_renderer():
    """Both export routes render through render_html_to_pdf — one deep module,
    no second PDF engine (the 2026-07 divergence that shipped a mangled anon PDF)."""
    import app.routers.cv.export as authed_export
    import app.routers.public as public_router

    assert authed_export.render_html_to_pdf is public_router.render_html_to_pdf


def test_public_export_pdf_offloads_sync_render_to_thread(monkeypatch):
    """The anon route is `async` (awaits Turnstile) but render_html_to_pdf uses
    sync_playwright, which RAISES inside a running asyncio loop. Regression guard
    for the 2026-07 bug where the route called it directly → every anon export
    503'd → users fell back to browser print (blank trailing page, dropped
    bullets). We assert the renderer runs OFF the event loop, without needing
    Chromium: the stub fails iff it is invoked while a loop is running."""
    import asyncio

    from starlette.testclient import TestClient

    import app.routers.public as public_router

    def _renderer_must_run_in_thread(html: str) -> bytes:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return b"%PDF-1.4 ok"  # no loop → correctly offloaded to a worker thread
        raise AssertionError("render_html_to_pdf ran inside the asyncio event loop")

    monkeypatch.setattr(public_router, "render_html_to_pdf", _renderer_must_run_in_thread)

    with TestClient(app) as client:
        resp = client.post(
            "/public/cv/export-pdf",
            json={"html": "<div class='cvb-pdf-page'>" + ("x" * 60) + "</div>"},
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


def test_docx_preserves_rupee_and_dashes():
    docx = generate_cv_docx(VISIBLE_CV, CONTACT)
    text = "\n".join(_docx_paragraphs(docx))
    assert "₹30Cr" in text
    assert "₹88L" in text
    assert "–" in text  # en-dash in dates survives
    assert "■" not in text


def test_docx_skills_line_stays_one_paragraph():
    docx = generate_cv_docx(VISIBLE_CV, CONTACT)
    paragraphs = _docx_paragraphs(docx)
    matches = [p for p in paragraphs if "Growth & Lifecycle Marketing" in p]
    assert matches, "skills line missing from DOCX"
    # The whole comma-separated line lives in ONE paragraph — never exploded
    # into one-skill-per-line (the 2026-07-03 failure shape).
    assert any("A/B Testing & Funnel Optimization" in p for p in matches)


def test_docx_bullets_are_single_paragraphs():
    docx = generate_cv_docx(VISIBLE_CV, CONTACT)
    paragraphs = _docx_paragraphs(docx)
    matches = [p for p in paragraphs if "Warner Brothers" in p]
    assert matches, "experience bullet missing from DOCX"
    # The full bullet — including the ₹ figure at its end — is one paragraph,
    # never split at raw-extraction line-break positions.
    assert any("driving ₹30Cr ARR" in p for p in matches)


# ── WYSIWYG PDF (Chromium) golden ────────────────────────────────────────────

_SHEET_HTML = (
    '<div class="cvb-pdf-page" data-cv-template="classic">'
    '<h1 class="pdf-name">Deveshwar Kashyap</h1>'
    '<div class="pdf-contact"><span>Mumbai, India</span><span>user@example.com</span></div>'
    "<h2>Experience</h2>"
    '<div class="pdf-role-head"><div><span class="pdf-role">Manager – Subscriber Marketing</span>'
    '<span class="pdf-co"> · Tata Play</span></div><span class="pdf-dates">Apr 2025 – Present</span></div>'
    f"<ul><li>{RUPEE_BULLET}</li></ul>"
    "<h2>Skills</h2>"
    f'<div class="pdf-skills-line">{SKILLS_LINE}</div>'
    "</div>"
)


def _chromium_available() -> bool:
    try:
        from app.services.cv_pdf_html import render_html_to_pdf

        render_html_to_pdf(_SHEET_HTML)
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _chromium_available(), reason="Chromium not installed (playwright install)")
def test_wysiwyg_pdf_preserves_rupee_and_skills_line():
    import fitz  # pymupdf — same extractor the CV parser uses

    from app.services.cv_pdf_html import render_html_to_pdf

    pdf = render_html_to_pdf(_SHEET_HTML)
    with fitz.open(stream=pdf, filetype="pdf") as doc:
        text = "\n".join(page.get_text() for page in doc)

    assert "₹30Cr" in text, "rupee glyph lost in the rendered PDF"
    assert "■" not in text and "�" not in text, "tofu/replacement glyph in PDF"
    # Skills line stays a flowing line, not one-skill-per-line: the first two
    # skills share a text line in the extraction.
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    joined = next((ln for ln in lines if "Growth & Lifecycle Marketing," in ln and "Digital GTM Strategy" in ln), None)
    assert joined is not None, f"skills line exploded vertically: {lines[-12:]}"
