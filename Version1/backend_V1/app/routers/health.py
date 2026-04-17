"""
Health check endpoint.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Job
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    """Check API health and database status."""
    try:
        total = db.query(Job).count()
        active = db.query(Job).filter(Job.is_active == True).count()
        return HealthResponse(
            status="ok",
            total_jobs=total,
            active_jobs=active,
            db_connected=True,
        )
    except Exception:
        return HealthResponse(
            status="error",
            total_jobs=0,
            active_jobs=0,
            db_connected=False,
        )
