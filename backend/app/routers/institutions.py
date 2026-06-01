from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import Literal

from app.config import settings
from app.database import get_supabase_admin
from app.services import email_service

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


def _notify_lead(row: dict, application_id: int) -> None:
    """Email the edu sales lead about a new beta application (best-effort).

    Mirrors the Myrology booking notification: the durable row is already
    written before this runs, so a missing key or failed send never costs us
    the lead — it just won't ping the inbox. Runs in a BackgroundTask so the
    applicant's response isn't blocked on the Resend round-trip.
    """
    to = settings.institutions_lead_email.strip()
    if not to:
        return
    text = (
        "New placement-cell beta application.\n\n"
        f"Application ID: {application_id}\n"
        f"Institute: {row['institute_name']}\n"
        f"Type: {row['institute_type']}\n"
        f"Students placed / year: {row['students_per_year']}\n"
        f"Primary need: {row['primary_need'] or '—'}\n\n"
        f"Contact: {row['contact_name']} ({row['contact_title']})\n"
        f"Email: {row['email']}\n"
        f"SSO: {row['sso_provider'] or '—'}\n"
    )
    email_service.send_email(
        to=to,
        subject=f"Institutions · new beta application — {row['institute_name']}",
        text=text,
    )


@router.post("/apply", status_code=status.HTTP_201_CREATED)
async def apply_for_institution(
    body: InstitutionApplicationRequest,
    background_tasks: BackgroundTasks,
) -> InstitutionApplicationResponse:
    """Capture a placement-cell beta application. Public — no auth.

    The submitter is an institute representative, not a Myro user. We reject
    personal-email domains so the review queue stays institutional, and persist
    via the service role (RLS deny-by-default for client roles). On success we
    schedule a best-effort email to the edu lead so applications surface for
    manual sales follow-up instead of sitting unseen in the table.
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

    application_id = result.data[0]["id"]
    background_tasks.add_task(_notify_lead, row, application_id)
    return InstitutionApplicationResponse(ok=True, id=application_id)
