from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import Literal

from app.database import get_supabase_admin

router = APIRouter(prefix="/institutions", tags=["institutions"])

# Personal-email domains rejected for institutional applications. The frontend
# guards this too (instant feedback); the backend is the authority.
_PERSONAL_DOMAINS = {
    "gmail", "yahoo", "outlook", "hotmail", "icloud", "aol",
    "proton", "protonmail", "mail", "live", "me",
}

InstituteType = Literal[
    "IIT / IIM / NIT / IIIT",
    "Private engineering college",
    "B-school / Management institute",
    "Liberal arts / University",
    "Polytechnic / Vocational",
    "Deemed university",
    "EdTech / Bootcamp",
]

StudentsPerYear = Literal[
    "Under 250",
    "250 – 1,000",
    "1,000 – 5,000",
    "5,000+",
]

SsoProvider = Literal["google-edu", "microsoft-edu"]


class InstitutionApplicationRequest(BaseModel):
    institute_name: str = Field(min_length=2, max_length=200)
    contact_name: str = Field(min_length=2, max_length=120)
    contact_title: str = Field(min_length=2, max_length=120)
    email: EmailStr
    institute_type: InstituteType
    students_per_year: StudentsPerYear
    primary_need: str | None = Field(default=None, max_length=200)
    sso_provider: SsoProvider | None = None


class InstitutionApplicationResponse(BaseModel):
    ok: bool
    id: int


def _is_personal_email(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].lower()
    label = domain.split(".", 1)[0]
    return label in _PERSONAL_DOMAINS


@router.post("/apply", status_code=status.HTTP_201_CREATED)
async def apply_for_institution(
    body: InstitutionApplicationRequest,
) -> InstitutionApplicationResponse:
    """Capture a placement-cell beta application. Public — no auth.

    The submitter is an institute representative, not a Myro user. We reject
    personal-email domains so the review queue stays institutional, and persist
    via the service role (RLS deny-by-default for client roles).
    """
    if _is_personal_email(body.email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Use your institutional email address, not a personal one.",
        )

    row = {
        "institute_name": body.institute_name.strip(),
        "contact_name": body.contact_name.strip(),
        "contact_title": body.contact_title.strip(),
        "email": str(body.email).strip().lower(),
        "institute_type": body.institute_type,
        "students_per_year": body.students_per_year,
        "primary_need": body.primary_need,
        "sso_provider": body.sso_provider,
    }

    result = get_supabase_admin().table("institution_applications").insert(row).execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save application",
        )

    return InstitutionApplicationResponse(ok=True, id=result.data[0]["id"])
