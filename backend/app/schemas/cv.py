from pydantic import BaseModel


class CVUploadResponse(BaseModel):
    skills_detected: int    # number of skill signals extracted
    score: float            # Mirror Score computed from CV
    redirect_to: str        # "/onboarding/score" — where to send the user next
