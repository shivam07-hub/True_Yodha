from fastapi import APIRouter

from app.services import job_importer, job_path as job_path_service

from .analyse import router as analyse_router
from .apply import router as apply_router
from .deepen import router as deepen_router
from .detail import router as detail_router
from .intelligence import router as intelligence_router
from .intent_chat import router as intent_chat_router
from .list import router as list_router
from .match import router as match_router
from .milestone import router as milestone_router
from .prep import router as prep_router
from .provenance import router as provenance_router
from .reach import router as reach_router
from .refresh import router as refresh_router
from .report import router as report_router
from .review import router as review_router
from .skill_demand import router as skill_demand_router
from .stale import router as stale_router

router = APIRouter(prefix="/jobs", tags=["jobs"])

router.include_router(list_router)
# Before detail_router: its `/{job_id}` would otherwise swallow `/skill-demand`
# and `/contributions`.
router.include_router(skill_demand_router)
router.include_router(refresh_router)
router.include_router(provenance_router)
router.include_router(intelligence_router)
router.include_router(match_router)
router.include_router(apply_router)
router.include_router(stale_router)
router.include_router(review_router)
router.include_router(milestone_router)
router.include_router(detail_router)
router.include_router(analyse_router)
router.include_router(deepen_router)
router.include_router(prep_router)
router.include_router(reach_router)
router.include_router(report_router)
router.include_router(intent_chat_router)

__all__ = ["router", "job_importer", "job_path_service"]
