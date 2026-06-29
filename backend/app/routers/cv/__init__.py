from fastapi import APIRouter

from .evidence import router as evidence_router
from .export import router as export_router
from .gap_plan import router as gap_plan_router
from .intake import router as intake_router
from .reservoir import router as reservoir_router
from .skill_edit import router as skill_edit_router
from .skills_refresh import router as skills_refresh_router
from .structured import router as structured_router
from .upload import router as upload_router
from .versions import router as versions_router

router = APIRouter(prefix="/cv", tags=["cv"])

router.include_router(upload_router)
router.include_router(structured_router)
router.include_router(versions_router)
router.include_router(evidence_router)
router.include_router(export_router)
router.include_router(skill_edit_router)
router.include_router(skills_refresh_router)
router.include_router(gap_plan_router)
router.include_router(intake_router)
router.include_router(reservoir_router)

__all__ = ["router"]
