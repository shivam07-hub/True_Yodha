from datetime import datetime
from pydantic import BaseModel, field_validator


class GapSkillResponse(BaseModel):
    skill: str              # display name
    taxonomy_key: str
    current_level: int      # 0–5
    target_level: int       # current + 1, capped at 5
    gap_score: float        # (5 - current_level) × market_demand_weight
    job_count_30d: int      # how many jobs require this skill
    why_it_matters: str     # LLM-generated explanation


class MirrorScoreResponse(BaseModel):
    """
    IMPORTANT: rank_tier and percentile are NEVER included here.
    They are computed internally and stored in DB but never returned via API.
    """
    total_score: float                  # 0–100
    domain_scores: dict[str, float]     # {"SD": 72.0, "DE": 45.0, ...}
    gap_skills: list[GapSkillResponse]  # top 5 upgrade priorities
    skills_assessed: int
    computed_at: datetime

    @field_validator("total_score")
    @classmethod
    def round_score(cls, v: float) -> float:
        return round(v, 1)


class ComputeScoreResponse(BaseModel):
    """Returned immediately after POST /scores/compute."""
    score: MirrorScoreResponse
    skills_updated: int     # number of user_skills rows written
