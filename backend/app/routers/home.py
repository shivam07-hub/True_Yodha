"""Home bootstrap BFF (backend-for-frontend).

LinkedIn-style: ONE endpoint fans out server-side (fast, co-located with
Supabase) so the client makes a single round-trip instead of ~9 to paint the
dashboard. It composes the existing route handlers — now plain sync functions
after the threadpool flip — so there is zero logic duplication: each section's
behaviour is exactly its standalone endpoint's.

The fan-out is CONCURRENT (backlog #21): the 8 sections are independent reads,
so they run in a ThreadPoolExecutor instead of one-after-another. Wall time
collapses from sum(sections) (~5–6s, the prod `route.slow` we saw) to
max(section) (~1–2s). Safe because all sections share the single per-request
RLS client (get_user_db is Depends-cached) whose auth header is set once at
construction and whose underlying httpx.Client is threadsafe — no section
mutates shared query state. Each section is still bounded by the 8s PostgREST
timeout, so the slowest one caps the tail.

Above-the-fold superset (grill Q2 + viewport split): bundles what the first
viewport paints on either shell. The client seeds its TanStack cache from this
bundle and the viewport picks its own above-the-fold slice (desktop = score +
top-3 jobs + skill strip + xp; phone = score + top-1 + xp). Below-fold surfaces
still lazy-load from their own endpoints.

Token-scoped (RLS intact). The admin-client perf optimisation (skip per-request
client construction) is a deliberate later follow-up, gated on a per-repo
user_id-filter audit — bypassing RLS here without that audit risks cross-user
leakage.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository, get_token_cv_repository
from app.repositories.diary import DiaryRepository, get_token_diary_repository
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.repositories.scores import ScoresRepository, get_token_scores_repository
from app.repositories.users import UsersRepository, get_token_users_repository
from app.routers.cv.evidence import get_cv_evidence
from app.routers.cv.versions import CVVersionListResponse, list_cv_versions
from app.routers.diary import get_diary_history
from app.routers.jobs.apply import get_applications
from app.routers.jobs.match import get_job_matches
from app.routers.scores import get_my_score
from app.routers.users import get_me
from app.schemas import (
    ApplicationResponse,
    CVEvidenceSummaryResponse,
    DiaryHistoryResponse,
    JobMatchesResponse,
    MirrorScoreResponse,
    UserProfileResponse,
)
from app.schemas.upskilling import ActivityDatesResponse
from app.services import upskilling_service
from app.services.concurrent_reads import run_concurrently

router = APIRouter(prefix="/home", tags=["home"])


class HomeBootstrapResponse(BaseModel):
    """Everything the dashboard needs to paint above the fold, in one payload.

    `score` is nullable: a user with no CV yet has no score (the standalone
    endpoint 404s) — the bundle degrades that to null instead of failing.
    """

    profile: UserProfileResponse
    score: MirrorScoreResponse | None
    matches: JobMatchesResponse
    applications: list[ApplicationResponse]
    evidence: CVEvidenceSummaryResponse
    cv_versions: CVVersionListResponse
    practice_activity: ActivityDatesResponse
    diary: DiaryHistoryResponse


@router.get("/bootstrap", response_model=HomeBootstrapResponse)
def home_bootstrap(
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
    users_repo: UsersRepository = Depends(get_token_users_repository),
    scores_repo: ScoresRepository = Depends(get_token_scores_repository),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    diary_repo: DiaryRepository = Depends(get_token_diary_repository),
) -> HomeBootstrapResponse:
    # Session-start hook (User Memory Phase 2): schedule a behavioural distillation
    # off the response path. maybe_distill self-debounces (≥12h watermark) so the
    # add_task cost is ~nil on most loads and it never blocks the bootstrap.
    from app.services import memory_distiller

    background_tasks.add_task(memory_distiller.maybe_distill, principal.id)
    def _score() -> MirrorScoreResponse | None:
        # A user with no CV yet has no score — the standalone endpoint 404s,
        # which the bundle degrades to null rather than failing the whole load.
        try:
            return get_my_score(principal=principal, scores_repo=scores_repo)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_404_NOT_FOUND:
                return None
            raise

    # Independent reads → fan out concurrently. A section that raises a real
    # error (not score's 404) re-raises on .result() and surfaces as the
    # endpoint's error, exactly as the old sequential version did.
    sections = {
        "profile": lambda: get_me(principal=principal, users_repo=users_repo),
        "score": _score,
        "matches": lambda: get_job_matches(principal=principal, repo=jobs_repo),
        "applications": lambda: get_applications(principal=principal, repo=jobs_repo, cv_repo=cv_repo),
        "evidence": lambda: get_cv_evidence(principal=principal, cv_repo=cv_repo),
        "cv_versions": lambda: list_cv_versions(principal=principal, cv_repo=cv_repo),
        "practice_activity": lambda: ActivityDatesResponse(
            dates=upskilling_service.list_activity_dates(principal.id)
        ),
        "diary": lambda: get_diary_history(principal=principal, diary_repo=diary_repo, limit=30),
    }
    return HomeBootstrapResponse(**run_concurrently(sections))
