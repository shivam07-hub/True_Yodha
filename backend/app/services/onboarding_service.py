"""Orchestration for target capture, result assembly, and milestones."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from supabase import Client

from app.database import get_supabase_admin
from app.repositories.cv import CVVersionsRepository
from app.repositories.jobs import JobsRepository
from app.repositories.onboarding import OnboardingRepository
from app.repositories.scores import ScoresRepository
from app.repositories.users import UsersRepository
from app.services import background, scoring
from app.services.job_eligibility import (
    career_band_for_profile,
    explored_bands_for_profile,
    seniority_for_job,
    target_seniority_for_profile,
)
from app.services.scoring.percentile import top_percent


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


MAX_TARGET_ROLES = 5
_MAX_ROLE_CLUSTERS = 8


def _normalize_role_titles(
    role_title: str | None, role_titles: list[str] | None
) -> list[str]:
    """Clean, de-dupe (case-insensitive, first-wins) and cap the human titles.

    A single `role_title` (point-of-use edit) folds into the list so the whole
    write path is list-shaped. Order is preserved: titles[0] is the primary.
    """
    raw = list(role_titles) if role_titles else ([role_title] if role_title else [])
    seen: set[str] = set()
    titles: list[str] = []
    for candidate in raw:
        cleaned = (candidate or "").strip()
        key = cleaned.casefold()
        if len(cleaned) < 2 or key in seen:
            continue
        seen.add(key)
        titles.append(cleaned)
    return titles[:MAX_TARGET_ROLES]


def _clusters_for_titles(titles: list[str]) -> list[str]:
    """Union of taxonomy clusters across all target titles = matcher read model.

    A title with no cluster match contributes itself (keeps the aspiration
    ILIKE broad, mirroring the single-role fallback). De-duped, capped.
    """
    seen: set[str] = set()
    clusters: list[str] = []
    for title in titles:
        for cluster in derive_role_clusters(title) or [title]:
            if cluster not in seen:
                seen.add(cluster)
                clusters.append(cluster)
    return clusters[:_MAX_ROLE_CLUSTERS]


def role_title_updates(role_titles: list[str]) -> dict[str, Any]:
    """Derived column set for a target-titles edit — the write-anywhere half of
    `save_target` (no onboarding state patch, no location rewrite, no enqueue).

    Titles are the source-of-record (`target_role_titles`); `target_role_title`
    stays the primary = titles[0]; `target_roles` (taxonomy clusters, the matcher
    read model) is ALWAYS derived here — a surface writing titles through this
    helper cannot desync the cluster union. Empty input clears all three.
    """
    titles = _normalize_role_titles(None, role_titles)
    if not titles:
        return {"target_role_title": None, "target_role_titles": [], "target_roles": []}
    return {
        "target_role_title": titles[0],
        "target_role_titles": titles,
        "target_roles": _clusters_for_titles(titles),
    }


def save_target(
    db: Client,
    user_id: str,
    *,
    role_title: str | None = None,
    role_titles: list[str] | None = None,
    seniority: str | None = None,
    location: str | None = None,
) -> None:
    """Canonical target-role write (issue #145 · multi-role, User Memory Phase 0).

    The user targets up to 5 human role titles (chips). Those titles are the
    source-of-record (`target_role_titles`); `target_roles` (taxonomy clusters,
    the matcher + aspiration ILIKE keys) is the DERIVED union across titles, and
    `target_role_title` stays the PRIMARY = titles[0] for back-compat + the score
    label. A point-of-use edit may supply either `role_title` or `role_titles`.
    Omitted `seniority`/`location` are preserved so a role-only edit never wipes
    them. Requires the `target_role_titles` column (migration 20260706).
    """
    titles = _normalize_role_titles(role_title, role_titles)
    if not titles:
        raise ValueError("At least one target role is required.")

    users_repo = UsersRepository(db)
    profile = users_repo.get_profile(user_id) or {}
    if seniority is None or location is None:
        if seniority is None:
            seniority = profile.get("target_seniority") or "any"
        if location is None:
            existing_locations = profile.get("target_locations") or []
            location = (existing_locations[0] if existing_locations else None) or (
                profile.get("target_location") or ""
            )
    updates = role_title_updates(titles)
    derived_band = career_band_for_profile(updates)
    updates["target_career_band"] = derived_band or None
    updates["explored_career_bands"] = explored_bands_for_profile(
        {**profile, **updates},
        primary=derived_band,
    ) if derived_band else []
    users_repo.update_profile(
        user_id,
        {
            **updates,
            "target_seniority": target_seniority_for_profile({"target_seniority": seniority}),
            "target_locations": [location.strip()] if location else [],
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
        correlation_id=f"target:{user_id}:{'|'.join(titles)}:{seniority}:{location}",
    )


def compute_role_readiness(db: Client, user_id: str) -> list[dict[str, Any]]:
    """Per-target-title readiness — the role-specific signal beside the stable
    Myro Score. Each human title is searched by itself PLUS its taxonomy clusters
    so a specific title still resolves real market demand. Returns [] when the
    user has no titles or no skills yet (UI falls back to the score alone).
    """
    users_repo = UsersRepository(db)
    profile = users_repo.get_profile(user_id) or {}
    titles = profile.get("target_role_titles") or (
        [profile["target_role_title"]] if profile.get("target_role_title") else []
    )
    if not titles:
        return []

    scores_repo = ScoresRepository(db)
    skill_level_map = scores_repo.get_user_skill_level_map(user_id)
    out: list[dict[str, Any]] = []
    for title in titles:
        search_roles = [title, *derive_role_clusters(title)]
        readiness = scoring.role_readiness(scores_repo, skill_level_map, search_roles)
        out.append({"role": title, "readiness": readiness})
    return out


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
            payload={"user_id": user_id, "force_context_refresh": True},
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


def _infer_target_suggestion(baseline: dict[str, Any] | None) -> dict[str, str]:
    """Deterministic target pre-fill for the score-first confirm card (Slice 4).

    Role  = parsed contact.title → fallback experience[0].role → "".
    Location = parsed contact.location → "".
    Seniority = derived from the role title (title regex); unknown → entry.
    No LLM — the CV parser already extracted contact + experience. An empty role
    (weak/scanned CV) leaves the card asking fresh, so matching never runs on junk.
    """
    structured = (baseline or {}).get("cv_structured") or {}
    contact = structured.get("contact") or {}
    role = (contact.get("title") or "").strip()
    if not role:
        experience = structured.get("experience") or []
        if experience and isinstance(experience[0], dict):
            role = (experience[0].get("role") or "").strip()
    location = (contact.get("location") or "").strip()
    seniority = seniority_for_job({"job_title": role}) if role else ""
    return {"role": role, "location": location, "seniority": seniority or "entry"}


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
    has_target = bool(profile.get("target_role_title") or profile.get("target_role_titles"))
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

    # Score-first onboarding (Slice 4): the CV is parsed + scored, but the user
    # hasn't confirmed a target yet. Show the score now + a pre-filled confirm
    # card; matching runs only after they tap Confirm (save_target), so a weak/
    # empty role never produces junk matches.
    if not has_target:
        band = target_seniority_for_profile({"target_seniority": profile.get("target_seniority")})
        return {
            "kind": "awaiting_target",
            "baseline_version_id": int(baseline["id"]),
            "suggestion": _infer_target_suggestion(baseline),
            "skills": _proof_skills(users_repo, user_id),
            "score": {
                "total_score": float(score["total_score"]),
                "domain_scores": score.get("domain_scores") or {},
                "gap_skills": score.get("gap_skills") or [],
                "skills_assessed": int(score.get("skills_assessed") or 0),
                "band": band,
                "band_percentile": score.get("percentile"),
                "top_percent": top_percent(score.get("percentile")),
            },
            "score_factors": _score_factors(score),
        }

    context_hash = target_context_hash(
        int(baseline["id"]),
        target["role_title"],
        target["seniority"],
        target["location"],
    )
    credible_match = JobsRepository(db).get_current_credible_match(
        user_id,
        int(baseline["id"]),
        context_hash,
    )
    if credible_match:
        job = credible_match.get("jobs") or {}
        primary_action = {
            "kind": "tailor_credible_job",
            "label": f"Tailor for {job.get('job_title') or 'this role'} at {job.get('company_name') or 'this company'}",
            "href": f"/cv?jobId={credible_match['job_id']}",
        }
        secondary_action = {"kind": "review_gaps", "label": "Review score gaps", "href": "/skills"}
    else:
        primary_action = {"kind": "review_gaps", "label": "Review score gaps", "href": "/skills"}
        secondary_action = {"kind": "browse_jobs", "label": "Browse jobs", "href": "/market"}
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
            # Band-relative confidence line for the reveal ("top X% for {band}").
            "band": target_seniority_for_profile({"target_seniority": target.get("seniority")}),
            "band_percentile": score.get("percentile"),
            "top_percent": top_percent(score.get("percentile")),
        },
        "score_factors": _score_factors(score),
        "credible_match": credible_match,
        "primary_action": primary_action,
        "secondary_action": secondary_action,
    }


def mark_completed(db: Client, user_id: str) -> None:
    CVVersionsRepository(db).update_cv_profile(user_id, {"onboarding_complete": True})
    OnboardingRepository(db).mark_completed(user_id)


def mark_activated(db: Client, user_id: str, activation_kind: str) -> None:
    OnboardingRepository(db).mark_activated(user_id, activation_kind)
