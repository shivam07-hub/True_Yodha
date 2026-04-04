from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

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

# Routers will be added here in Phase 1C
# from app.routers import auth, users, skills, cv, scores, jobs
# app.include_router(auth.router, prefix="/auth", tags=["auth"])


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}
