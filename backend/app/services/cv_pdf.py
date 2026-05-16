"""CV text → PDF bytes using reportlab.

Renders a clean, print-ready A4 PDF from the plain-text CV stored in
cv_history / user_profiles. Detects ALL-CAPS section headers, bullet
points, and contact-info lines automatically — no manual markup needed.
"""
from __future__ import annotations

from io import BytesIO

from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

_PAGE_W, _PAGE_H = A4
_MARGIN = 18 * mm

_TEAL = "#0d9488"
_DARK = "#111827"
_MUTED = "#6b7280"
_BLACK = "#000000"

_NAME = ParagraphStyle(
    "name",
    fontName="Helvetica-Bold",
    fontSize=18,
    leading=22,
    textColor=_DARK,
    alignment=TA_CENTER,
    spaceAfter=2,
)
_CONTACT = ParagraphStyle(
    "contact",
    fontName="Helvetica",
    fontSize=9,
    leading=12,
    textColor=_MUTED,
    alignment=TA_CENTER,
    spaceAfter=6,
)
_SECTION = ParagraphStyle(
    "section",
    fontName="Helvetica-Bold",
    fontSize=10,
    leading=13,
    textColor=_TEAL,
    spaceBefore=10,
    spaceAfter=2,
)
_BOLD_BODY = ParagraphStyle(
    "bold_body",
    fontName="Helvetica-Bold",
    fontSize=9.5,
    leading=13,
    textColor=_DARK,
    spaceAfter=1,
)
_BODY = ParagraphStyle(
    "body",
    fontName="Helvetica",
    fontSize=9.5,
    leading=13,
    textColor=_DARK,
    spaceAfter=1,
)
_BULLET = ParagraphStyle(
    "bullet",
    fontName="Helvetica",
    fontSize=9.5,
    leading=13,
    textColor=_DARK,
    leftIndent=10,
    spaceAfter=1,
)
_SMALL = ParagraphStyle(
    "small",
    fontName="Helvetica",
    fontSize=8.5,
    leading=12,
    textColor=_MUTED,
    spaceAfter=1,
)


def _is_section_header(line: str) -> bool:
    stripped = line.strip()
    if len(stripped) < 3:
        return False
    if stripped.startswith(("•", "·", "-", "*", "+")):
        return False
    alpha_only = "".join(c for c in stripped if c.isalpha())
    return len(alpha_only) >= 3 and alpha_only == alpha_only.upper()


def _is_contact_line(line: str) -> bool:
    ln = line.strip().lower()
    return any(tok in ln for tok in ("@", "linkedin", "+91", "+1", "github", "http"))


def _looks_like_name(line: str, is_first: bool) -> bool:
    if not is_first:
        return False
    stripped = line.strip()
    words = stripped.split()
    return 1 <= len(words) <= 5 and all(w[0].isupper() for w in words if w)


def _escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def generate_cv_pdf(cv_text: str) -> bytes:
    """Return PDF bytes for *cv_text* (plain-text CV string)."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=_MARGIN,
        rightMargin=_MARGIN,
        topMargin=_MARGIN,
        bottomMargin=_MARGIN,
    )

    story: list = []
    lines = cv_text.splitlines()
    first_nonempty = True

    for line in lines:
        raw = line.rstrip()
        stripped = raw.strip()

        if not stripped:
            story.append(Spacer(1, 4))
            continue

        safe = _escape(stripped)

        if _looks_like_name(stripped, first_nonempty):
            story.append(Paragraph(safe, _NAME))
            first_nonempty = False
            continue

        if first_nonempty:
            first_nonempty = False

        if _is_contact_line(stripped):
            story.append(Paragraph(safe, _CONTACT))
            continue

        if _is_section_header(stripped):
            story.append(Spacer(1, 2))
            story.append(Paragraph(safe, _SECTION))
            story.append(
                HRFlowable(
                    width="100%",
                    thickness=0.5,
                    color=_TEAL,
                    spaceAfter=3,
                )
            )
            continue

        if stripped.startswith(("•", "·", "-", "+")):
            bullet_text = stripped.lstrip("•·-+ ").strip()
            story.append(Paragraph(f"• {_escape(bullet_text)}", _BULLET))
            continue

        # Heuristic: short lines that look like subheadings (company name, dates)
        # Keep as bold body if < 60 chars and no lowercase words longer than 3 chars
        words = stripped.split()
        if len(stripped) < 70 and all(
            w[0].isupper() or not w[0].isalpha() for w in words if w
        ) and len(words) <= 8:
            story.append(Paragraph(safe, _BOLD_BODY))
        else:
            story.append(Paragraph(safe, _BODY))

    doc.build(story)
    return buf.getvalue()
