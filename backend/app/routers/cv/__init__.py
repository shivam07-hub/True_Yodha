from fastapi import APIRouter

from .history import router as history_router
from .upload import router as upload_router
from .variants import router as variants_router

router = APIRouter(prefix="/cv", tags=["cv"])

router.include_router(history_router)
router.include_router(upload_router)
router.include_router(variants_router)

__all__ = ["router"]
