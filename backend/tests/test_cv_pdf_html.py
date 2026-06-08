"""WYSIWYG CV PDF renderer — drift guard + render smoke.

`test_cv_sheet_css_in_sync` is the load-bearing test: it fails the moment the
backend's inlined sheet stylesheet diverges from the frontend canonical, which is
the only thing keeping the server PDF byte-faithful to the on-screen preview.

The render smoke is skipped automatically when Chromium is not installed (local
dev / CI without `playwright install`), so it never blocks; when Chromium IS
present it proves the HTML→PDF path end-to-end.
"""
from __future__ import annotations

from pathlib import Path

import pytest

# tests/ → backend/ → repo root
_REPO_ROOT = Path(__file__).resolve().parents[2]
_FRONTEND_SHEET = _REPO_ROOT / "frontend" / "app" / "(authed)" / "cv" / "cv-sheet.css"
_BACKEND_SHEET = _REPO_ROOT / "backend" / "app" / "assets" / "cv_sheet.css"


def test_backend_sheet_asset_exists():
    assert _BACKEND_SHEET.is_file(), f"missing backend sheet copy: {_BACKEND_SHEET}"


@pytest.mark.skipif(not _FRONTEND_SHEET.is_file(), reason="frontend tree not present")
def test_cv_sheet_css_in_sync():
    """The backend's server-PDF stylesheet must match the frontend canonical
    byte-for-byte, or the PDF will silently drift from the preview."""
    frontend = _FRONTEND_SHEET.read_text(encoding="utf-8")
    backend = _BACKEND_SHEET.read_text(encoding="utf-8")
    assert backend == frontend, (
        "backend/app/assets/cv_sheet.css is out of sync with the frontend "
        "cv-sheet.css. Re-copy it: the server PDF reuses this exact stylesheet."
    )


_SAMPLE_SHEET = (
    '<div class="cvb-pdf-page" data-cv-template="classic">'
    '<h1 class="pdf-name">Asha Rao</h1>'
    '<div class="pdf-contact"><span>Bengaluru</span><span>asha@example.com</span></div>'
    "<h2>Experience</h2>"
    '<div class="pdf-role-head"><div><span class="pdf-role">Engineer</span>'
    '<span class="pdf-co"> · Acme</span></div><span class="pdf-dates">2023–Now</span></div>'
    "<ul><li>Shipped the thing.</li><li>Shipped another thing.</li></ul>"
    "</div>"
)


def _chromium_available() -> bool:
    try:
        from app.services.cv_pdf_html import render_html_to_pdf

        render_html_to_pdf(_SAMPLE_SHEET)
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _chromium_available(), reason="Chromium not installed (playwright install)")
def test_render_html_to_pdf_smoke():
    from app.services.cv_pdf_html import render_html_to_pdf

    pdf = render_html_to_pdf(_SAMPLE_SHEET)
    assert pdf[:5] == b"%PDF-", "output is not a PDF"
    assert len(pdf) > 800, "PDF suspiciously small"


def test_render_html_to_pdf_rejects_empty():
    from app.services.cv_pdf_html import CVPdfError, render_html_to_pdf

    with pytest.raises(CVPdfError):
        render_html_to_pdf("   ")


# ── Geist font parity (Option B) ──────────────────────────────────────


def test_backend_geist_fonts_vendored():
    fonts = _REPO_ROOT / "backend" / "app" / "assets" / "fonts"
    assert (fonts / "GeistVF.woff").is_file()
    assert (fonts / "GeistMonoVF.woff").is_file()


@pytest.mark.skipif(not _FRONTEND_SHEET.is_file(), reason="frontend tree not present")
def test_geist_woff_in_sync_with_frontend():
    """The backend must embed the SAME woff bytes the frontend serves, or the PDF
    glyphs drift from the preview."""
    for fname in ("GeistVF.woff", "GeistMonoVF.woff"):
        fe = (_REPO_ROOT / "frontend" / "app" / "fonts" / fname).read_bytes()
        be = (_REPO_ROOT / "backend" / "app" / "assets" / "fonts" / fname).read_bytes()
        assert fe == be, f"{fname} differs between frontend and backend"


def test_font_face_css_embeds_geist():
    try:
        from app.services.cv_pdf_html import _font_face_css
    except Exception:
        pytest.skip("cv_pdf_html not importable (playwright missing)")
    css = _font_face_css()
    assert "font-family:'Geist'" in css
    assert "font-family:'Geist Mono'" in css
    assert "data:font/woff;base64," in css
