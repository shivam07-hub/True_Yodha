"""
Pydantic models for API request/response validation.
"""

from pydantic import BaseModel, EmailStr, Field


# ── Match Request (from Zapier / Make.com) ────────────────────────────

class MatchRequest(BaseModel):
    name: str = Field(..., example="Rahul Sharma")
    email: EmailStr = Field(..., example="rahul@gmail.com")
    phone: str | None = Field(None, example="+91-9876543210")
    cv_file_url: str = Field(..., example="https://drive.google.com/uc?id=xxx")
    years_experience: str = Field(..., example="3-5")
    preferred_roles: list[str] = Field(default_factory=list, example=["Engineering", "Data"])
    preferred_cities: list[str] = Field(default_factory=list, example=["Bengaluru", "Hyderabad"])
    work_mode: str = Field("any", example="Hybrid")


# ── Parsed CV Profile (output of CV parser) ───────────────────────────

class ParsedCV(BaseModel):
    skills: list[str] = []
    years_experience: float | None = None
    job_titles: list[str] = []
    education: str | None = None
    industries: list[str] = []
    summary: str | None = None
    raw_text: str = ""


# ── Single Job Match Result ───────────────────────────────────────────

class JobMatchResult(BaseModel):
    rank: int
    score: float = Field(..., ge=0, le=100)
    job_title: str
    company_name: str
    location_city: str | None
    work_mode: str | None
    seniority_level: str | None
    matching_skills: list[str]
    missing_skills: list[str]
    reasoning: str          # overall match reasoning
    why_apply: str = ""     # specific reasons the candidate should apply
    strengths: str = ""     # what the candidate brings to this role
    weaknesses: str = ""    # gaps / areas to address before applying
    job_url: str | None


# ── Full Match Response ───────────────────────────────────────────────

class MatchResponse(BaseModel):
    candidate_name: str
    candidate_email: str
    total_jobs_in_db: int
    jobs_after_prefilter: int
    top_matches: list[JobMatchResult]
    status: str = "success"


# ── Health Check ──────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    total_jobs: int
    active_jobs: int
    db_connected: bool


# ── Job Browse / Search ──────────────────────────────────────────────

class JobSummary(BaseModel):
    id: int
    job_id: str | None
    title: str | None
    company_name: str | None
    location_city: str | None
    work_mode: str | None
    seniority_level: str | None
    job_url: str | None
    has_jd: bool
    skills_count: int


class JobListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    jobs: list[JobSummary]
