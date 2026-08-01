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
from app.repositories.role_families import RoleFamiliesRepository
from app.repositories.scores import ScoresRepository
from app.repositories.users import UsersRepository
from app.services import background, scoring
from app.services.job_eligibility import (
    career_band_for_profile,
    explored_bands_for_profile,
    target_seniority_for_profile,
)
from app.services.experience_years import (
    seniority_for_candidate_title,
    seniority_for_experience_years,
    total_experience_years,
)
from app.services.scoring.percentile import top_percent


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


def role_title_updates(role_titles: list[str], *, role_family: str | None = None) -> dict[str, Any]:
    """Derived column set for a target-titles edit — the write-anywhere half of
    `save_target` (no onboarding state patch, no location rewrite, no enqueue).

    Titles are the source-of-record and the selected role family is the scoring
    read model. The family is supplied only by corpus-backed role discovery; we
    never recreate the old substring-to-cluster table from a free-form title.
    """
    titles = _normalize_role_titles(None, role_titles)
    if not titles:
        return {"target_role_title": None, "target_role_titles": [], "target_roles": []}
    return {
        "target_role_title": titles[0],
        "target_role_titles": titles,
        "target_roles": [role_family.strip()] if role_family and role_family.strip() else [],
    }


def save_target(
    db: Client,
    user_id: str,
    *,
    role_title: str | None = None,
    role_titles: list[str] | None = None,
    role_family: str | None = None,
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
    updates = role_title_updates(titles, role_family=role_family)
    if not updates["target_roles"]:
        # Point-of-use role edits predate corpus families. Preserve their current
        # feed read model rather than inventing a family from the edited title.
        updates["target_roles"] = list(profile.get("target_roles") or [])
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
        readiness = scoring.role_readiness(scores_repo, skill_level_map, profile.get("target_roles") or [])
        out.append({"role": title, "readiness": readiness})
    return out


@background.handler("onboarding_target_refresh")
async def refresh_target_result(payload: dict[str, Any], allow_retry: bool) -> None:
    user_id = str(payload["user_id"])
    db = get_supabase_admin()
    baseline = CVVersionsRepository(db).latest_baseline(user_id)
    if not baseline or not baseline.get("skills_confirmed_at"):
        OnboardingRepository(db).patch_state(
            user_id,
            {"status": "analyzing", "current_stage": "result"},
        )
        return
    scores_repo = ScoresRepository(db)
    if scores_repo.get_user_skill_level_map(user_id):
        if not payload.get("score_fresh"):
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


def _candidate_skills(
    scores_repo: ScoresRepository,
    baseline: dict[str, Any],
) -> list[dict[str, Any]]:
    """Baseline-scoped candidates shown before any user-skill publication.

    Built from the *same* functions the publish path runs
    (``build_skill_level_map`` for the level, ``best_evidence_by_key`` for the
    receipt), so the level a user is shown while deciding is the level they get.
    The previous version carried a private signal_type→level table that skipped
    the depth boost in ``infer_level_from_signals``. No prod row has ever
    tripped that boost, so the two never actually disagreed — but a second
    definition of the same number is a divergence waiting to happen, and the
    level is the one thing this screen exists to be honest about.

    Shape mirrors ``UserSkillItem`` so a single component can render skills
    before and after they are published.
    """
    signals = [
        signal
        for signal in (baseline.get("skills_detected") or [])
        if signal.get("taxonomy_key")
    ]
    if not signals:
        return []

    level_map = scoring.build_skill_level_map(signals)
    evidence_map = scoring.best_evidence_by_key(signals)
    display_names = scores_repo.get_display_names_for_keys(list(level_map))

    candidates = [
        {
            "taxonomy_key": key,
            "name": display_names.get(key, key),
            "level": level,
            "proficiency_title": scoring._PROFICIENCY_TITLES.get(level, "Scout"),
            "evidence": evidence_map.get(key, ""),
        }
        for key, level in level_map.items()
    ]
    candidates.sort(key=lambda item: (-item["level"], item["name"].casefold()))
    return candidates


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


def _seniority_suggestion(baseline: dict[str, Any] | None) -> dict[str, Any]:
    """Return only seniority evidence that can be read from the parsed CV."""
    structured = (baseline or {}).get("cv_structured") or {}
    contact = structured.get("contact") or {}
    experience = [row for row in (structured.get("experience") or []) if isinstance(row, dict)]
    years = total_experience_years([str(row.get("dates") or "") for row in experience])
    if years is not None:
        level = seniority_for_experience_years(years)
        return {"value": level, "years": round(years), "source": "experience_years", "needs_choice": False}
    titles = [(contact.get("title") or "").strip()]
    if experience:
        titles.append(str(experience[0].get("role") or "").strip())
    for title in titles:
        level = seniority_for_candidate_title(title)
        if level:
            return {"value": level, "title": title, "source": "title", "needs_choice": False}
    return {"value": None, "source": "unknown", "needs_choice": True}


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

    if not baseline.get("skills_confirmed_at"):
        return {
            "kind": "awaiting_skill_confirmation",
            "baseline_version_id": int(baseline["id"]),
            "skills": _candidate_skills(ScoresRepository(db), baseline),
        }

    if not has_target:
        return {
            "kind": "awaiting_target",
            "baseline_version_id": int(baseline["id"]),
            "families": RoleFamiliesRepository(db).list_families(user_id),
            "seniority": _seniority_suggestion(baseline),
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
            "domain_skill_counts": score.get("domain_skill_counts") or {},
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


def build_first_success_checklist(
    state: dict[str, Any],
    *,
    skills_confirmed: bool,
    tailored_cv_exists: bool,
    tracked_application_exists: bool,
) -> dict[str, Any]:
    """Pure projection over persisted journey facts; no click-local completion."""
    items = [
        {"id": "confirm_skills", "label": "Confirm your CV skills", "href": "/onboarding/result", "done": skills_confirmed},
        {"id": "review_roles", "label": "Review your top roles", "href": "/onboarding/result", "done": bool(state.get("result_seen_at"))},
        {"id": "tailor_cv", "label": "Tailor one CV", "href": "/cv", "done": tailored_cv_exists},
        {"id": "track_application", "label": "Track one application", "href": "/tracker", "done": tracked_application_exists},
    ]
    return {
        "dismissed": bool(state.get("checklist_dismissed_at")),
        "complete": all(bool(item["done"]) for item in items),
        "items": items,
    }


def get_first_success_checklist(db: Client, user_id: str) -> dict[str, Any]:
    state = OnboardingRepository(db).get_state(user_id) or {}
    baseline = CVVersionsRepository(db).latest_baseline(user_id)
    tailored = (
        db.table("cv_versions")
        .select("id")
        .eq("user_id", user_id)
        .neq("kind", "baseline_upload")
        .limit(1)
        .execute()
        .data
        or []
    )
    tracked = (
        db.table("job_applications")
        .select("id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return build_first_success_checklist(
        state,
        skills_confirmed=bool(baseline and baseline.get("skills_confirmed_at")),
        tailored_cv_exists=bool(tailored),
        tracked_application_exists=bool(tracked),
    )
