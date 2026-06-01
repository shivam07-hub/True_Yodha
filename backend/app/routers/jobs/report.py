"""Community freshness — 'Report as Inactive'.

Spec: docs/REPORT_INACTIVE_FEATURE.md. 5 independent reports flip is_active=false
via a Supabase trigger on job_reports; every report earns the reporter +10 XP
written to daily_logs.skills_delta as `community_reporter`. Guards: one report per
user per job (DB UNIQUE + 409 here), max 3 reports/day/user (429 here).

Inserts use the caller's RLS-scoped client so the job_reports INSERT policy
(`auth.uid() = user_id`) is satisfied.
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.deps import Principal, get_principal, get_user_db

router = APIRouter()

MAX_DAILY_REPORTS = 3
XP_PER_REPORT = 10
COMMUNITY_TAXONOMY_KEY = "community_reporter"


@router.post("/{job_id}/report", status_code=status.HTTP_200_OK)
async def report_job_inactive(
    job_id: str,
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
) -> dict:
    user_id = principal.id
    today = date.today()

    # Guard 1 — already reported this job (also enforced by DB UNIQUE(job_id,user_id)).
    existing = (
        db.table("job_reports")
        .select("id")
        .eq("job_id", job_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    if existing:
        raise HTTPException(status_code=409, detail="Already reported this job")

    # Guard 2 — daily cap (3/day).
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc).isoformat()
    daily_count = len(
        (
            db.table("job_reports")
            .select("id")
            .eq("user_id", user_id)
            .gte("reported_at", today_start)
            .execute()
        ).data
        or []
    )
    if daily_count >= MAX_DAILY_REPORTS:
        raise HTTPException(status_code=429, detail="Daily report limit reached (3/day)")

    # Insert — the AFTER INSERT trigger owns report_count + is_active flip at 5.
    try:
        db.table("job_reports").insert({"job_id": job_id, "user_id": user_id}).execute()
    except APIError as exc:
        # Unique-violation race → treat as already reported.
        if getattr(exc, "code", None) == "23505":
            raise HTTPException(status_code=409, detail="Already reported this job") from exc
        raise

    _award_xp(db, user_id, today)

    job_row = (
        db.table("jobs").select("report_count").eq("job_id", job_id).limit(1).execute()
    ).data
    report_count = (job_row[0] if job_row else {}).get("report_count", 1)
    return {
        "report_count": report_count,
        "already_reported": True,
        "xp_earned": XP_PER_REPORT,
    }


def _award_xp(db: Client, user_id: str, today: date) -> None:
    """+10 XP → today's daily_logs.skills_delta as a community_reporter entry."""
    delta_item = {"taxonomy_key": COMMUNITY_TAXONOMY_KEY, "xp_added": XP_PER_REPORT}
    existing_log = (
        db.table("daily_logs")
        .select("id, skills_delta")
        .eq("user_id", user_id)
        .eq("log_date", today.isoformat())
        .execute()
    ).data
    if existing_log:
        log = existing_log[0]
        current_delta = log.get("skills_delta") or []
        db.table("daily_logs").update(
            {"skills_delta": current_delta + [delta_item]}
        ).eq("id", log["id"]).execute()
    else:
        db.table("daily_logs").insert(
            {
                "user_id": user_id,
                "log_date": today.isoformat(),
                "entry_text": "",
                "skills_delta": [delta_item],
            }
        ).execute()
