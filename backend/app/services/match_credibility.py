"""Deterministic gates for promoted job recommendations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schemas.jobs import SeniorityCompat
from app.services.onboarding_service import context_key


@dataclass(frozen=True)
class Credibility:
    recommendation: str | None
    seniority_compatibility: SeniorityCompat
    context_hash: str | None
    credible: bool


def _seniority_from_title(title: str) -> str:
    lowered = f" {title.casefold()} "
    if any(token in lowered for token in ("intern", "apprentice", "trainee")):
        return "intern"
    if any(token in lowered for token in ("junior", " jr ", "associate", "graduate", "entry")):
        return "entry"
    if any(token in lowered for token in ("chief", "vice president", " vp ", "director")):
        return "executive"
    if any(token in lowered for token in ("lead", "principal", "staff", "head of")):
        return "lead"
    if any(token in lowered for token in ("senior", " sr ", "sr.")):
        return "senior"
    return "unknown"


def seniority_compatibility(target: str, job_title: str) -> SeniorityCompat:
    if target in ("", "any"):
        return "compatible"
    actual = _seniority_from_title(job_title)
    if actual == "unknown":
        return "unknown"
    return "compatible" if actual == target else "incompatible"


def _location_token(value: str) -> str:
    lowered = value.casefold().replace("bangalore", "bengaluru")
    lowered = lowered.replace("gurgaon", "gurugram").replace("delhi / ncr", "delhi ncr")
    return " ".join(lowered.replace(",", " ").split())


def location_compatible(profile: dict[str, Any], job: dict[str, Any]) -> bool:
    target = _location_token(str(profile.get("target_location") or ""))
    if not target:
        return True
    # F4: a job dict with NO location signal at all reached this gate from a lean
    # caller that didn't attach location meta. The candidate pool already location-
    # filtered upstream, so a metaless job here was pool-approved — absent meta is not
    # a mismatch. Barring it is a false negative that silently blocks recommendations.
    if not any(
        str(job.get(key) or "").strip()
        for key in ("location_country", "location_city", "location_mode", "location")
    ):
        return True
    target_country = _location_token(str(profile.get("target_location_country") or ""))
    job_country = _location_token(str(job.get("location_country") or ""))
    if target_country and job_country and target_country != job_country:
        return False
    if "remote" in target:
        return str(job.get("location_mode") or "").casefold() == "remote"
    if "all" in target and target_country:
        return job_country == target_country
    target_city = _location_token(target.split(target_country, 1)[0]) if target_country else target
    job_city = _location_token(str(job.get("location_city") or ""))
    job_location = _location_token(str(job.get("location") or ""))
    return bool(target_city and (target_city == job_city or target_city in job_location))


def evaluate_credibility(
    profile: dict[str, Any],
    job: dict[str, Any],
    overall_score: float | None,
    recommendation: str | None,
) -> Credibility:
    if overall_score is not None and overall_score < 3.5:
        recommendation = "Skip"
    seniority = str(profile.get("target_seniority") or "any").strip().lower()
    # F5: the hash is a SCOPING key — "which direction was this verdict computed
    # for" — derived by `onboarding_service.context_key`, the ONE producer, so this
    # writer and the `get_result` reader cannot disagree about the same direction.
    # They used to: this side required a role title and normalised, that side did
    # neither, so a user with no recorded title got NULL rows against a non-NULL
    # lookup — `get_matches_for_context` matched nothing and `_shortlist` reported
    # "the market genuinely has no overlap" over a full stack. 162 of 196 users,
    # 1,289 real match rows.
    context_hash = context_key(profile)
    seniority_fit = seniority_compatibility(seniority, str(job.get("title") or ""))
    if seniority_fit == "unknown":
        # F3: the title's seniority is unreadable ("Software Engineer II", "SDE N 4A").
        # Defer to the brain — a strong Apply/Negotiate at >=3.5 already encodes an
        # at-level judgment (the eval prompt makes it Skip roles far outside level), so
        # an unreadable title must not structurally bar a genuinely strong match. A
        # weak/absent verdict leaves it "unknown" (honest — no forced compatibility).
        if (
            recommendation in {"Apply", "Negotiate"}
            and overall_score is not None
            and overall_score >= 3.5
        ):
            seniority_fit = "compatible"
    # Every gate here answers "is this a good, safe recommendation". The scoping
    # hash answered "which direction was this computed for" — a different question,
    # and the only one of the three absence-checks that had not been hardened (F3
    # defers an unreadable seniority to the brain, F4 reads absent location meta as
    # compatible). Requiring it made a bookkeeping field veto the recommendation:
    # 153 users had brain-rated matches and exactly ONE had an `is_recommended` row,
    # so `get_current_credible_match` returned None and the onboarding screen
    # offered "Review score gaps" instead of "Tailor for {role} at {company}" —
    # the 10-minute-CV core loop, withheld from 152 of 153 users by a null column.
    credible = bool(
        overall_score is not None
        and overall_score >= 3.5
        and recommendation in {"Apply", "Negotiate"}
        and seniority_fit == "compatible"
        and location_compatible(profile, job)
    )
    return Credibility(recommendation, seniority_fit, context_hash, credible)
