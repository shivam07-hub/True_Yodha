"""The /market list is the career-ops judgment, not the overlap sieve.

A job is on the list when this person's judge scored it at least 3.5 and said
Apply or Negotiate. Skips stay stored and do not pad the page. Unscored jobs
are the pending pile. The notice names the larger cut: a thin aspiration
pool, or the skills the skipped roles asked for.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.listing_time import verdict as listing_time

SHOW_FLOOR = 3.5
WORTH = frozenset({"Apply", "Negotiate"})
# Compared only to decide which sentence to lead with. Never a pad, never a cap.
_FULL = 40


def worth_showing(overall: Any, recommendation: Any) -> bool:
    try:
        score = float(overall)
    except (TypeError, ValueError):
        return False
    if score < SHOW_FLOOR:
        return False
    rec = str(recommendation or "").strip()
    return not rec or rec in WORTH


def order_by_score(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: (-float(row["overall_score"]), str(row.get("job_id") or "")),
    )


def larger_cut(pool: int, cleared: int) -> str | None:
    """Which shortage removed more jobs. None when the list is not short."""
    if cleared >= _FULL:
        return None
    skipped = max(0, pool - cleared)
    aspiration_gap = max(0, _FULL - pool)
    if skipped > aspiration_gap and skipped > 0:
        return "skills"
    if pool < _FULL:
        return "aspirations"
    return None


def skill_lines(skipped: list[dict[str, Any]], *, limit: int = 5) -> list[str]:
    seen: list[str] = []
    for row in skipped:
        for concern in row.get("concerns") or []:
            text = str(concern).strip()
            if text and text not in seen:
                seen.append(text)
            if len(seen) >= limit:
                return seen
    return seen


def cause_line(cause: str, skills: list[str]) -> str:
    if cause == "skills" and skills:
        named = _join(skills)
        return (
            f"These roles want {named}. "
            "Closing that gap is what adds jobs you can apply to."
        )
    if cause == "skills":
        return "The roles in your aspirations want experience your CV does not show yet. Closing that gap is what adds jobs you can apply to."
    return "Your aspirations match a thin part of the market. Adding a direction is what brings more roles in."


def notice(
    *,
    reading: bool,
    cause: str | None,
    skills: list[str],
    cv_replaced: bool,
) -> str | None:
    """The one sentence, once the read has something to say.

    While jobs are still being opened the count lives on `read` / `pending` /
    `cleared` and the client draws it beside the loom. A sentence here used to
    say "Read 0 of the 1000 most recently checked…", which named an unfinished
    window as a finished judgment.
    """
    parts: list[str] = []
    if cv_replaced:
        parts.append("These matches are for the CV you replaced. Reading the one you saved.")
    if not reading and cause and not cv_replaced:
        parts.append(cause_line(cause, skills))
    text = " ".join(parts).strip()
    return text or None


def _join(items: list[str]) -> str:
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


# How many aspiration-matched jobs one read will open. The cap is the
# window the client counts. It is not a silent membership cap, and hitting
# it is not worded as "most recently checked".
ASPIRATION_READ = 1000


def assemble(repo: Any, user_id: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Cards worth showing, plus the honest account of the pile still open."""
    from app.services import deal_breakers, direction, onboarding_service
    from app.services.matching import admission, targeting

    profile = targeting.for_ranking(repo, user_id).ranking_profile()
    latest = (
        repo.get_latest_baseline_id(user_id)
        if hasattr(repo, "get_latest_baseline_id") else None
    )
    profile["baseline_version_id"] = latest
    ctx = onboarding_service.eval_context_key(profile)
    roles = list(direction.of(profile).families)
    countries = profile.get("target_location_countries") or None
    pool: list[str] = []
    if roles and hasattr(repo, "get_candidate_job_ids_for_roles"):
        pool = [
            str(job_id) for job_id in (
                repo.get_candidate_job_ids_for_roles(
                    roles,
                    target_location_countries=countries,
                    limit=ASPIRATION_READ,
                ) or []
            ) if job_id
        ]

    stack = list(repo.get_user_match_stack(user_id) or [])
    current = [
        row for row in stack
        if row.get("eval_context_hash") == ctx and row.get("overall_score") is not None
    ]
    cv_replaced = False
    source = current
    if not current:
        previous = [
            row for row in stack
            if row.get("overall_score") is not None
            and row.get("baseline_version_id") not in (None, latest)
        ]
        if previous:
            source = previous
            cv_replaced = True

    # Worth showing by the verdict, then shown only if the listing is still open
    # and still fits where and at what level this person looks NOW.
    visible = order_by_score(admission.admitted(profile, [
        row for row in source
        if worth_showing(row.get("overall_score"), row.get("recommendation"))
    ]))
    skipped = [
        row for row in source
        if not worth_showing(row.get("overall_score"), row.get("recommendation"))
    ]
    judged = {
        str(row.get("job_id"))
        for row in stack
        if row.get("eval_context_hash") == ctx and row.get("overall_score") is not None
    }
    read = sum(1 for job_id in pool if job_id in judged)
    pending = max(0, len(pool) - read)
    reading = pending > 0
    cause = None if reading or cv_replaced else larger_cut(len(pool), len(visible))
    skills = skill_lines(skipped) if cause == "skills" else []
    text = notice(
        reading=reading,
        cause=cause,
        skills=skills,
        cv_replaced=cv_replaced,
    )
    floor = deal_breakers.read(profile).pay_floor_lpa
    return [_card(row, floor) for row in visible], {
        "reading": reading,
        "read": read,
        "pending": pending,
        "cleared": len(visible),
        "notice": text,
        "cause": cause,
        "skills": skills,
        "cv_replaced": cv_replaced,
    }


