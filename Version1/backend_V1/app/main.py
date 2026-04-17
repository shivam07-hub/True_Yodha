"""
Job Match — FastAPI Backend
CV-to-Job matching service powered by Claude API.

Usage:
    cd backend/
    uvicorn app.main:app --reload --port 8000

API docs: http://localhost:8000/docs
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import init_db, SessionLocal
from app.config import MASTER_CSV
from app.services.ingestion import ingest_csv
from app.routers import health, jobs, match

# ── Logging ───────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-25s │ %(levelname)-7s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("jobmatch")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables + ingest CSV if DB is empty."""
    logger.info("Starting Job Match backend...")

    # Create tables
    init_db()
    logger.info("Database tables ready")

    # Auto-ingest CSV if jobs table is empty
    db = SessionLocal()
    try:
        from app.models import Job
        job_count = db.query(Job).count()
        if job_count == 0 and MASTER_CSV.exists():
            logger.info(f"Jobs table empty — ingesting from {MASTER_CSV.name}...")
            stats = ingest_csv(db, MASTER_CSV)
            logger.info(f"Ingestion complete: {stats}")
        else:
            logger.info(f"Jobs table has {job_count} records")
    finally:
        db.close()

    logger.info("Job Match backend ready!")
    yield
    logger.info("Shutting down...")


# ── App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Job Match API",
    description=(
        "CV-to-Job matching service. Submit a candidate's CV and preferences "
        "to get the top 5 matching jobs from 3,600+ active listings across "
        "14 major companies in India."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ── Routes ────────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(jobs.router)
app.include_router(match.router)


@app.get("/")
def root():
    return {
        "service": "Job Match API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }
