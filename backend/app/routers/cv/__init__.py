from fastapi import APIRouter

from .evidence import router as evidence_router
from .export import router as export_router
from .structured import router as structured_router
from .upload import router as upload_router
from .versions import router as versions_router

router = APIRouter(prefix="/cv", tags=["cv"])

router.include_router(upload_router)
router.include_router(structured_router)
router.include_router(versions_router)
router.include_router(evidence_router)
router.include_router(export_router)

__all__ = ["router"]