def _card(row: dict[str, Any], floor: float | None = None) -> dict[str, Any]:
    from app.schemas.jobs import MatchEval
    from app.services.deal_breakers import below_floor

    job = row.get("jobs") or {}
    me = MatchEval.model_validate(row)
    raw_skills = job.get("main_skills") or []
    skills = [str(s) for s in raw_skills if isinstance(s, str) and s.strip()]
    matched = [str(s) for s in (row.get("matched_skills") or []) if s]
    return {
        "job_id": str(row.get("job_id") or ""),
        "job_title": job.get("job_title") or "Untitled role",
        "company_name": job.get("company_name"),
        "job_description": None,
        "location": job.get("location"),
        "location_city": job.get("location_city"),
        "location_country": job.get("location_country"),
        "location_mode": job.get("location_mode"),
        "location_quality": job.get("location_quality"),
        "locations": list(job.get("locations") or []),
        "role_family": job.get("role_family"),
        "seniority_level": job.get("seniority_level"),
        "min_years_experience": job.get("min_years_experience"),
        "max_years_experience": job.get("max_years_experience"),
        "industry": job.get("industry"),
        "source_url": job.get("apply_url"),
        **listing_time(job, now=datetime.now(timezone.utc)).card(),
        "is_active": bool(job.get("is_active", True)),
        "skills": skills[:8],
        "matched_skills": matched,
        "matched_skill_count": len(matched),
        "overall_score": row.get("overall_score"),
        "grade": row.get("grade"),
        "recommendation": row.get("recommendation"),
        "legitimacy_tier": row.get("legitimacy_tier"),
        "legitimacy_reason": row.get("legitimacy_reason"),
        "archetype": row.get("archetype"),
        "match_score": me.match_score,
        "verdict": me.verdict,
        "is_strong": me.is_strong,
        "track_id": row.get("track_id"),
        "ctc_low_lpa": me.ctc_low_lpa,
        "ctc_high_lpa": me.ctc_high_lpa,
        "ctc_basis": me.ctc_basis,
        "pay_below_floor": below_floor(floor, me.ctc_high_lpa),
    }
