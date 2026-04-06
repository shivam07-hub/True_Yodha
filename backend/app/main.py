from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, cv, diary, jobs, scores, skills, users

app = FastAPI(
    title="Mirror API",
    description="Mirror — The Job Seeker's Reality Check",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(skills.router)
app.include_router(cv.router)
app.include_router(scores.router)
app.include_router(jobs.router)
app.include_router(diary.router)


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}
