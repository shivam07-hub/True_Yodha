from fastapi import APIRouter

from .public import router as public_router

router = APIRouter(prefix="/profile", tags=["profile"])
router.include_router(public_router)

__all__ = ["router"]
