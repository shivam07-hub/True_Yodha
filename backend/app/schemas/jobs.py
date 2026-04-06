from datetime import date, datetime
from pydantic import BaseModel


class ActionPlanDay(BaseModel):
    day: int
    focus: str              # skill display name
    tasks: list[str]        # 1–3 concrete tasks for that day


class JobMatchResponse(BaseModel):
    id: int                             # user_job_matches.id
    job_id: int
    title: str
    company: str | None
    location: str | None
    remote: bool
    overlap_score: float                # 0–100
    llm_rank: int | None                # 1–3 within this week's batch
    llm_explanation: str | None         # Groq: why this job fits (2–3 sentences)
    action_plan: list[ActionPlanDay]    # 7-day gap-closing plan
    batch_week: date                    # Monday this match was generated
    source_url: str | None


class JobMatchesResponse(BaseModel):
    jobs: list[JobMatchResponse]
    batch_week: date        # Monday of the current week's batch
    total: int


class ApplicationStatusUpdate(BaseModel):
    status: str     # pending | applied | no_response | responded | interviewing | rejected | offer
    notes: str | None = None
    company_response: str | None = None


class ApplicationResponse(BaseModel):
    id: int
    job_id: int
    title: str
    company: str | None
    status: str
    applied_at: datetime | None
    response_at: datetime | None
    checkin_sent_at: datetime | None
    notes: str | None
    created_at: datetime
