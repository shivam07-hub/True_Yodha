from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services.cv_pdf import generate_cv_pdf

router = APIRouter()


class CVDownloadRequest(BaseModel):
    cv_text: str = Field(..., min_length=60)


@router.post("/download-pdf")
async def download_cv_pdf(
    body: CVDownloadRequest,
    current_user: dict = Depends(get_current_user),
) -> Response:
    """Render *cv_text* as a PDF and stream it back for download."""
    pdf_bytes = generate_cv_pdf(body.cv_text)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="myro_cv.pdf"'},
    )
