"""WYSIWYG CV PDF — render the EXACT previewed `.cvb-pdf-page` to PDF bytes.

This is the "Google Docs" export path: the frontend posts the literal rendered
`.cvb-pdf-page` outerHTML (the same DOM the user previewed), and headless
Chromium renders it with the SAME shared stylesheet (`assets/cv_sheet.css`,
kept in lockstep with the frontend `cv-sheet.css` by test_cv_sheet_css_sync).

Because there is ONE markup source (the React PdfPage) and ONE CSS source (the
shared sheet), the PDF cannot drift from the preview — unlike the legacy
`cv_pdf.generate_cv_pdf`, which regex-rebuilds structure from plain text and
fails ATS. The server reproduces the *print* form of the sheet (white page, no
foot, A4 margins) so it matches what `window.print()` produced before.

Fonts: the sheet's family chain is `"Geist", "Helvetica Neue", Arial, sans-serif`
(and `"Geist Mono", monospace`). The frontend now loads real Geist via @font-face
(cv-fonts.css → app/fonts/*.woff), so this renderer embeds the SAME woff bytes as
a base64 @font-face (`_font_face_css`) — preview and PDF share identical glyphs
and cannot drift. fonts-liberation stays installed only as an Arial-metric safety
net for the fallback chain.

Requires Chromium (installed via `playwright install --with-deps chromium` in the
Dockerfile, Phase 0).
"""
from __future__ import annotations

import base64
import re
from functools import lru_cache
from pathlib import Path

from playwright.sync_api import sync_playwright

_ASSETS = Path(__file__).resolve().parent.parent / "assets"
_SHEET_CSS_PATH = _ASSETS / "cv_sheet.css"
_FONTS_DIR = _ASSETS / "fonts"
# (css family name, woff filename) — must match cv-fonts.css on the frontend.
_FONT_FACES = (
    ("Geist", "GeistVF.woff"),
    ("Geist Mono", "GeistMonoVF.woff"),
)

# Reproduces the @media print block in cv-builder.css: the submitted CV is a
# white A4 page with no on-screen chrome (shadow/radius/foot). Page margins are
# applied via page.pdf(margin=...) — NOT @page here — to avoid double margins.
_SERVER_PRINT_OVERRIDE = """
html, body { margin: 0; padding: 0; background: #fff; }
.cvb-pdf-page {
  width: 100% !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  background: #fff !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  position: static !important;
}
.cvb-pdf-page .pdf-foot { display: none !important; }
"""

# Matches the existing @page rule (cv-builder.css): A4, 14mm margins.
_PDF_MARGIN = {"top": "14mm", "right": "14mm", "bottom": "14mm", "left": "14mm"}

_MAX_HTML_BYTES = 512 * 1024  # a resume sheet is a few KB; cap defends the renderer
_SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL)


@lru_cache(maxsize=1)
def _sheet_css() -> str:
    return _SHEET_CSS_PATH.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def _font_face_css() -> str:
    """Embed the Geist woff fonts as base64 @font-face so Chromium renders the
    exact same glyphs as the frontend — no network, no system-font dependency.
    Missing font files degrade gracefully to the Helvetica/Arial fallback."""
    rules: list[str] = []
    for family, fname in _FONT_FACES:
        path = _FONTS_DIR / fname
        if not path.is_file():
            continue
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        rules.append(
            f"@font-face{{font-family:'{family}';"
            f"src:url(data:font/woff;base64,{b64}) format('woff');"
            "font-weight:100 900;font-style:normal;font-display:block;}"
        )
    return "".join(rules)


def _sanitize(body_html: str) -> str:
    """Strip <script> defensively. The HTML is the user's own CV markup and is
    rendered in an isolated, network-blocked headless page with no secrets, so
    this is belt-and-suspenders, not the security boundary."""
    return _SCRIPT_RE.sub("", body_html)


def _document(body_html: str) -> str:
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<style>{_font_face_css()}</style>"
        f"<style>{_sheet_css()}</style>"
        f"<style>{_SERVER_PRINT_OVERRIDE}</style>"
        f"</head><body>{_sanitize(body_html)}</body></html>"
    )


class CVPdfError(RuntimeError):
    """Raised when Chromium is unavailable or rendering fails."""


def render_html_to_pdf(body_html: str) -> bytes:
    """Render the posted `.cvb-pdf-page` outerHTML to A4 PDF bytes.

    `body_html` is the literal previewed sheet markup (one element, with its
    `data-cv-template` attribute already set), so the template variant is
    carried by the DOM — no separate template argument needed.
    """
    if not body_html or not body_html.strip():
        raise CVPdfError("empty CV markup")
    if len(body_html.encode("utf-8")) > _MAX_HTML_BYTES:
        raise CVPdfError("CV markup too large")

    document = _document(body_html)
    try:
        with sync_playwright() as p:
            # --no-sandbox: required to launch Chromium as root inside the
            # container. The page loads no remote content (network blocked).
            browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
            try:
                page = browser.new_page()
                # Block every network request: fonts are system-installed, the
                # sheet has no images, and a resume must render deterministically
                # and offline. Aborting also closes the only SSRF surface.
                page.route("**/*", lambda route: route.abort())
                page.set_content(document, wait_until="domcontentloaded", timeout=15_000)
                # Brief settle so the font layout/line-breaks finalize.
                page.wait_for_timeout(120)
                pdf = page.pdf(
                    format="A4",
                    margin=_PDF_MARGIN,
                    print_background=True,
                    prefer_css_page_size=False,
                )
            finally:
                browser.close()
    except CVPdfError:
        raise
    except Exception as exc:  # Chromium missing / launch failed / render crash
        raise CVPdfError(f"PDF rendering failed: {exc}") from exc

    if not pdf:
        raise CVPdfError("renderer produced no output")
    return pdf
