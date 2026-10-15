"""Reads and writes for a filing Yes. The decision lives in apply_filing."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin
from app.db_safe import safe_read
from app.deps import get_user_db
from app.services.apply_filing import FilingFacts
from app.services.listing_time import CARD_COLUMNS

#: Columns `/health/ready` probes. A deploy that reads this table before the
#: migration is applied fails the ready check instead of 500ing a drawer.
FILING_COLUMNS = (
    "id",
    "user_id",
    "job_id",
    "cv_version_id",
    "judge_score",
    "authorized_at",
    "receipt_url",
    "receipt_text",
    "received_at",
    "hold_reason",
)

_LISTING_COLUMNS = CARD_COLUMNS + ",apply_url,source_url"


class JobFilingRepository:
    def __init__(self, db: Client, admin_db: Client) -> None:
        self._db = db
        self._admin = admin_db

    def facts(self, user_id: str, job_id: str) -> FilingFacts | None:
        """The job row plus this person's judge score and tailored CV.

        None means the job itself is absent. A missing score or CV is a fact
        the gate turns into a block, not a missing job.
        """
        listing = safe_read(
            self._admin.table("jobs")
            .select(_LISTING_COLUMNS)
            .eq("job_id", job_id)
            .limit(1),
            default=[],
            context="filing_listing",
        )
        if not listing:
            return None
        match = safe_read(
            self._db.table("user_job_matches")
            .select("overall_score")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .order("id", desc=True)
            .limit(1),
            default=[],
            context="filing_judge",
        )
        cv = safe_read(
            self._db.table("cv_versions")
            .select("id")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .neq("kind", "baseline_upload")
            .order("user_version_number", desc=True)
            .limit(1),
            default=[],
            context="filing_cv",
        )
        score = match[0].get("overall_score") if match else None
        cv_id = cv[0].get("id") if cv else None
        return FilingFacts(listing=listing[0], judge_score=score, tailored_cv_id=cv_id)

    def authorization_for(self, user_id: str, job_id: str) -> dict[str, Any] | None:
        row = safe_read(
            self._db.table("job_filing_authorizations")
            .select(",".join(FILING_COLUMNS))
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .limit(1),
            default=[],
            context="filing_authorization",
        )
        if not row:
            return None
        return row[0]

    def save_authorization(
        self,
        *,
        user_id: str,
        job_id: str,
        cv_version_id: int,
        judge_score: float,
    ) -> None:
        """Store the Yes. Does not touch job_applications."""
        self._admin.table("job_filing_authorizations").upsert(
            {
                "user_id": user_id,
                "job_id": job_id,
                "cv_version_id": cv_version_id,
                "judge_score": judge_score,
                "authorized_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="user_id,job_id",
        ).execute()

    def tailored_cv(self, user_id: str, cv_version_id: int) -> dict[str, Any] | None:
        row = safe_read(
            self._db.table("cv_versions")
            .select("id, cv_structured, body_text")
            .eq("user_id", user_id)
            .eq("id", cv_version_id)
            .limit(1),
            default=[],
            context="filing_cv_body",
        )
        if not row:
            return None
        return row[0]

    def save_receipt(
        self,
        *,
        user_id: str,
        job_id: str,
        receipt_url: str,
        receipt_text: str,
    ) -> None:
        self._admin.table("job_filing_authorizations").update(
            {
                "receipt_url": receipt_url.strip(),
                "receipt_text": receipt_text.strip(),
                "received_at": datetime.now(timezone.utc).isoformat(),
                "hold_reason": None,
            }
        ).eq("user_id", user_id).eq("job_id", job_id).execute()

    def save_hold(self, *, user_id: str, job_id: str, reason: str | None) -> None:
        self._admin.table("job_filing_authorizations").update(
            {"hold_reason": reason}
        ).eq("user_id", user_id).eq("job_id", job_id).execute()

    def save_resume(
        self,
        *,
        user_id: str,
        job_id: str,
        resume_pdf: str,
        resume_filename: str,
    ) -> None:
        self._admin.table("job_filing_authorizations").update(
            {"resume_pdf": resume_pdf, "resume_filename": resume_filename}
        ).eq("user_id", user_id).eq("job_id", job_id).execute()

    def resume_for(self, user_id: str, job_id: str) -> dict[str, Any] | None:
        row = safe_read(
            self._db.table("job_filing_authorizations")
            .select("resume_pdf, resume_filename")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .limit(1),
            default=[],
            context="filing_resume",
        )
        if not row or not row[0].get("resume_pdf"):
            return None
        return row[0]


RESUME_COLUMNS = ("resume_pdf", "resume_filename")


def get_job_filing_repository(db: Client = Depends(get_user_db)) -> JobFilingRepository:
    return JobFilingRepository(db, get_supabase_admin())
