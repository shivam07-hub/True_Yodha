from fastapi import APIRouter

from .export import router as export_router
from .history import router as history_router
from .structured import router as structured_router
from .upload import router as upload_router
from .variants import router as variants_router

router = APIRouter(prefix="/cv", tags=["cv"])

router.include_router(history_router)
router.include_router(upload_router)
router.include_router(variants_router)
router.include_router(structured_router)
router.include_router(export_router)

__all__ = ["router"]
