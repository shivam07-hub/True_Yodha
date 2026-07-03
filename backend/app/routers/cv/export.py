import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.services.cv_docx import generate_cv_docx
from app.services.cv_pdf_html import CVPdfError, render_html_to_pdf

router = APIRouter()

_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize_filename(raw: str | None, *, ext: str = "pdf") -> str:
    fallback = f"myro_cv.{ext}"
    if not raw:
        return fallback
    cleaned = _FILENAME_SAFE.sub("_", raw.strip()).strip("._-")
    if not cleaned:
        return fallback
    if not cleaned.lower().endswith(f".{ext}"):
        # Drop a wrong/extra extension before appending the right one.
        cleaned = re.sub(r"\.(pdf|docx)$", "", cleaned, flags=re.IGNORECASE)
        cleaned += f".{ext}"
    return cleaned[:120]


def _content_disposition(safe: str) -> str:
    # RFC 5987: ASCII fallback + UTF-8 encoded variant for browsers that read it.
    return f'attachment; filename="{safe}"; filename*=UTF-8\'\'{quote(safe)}'


# ── DOCX export ───────────────────────────────────────────────────────
# NOTE (ADR-0020): the plain-text /cv/download-pdf reportlab path was removed
# 2026-07-03 — it re-parsed raw body_text and produced artifacts the user never
# previewed. Every CV PDF now goes through /cv/export-pdf (WYSIWYG Chromium).
# The body carries the ALREADY-VISIBLE sections (selectVisibleCV applied
# client-side), so the .docx matches the on-screen sheet exactly — same single
# source of truth as the WYSIWYG PDF.


class CVDocxContact(BaseModel):
    name: str = ""
    title: str = ""
    location: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""


class VisibleExperience(BaseModel):
    role: str = ""
    company: str = ""
    dates: str = ""
    bullets: list[str] = Field(default_factory=list)


class VisibleProject(BaseModel):
    name: str = ""
    dates: str = ""
    bullets: list[str] = Field(default_factory=list)


class VisibleEducation(BaseModel):
    institution: str = ""
    degree: str = ""
    grade: str = ""
    dates: str = ""


class VisibleCV(BaseModel):
    summary: str = ""
    experience: list[VisibleExperience] = Field(default_factory=list)
    projects: list[VisibleProject] = Field(default_factory=list)
    education: list[VisibleEducation] = Field(default_factory=list)
    skills_line: str = ""
    certs: list[str] = Field(default_factory=list)


class CVDocxRequest(BaseModel):
    visible: VisibleCV
    contact: CVDocxContact = Field(default_factory=CVDocxContact)
    template: str = "classic"
    company: str | None = None
    filename: str | None = Field(default=None, max_length=160)


# ── WYSIWYG PDF export ────────────────────────────────────────────────
# The body carries the literal rendered `.cvb-pdf-page` outerHTML — the SAME
# DOM the user previewed. Headless Chromium renders it with the shared sheet
# stylesheet, so the PDF is byte-faithful to the preview (no plain-text round
# trip like /download-pdf). On any render failure we return 503 so the client
# transparently falls back to the browser's native Save-as-PDF (printCvPage).


class CVExportPdfRequest(BaseModel):
    html: str = Field(..., min_length=40, max_length=512_000)
    filename: str | None = Field(default=None, max_length=160)


@router.post("/export-pdf")
def export_cv_pdf(
    body: CVExportPdfRequest,
    principal: Principal = Depends(get_principal),
) -> Response:
    """Render the previewed CV sheet HTML to a WYSIWYG, ATS-parseable PDF."""
    try:
        pdf_bytes = render_html_to_pdf(body.html)
    except CVPdfError as exc:
        # Soft failure: the client falls back to native print on 503.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    safe = _sanitize_filename(body.filename, ext="pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(safe)},
    )


@router.post("/export-docx")
def export_cv_docx(
    body: CVDocxRequest,
    principal: Principal = Depends(get_principal),
) -> Response:
    """Render the visible CV sections as an ATS-clean .docx and stream it back."""
    docx_bytes = generate_cv_docx(
        body.visible.model_dump(),
        body.contact.model_dump(),
        template=body.template,
    )
    safe = _sanitize_filename(body.filename, ext="docx")
    return Response(
        content=docx_bytes,
        media_type=_DOCX_MIME,
        headers={"Content-Disposition": _content_disposition(safe)},
    )
