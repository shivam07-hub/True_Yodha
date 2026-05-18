from fastapi import APIRouter

from app.services import job_importer, job_path as job_path_service

from .analyse import router as analyse_router
from .apply import router as apply_router
from .detail import router as detail_router
from .list import router as list_router
from .match import router as match_router
from .milestone import router as milestone_router
from .review import router as review_router
from .stale import router as stale_router

router = APIRouter(prefix="/jobs", tags=["jobs"])

router.include_router(list_router)
router.include_router(match_router)
router.include_router(apply_router)
router.include_router(stale_router)
router.include_router(review_router)
router.include_router(milestone_router)
router.include_router(detail_router)
router.include_router(analyse_router)

__all__ = ["router", "job_importer", "job_path_service"]
