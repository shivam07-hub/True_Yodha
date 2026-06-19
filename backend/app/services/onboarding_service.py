"""Orchestration for target capture, result assembly, and milestones."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from supabase import Client

from app.database import get_supabase_admin
from app.repositories.cv import CVVersionsRepository
from app.repositories.onboarding import OnboardingRepository
from app.repositories.scores import ScoresRepository
from app.repositories.users import UsersRepository
from app.services import background, scoring


_ROLE_CLUSTERS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("product manager", "product owner"), "Product Management"),
    (("program manager",), "Program Management"),
    (("project manager",), "Project Management"),
    (("data scientist",), "Data Science"),
    (("data analyst", "business analyst"), "Data Analysis"),
    (("machine learning", "ai engineer"), "Artificial Intelligence and Machine Learning (AI/ML)"),
    (("software", "developer", "engineer"), "Software Development"),
    (("designer", "ux", "ui"), "User Interface and User Experience (UI/UX) Design"),
    (("marketing", "growth"), "Marketing Strategy and Techniques"),
    (("sales", "account executive"), "General Sales Practices"),
    (("finance", "financial"), "Financial Analysis"),
    (("operations",), "Business Operations"),
    (("human resources", "recruiter", "talent"), "Human Resources Management and Planning"),
)


def derive_role_clusters(role_title: str) -> list[str]:
    title = role_title.casefold()
    return [cluster for needles, cluster in _ROLE_CLUSTERS if any(n in title for n in needles)][:2]


def target_context_hash(
    baseline_version_id: int,
    role_title: str,
    seniority: str,
    location: str,
) -> str:
    raw = json.dumps(
        [baseline_version_id, role_title.strip().casefold(), seniority, location.strip().casefold()],
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def save_target(
    db: Client,
    user_id: str,
    *,
    role_title: str,
    seniority: str,
    location: str,
) -> None:
    clusters = derive_role_clusters(role_title)
    UsersRepository(db).update_profile(
        user_id,
        {
            "target_role_title": role_title.strip(),
            "target_seniority": seniority,
            "target_roles": clusters or [role_title.strip()],
            "target_locations": [location.strip()],
        },
    )
    OnboardingRepository(db).patch_state(
        user_id,
        {"current_stage": "result", "status": "analyzing"},
    )
    background.enqueue(
        background.LANE_FAST,
        "onboarding_target_refresh",
        payload={"user_id": user_id},
        correlation_id=f"target:{user_id}:{role_title}:{seniority}:{location}",
    )


@background.handler("onboarding_target_refresh")
async def refresh_target_result(payload: dict[str, Any], allow_retry: bool) -> None:
    user_id = str(payload["user_id"])
    db = get_supabase_admin()
    scores_repo = ScoresRepository(db)
    if scores_repo.get_user_skill_level_map(user_id):
        scoring.recompute_score(scores_repo, user_id)
        background.enqueue(
            background.LANE_BULK,
            "initial_match",
            payload={"user_id": user_id},
            correlation_id=f"target-match:{user_id}",
        )
    OnboardingRepository(db).patch_state(
        user_id,
        {"status": "result_ready", "current_stage": "result"},
    )


def _proof_skills(users_repo: UsersRepository, user_id: str) -> list[dict[str, Any]]:
    records = users_repo.list_user_skill_records(user_id)
    records.sort(key=lambda item: (-item.level, item.display_name.casefold()))
    return [
        {
            "taxonomy_key": item.key,
            "name": item.display_name,
            "level": item.level,
            "evidence": item.evidence_text or "",
        }
        for item in records[:5]
    ]


def _score_factors(score: dict[str, Any]) -> list[dict[str, Any]]:
    factors = [
        {
            "kind": "gap",
            "label": gap.get("skill") or gap.get("taxonomy_key") or "Skill gap",
            "detail": gap.get("why_it_matters") or "Current target-role demand",
        }
        for gap in (score.get("gap_skills") or [])[:3]
    ]
    if factors:
        return factors
    domains = sorted(
        (score.get("domain_scores") or {}).items(),
        key=lambda pair: float(pair[1]),
        reverse=True,
    )
    return [
        {"kind": "strength", "label": key, "detail": f"Domain score {value:.0f}"}
        for key, value in domains[:3]
    ]


def get_result(db: Client, user_id: str) -> dict[str, Any]:
    onboarding_repo = OnboardingRepository(db)
    users_repo = UsersRepository(db)
    state = onboarding_repo.get_state(user_id) or {}
    profile = users_repo.get_profile(user_id) or {}
    baseline = CVVersionsRepository(db).latest_baseline(user_id)

    target = {
        "role_title": profile.get("target_role_title") or "",
        "seniority": profile.get("target_seniority") or "any",
        "location": profile.get("target_location") or "",
    }
    if not baseline:
        if state.get("preview_payload"):
            return {
                "kind": "profile_preview",
                "target": target,
                "preview": state["preview_payload"],
                "primary_action": {"kind": "build_baseline", "label": "Build my starter CV"},
                "secondary_action": {"kind": "upload_cv", "label": "Upload an existing CV"},
            }
        upload_job_id = state.get("upload_job_id")
        job = None
        if upload_job_id:
            from app.repositories.cv_upload_jobs import fetch_status_for_owner

            job = fetch_status_for_owner(str(upload_job_id), user_id, db)
        if job and job.get("status") == "failed":
            return {
                "kind": "terminal_failure",
                "target": target,
                "error_code": job.get("error_code"),
                "message": job.get("error_detail"),
                "xp_refunded": bool(job.get("xp_refunded")),
            }
        return {
            "kind": "full_result_processing",
            "target": target,
            "phase": (job or {}).get("current_phase") or "queued",
        }

    score = ScoresRepository(db).get_mirror_score(user_id)
    if not score:
        return {
            "kind": "full_result_processing",
            "target": target,
            "phase": "scoring",
        }
    context_hash = target_context_hash(
        int(baseline["id"]),
        target["role_title"],
        target["seniority"],
        target["location"],
    )
    return {
        "kind": "full_result_ready",
        "baseline_version_id": int(baseline["id"]),
        "target_context_hash": context_hash,
        "target": target,
        "skills": _proof_skills(users_repo, user_id),
        "score": {
            "total_score": float(score["total_score"]),
            "domain_scores": score.get("domain_scores") or {},
            "gap_skills": score.get("gap_skills") or [],
            "skills_assessed": int(score.get("skills_assessed") or 0),
        },
        "score_factors": _score_factors(score),
        "credible_match": None,
        "primary_action": {"kind": "review_gaps", "label": "Review score gaps", "href": "/skills"},
        "secondary_action": {"kind": "browse_jobs", "label": "Browse jobs", "href": "/market"},
    }


def mark_completed(db: Client, user_id: str) -> None:
    CVVersionsRepository(db).update_cv_profile(user_id, {"onboarding_complete": True})
    OnboardingRepository(db).mark_completed(user_id)


def mark_activated(db: Client, user_id: str, activation_kind: str) -> None:
    OnboardingRepository(db).mark_activated(user_id, activation_kind)
