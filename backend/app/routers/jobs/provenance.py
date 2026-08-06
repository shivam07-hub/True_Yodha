"""Where this user's job pool came from — the Collections rail provenance card.

Same read model as the public landing counters (`repositories.job_provenance`),
plus the caller's own contribution. One endpoint per card: the surface asks a
single question and gets a single answer, rather than assembling it from three
reads that can each be stale by a different amount.
"""

import logging

from fastapi import APIRouter, Depends

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.job_provenance import read_contributions
from app.schemas.jobs import JobProvenanceResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/contributions", response_model=JobProvenanceResponse)
def job_contributions(
    principal: Principal = Depends(get_principal),
) -> JobProvenanceResponse:
    """Pool provenance + this user's own contribution.

    Admin client on purpose: `jobs` is community-owned reference data (the same
    table the scraper and the extension import both write with service-role),
    so these are global counts, not the caller's rows. The only user-scoped
    value is `mine`, and it is filtered explicitly by `created_by_user_id`.
    """
    counts = read_contributions(get_supabase_admin(), principal.id)
    return JobProvenanceResponse(**counts)
