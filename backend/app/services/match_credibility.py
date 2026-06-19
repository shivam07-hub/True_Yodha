"""Deterministic gates for promoted job recommendations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.onboarding_service import target_context_hash


@dataclass(frozen=True)
class Credibility:
    recommendation: str | None
    seniority_compatibility: str
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


def seniority_compatibility(target: str, job_title: str) -> str:
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
    baseline_id = profile.get("baseline_version_id")
    role_title = str(profile.get("target_role_title") or "").strip()
    seniority = str(profile.get("target_seniority") or "any").strip().lower()
    target_location = str(profile.get("target_location") or "").strip()
    context_hash = None
    if baseline_id and role_title:
        context_hash = target_context_hash(
            int(baseline_id), role_title, seniority, target_location,
        )
    seniority_fit = seniority_compatibility(seniority, str(job.get("title") or ""))
    credible = bool(
        context_hash
        and overall_score is not None
        and overall_score >= 3.5
        and recommendation in {"Apply", "Negotiate"}
        and seniority_fit == "compatible"
        and location_compatible(profile, job)
    )
    return Credibility(recommendation, seniority_fit, context_hash, credible)
