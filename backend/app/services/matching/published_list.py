"""The /market list is the career-ops judgment, not the overlap sieve.

A job is on the list when this person's judge scored it at least 3.5 and said
Apply or Negotiate. Skips stay stored and do not pad the page. Unscored jobs
are the pending pile. The notice names the larger cut: a thin aspiration
pool, or the skills the skipped roles asked for.
"""
from __future__ import annotations

from typing import Any

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


def progress_line(read: int, total: int, cleared: int, *, bound: bool) -> str:
    opened = (
        f"the {total} most recently checked jobs that match your aspirations"
        if bound
        else f"{total} jobs"
    )
    return f"Read {read} of {opened}. {cleared} worth your time."


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
    read: int,
    total: int,
    cleared: int,
    bound: bool,
    cause: str | None,
    skills: list[str],
    cv_replaced: bool,
) -> str | None:
    parts: list[str] = []
    if cv_replaced:
        parts.append("These matches are for the CV you replaced. Reading the one you saved.")
    if reading:
        parts.append(progress_line(read, total, cleared, bound=bound))
    elif cause and not cv_replaced:
        parts.append(cause_line(cause, skills))
    text = " ".join(parts).strip()
    return text or None


def _join(items: list[str]) -> str:
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


# How many aspiration-matched jobs one read will open. Hitting it is named
# in the notice. It is not a silent membership cap.
ASPIRATION_READ = 1000


def assemble(repo: Any, user_id: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Cards worth showing, plus the honest account of the pile still open."""
    from app.services import onboarding_service
    from app.services.matching import targeting

    profile = targeting.for_ranking(repo, user_id).ranking_profile()
    latest = (
        repo.get_latest_baseline_id(user_id)
        if hasattr(repo, "get_latest_baseline_id") else None
    )
    profile["baseline_version_id"] = latest
    ctx = onboarding_service.eval_context_key(profile)
    roles = [str(r) for r in (profile.get("target_roles") or []) if str(r).strip()]
    countries = profile.get("target_location_countries") or None
    pool: list[str] = []
    bound = False
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
        bound = len(pool) >= ASPIRATION_READ

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

    visible = order_by_score([
        row for row in source
        if worth_showing(row.get("overall_score"), row.get("recommendation"))
    ])
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
    cleared = len(visible) if not cv_replaced else sum(
        1 for row in current
        if worth_showing(row.get("overall_score"), row.get("recommendation"))
    )
    cause = None if reading or cv_replaced else larger_cut(len(pool), len(visible))
    skills = skill_lines(skipped) if cause == "skills" else []
    text = notice(
        reading=reading,
        read=read,
        total=len(pool),
        cleared=cleared,
        bound=bound,
        cause=cause,
        skills=skills,
        cv_replaced=cv_replaced,
    )
    return [_card(row) for row in visible], {
        "reading": reading,
        "read": read,
        "pending": pending,
        "cleared": len(visible),
        "notice": text,
        "cause": cause,
        "skills": skills,
    }


def _card(row: dict[str, Any]) -> dict[str, Any]:
    from app.schemas.jobs import MatchEval

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
        "first_seen": job.get("first_seen"),
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
    }
