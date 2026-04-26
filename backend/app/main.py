from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, cv, diary, feedback, jobs, scores, skills, users
from app.services.job_feed.taxonomy import JobFeedTaxonomyMismatchError, verify_taxonomy_integrity

_TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "lightcast_skills_taxonomy.json"

app = FastAPI(
    title="Mirror API",
    description="Mirror — The Job Seeker's Reality Check",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(feedback.router)
app.include_router(skills.router)
app.include_router(cv.router)
app.include_router(scores.router)
app.include_router(jobs.router)
app.include_router(diary.router)


@app.on_event("startup")
async def _verify_taxonomy_integrity() -> None:
    try:
        version = verify_taxonomy_integrity(_TAXONOMY_PATH)
    except JobFeedTaxonomyMismatchError as exc:
        raise RuntimeError(f"Taxonomy integrity check failed on boot: {exc}") from exc


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}
