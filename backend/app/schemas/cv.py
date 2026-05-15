from pydantic import BaseModel


class CVUploadResponse(BaseModel):
    skills_detected: int    # number of skill signals extracted
    score: float            # Myro Score computed from CV
    redirect_to: str        # "/onboarding/score" — where to send the user next


class CVEvidenceSummaryResponse(BaseModel):
    evidence_count: int
    diary_entries_count: int
    skill_upgrades_count: int
    score_delta: float | None
    current_score: float | None
    last_cv_score: float | None
    next_version_number: int


class CVGenerateDraftResponse(BaseModel):
    version_id: int
    version_number: int
    cv_text: str
    new_xp_balance: int | None = None


class CVSaveDraftRequest(BaseModel):
    cv_text: str
