import re
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.services.cv_pdf import generate_cv_pdf

router = APIRouter()


_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize_filename(raw: str | None) -> str:
    if not raw:
        return "myro_cv.pdf"
    cleaned = _FILENAME_SAFE.sub("_", raw.strip()).strip("._-")
    if not cleaned:
        return "myro_cv.pdf"
    if not cleaned.lower().endswith(".pdf"):
        cleaned += ".pdf"
    return cleaned[:120]


class CVDownloadRequest(BaseModel):
    cv_text: str = Field(..., min_length=60)
    filename: str | None = Field(default=None, max_length=160)


@router.post("/download-pdf")
def download_cv_pdf(
    body: CVDownloadRequest,
    principal: Principal = Depends(get_principal),
) -> Response:
    """Render *cv_text* as a PDF and stream it back for download."""
    pdf_bytes = generate_cv_pdf(body.cv_text)
    safe = _sanitize_filename(body.filename)
    # RFC 5987: ASCII fallback + UTF-8 encoded variant for browsers that read it.
    disposition = f'attachment; filename="{safe}"; filename*=UTF-8\'\'{quote(safe)}'
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": disposition},
    )
