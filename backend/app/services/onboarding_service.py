"""Orchestration for target capture, result assembly, and milestones."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
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
from app.services.experience_years import seniority_from_cv
from app.services.scoring.percentile import top_percent

logger = logging.getLogger(__name__)


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


def _normalize_locations(
    location: str | None, locations: list[str] | None
) -> list[str]:
    """De-duplicated, order-preserving city list from the singular-or-plural input.

    An empty list is meaningful — it is "Anywhere", the user's explicit choice to
    drop every city filter — so it is never conflated with "not supplied".
    """
    raw = locations if locations is not None else ([location] if location else [])
    seen: list[str] = []
    for value in raw:
        cleaned = (value or "").strip()
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return seen[:5]


def _normalize_families(
    role_family: str | None, role_families: list[str] | None
) -> list[str]:
    """De-duplicated, order-preserving family list from the singular-or-plural input."""
    raw = role_families if role_families is not None else ([role_family] if role_family else [])
    seen: list[str] = []
    for value in raw:
        cleaned = (value or "").strip()
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return seen[:5]


def role_title_updates(
    role_titles: list[str],
    *,
    role_family: str | None = None,
    role_families: list[str] | None = None,
) -> dict[str, Any]:
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
        "target_roles": _normalize_families(role_family, role_families),
    }


def save_target(
    db: Client,
    user_id: str,
    *,
    role_title: str | None = None,
    role_titles: list[str] | None = None,
    role_family: str | None = None,
    role_families: list[str] | None = None,
    seniority: str | None = None,
    location: str | None = None,
    locations: list[str] | None = None,
) -> None:
    """Canonical target-role write (issue #145 · multi-role, User Memory Phase 0).

    The user targets up to 5 human role titles (chips). Those titles are the
    source-of-record (`target_role_titles`); `target_roles` (taxonomy clusters,
    the matcher + aspiration ILIKE keys) is the DERIVED union across titles, and
    `target_role_title` stays the PRIMARY = titles[0] for back-compat + the score
    label. A point-of-use edit may supply either `role_title` or `role_titles`.
    Omitted `seniority`/`location` are preserved so a role-only edit never wipes
    them. Requires the `target_role_titles` column (migration 20260706).

    Locations are plural for the same reason roles are: `target_locations` is
    already an array end-to-end (`user_target_locations` → `build_location_scope`
    ORs across cities), so the singular `location` was a narrowing that lived
    only in this write path and the picker above it.
    """
    titles = _normalize_role_titles(role_title, role_titles)
    if not titles:
        raise ValueError("At least one target role is required.")

    users_repo = UsersRepository(db)
    profile = users_repo.get_profile(user_id) or {}
    if seniority is None:
        seniority = profile.get("target_seniority") or "any"
    chosen_locations = _normalize_locations(location, locations)
    if location is None and locations is None:
        # Neither form supplied → a role-only edit. Keep what they already chose.
        chosen_locations = [
            str(value).strip() for value in (profile.get("target_locations") or []) if str(value).strip()
        ] or ([profile["target_location"]] if profile.get("target_location") else [])
    updates = role_title_updates(titles, role_family=role_family, role_families=role_families)
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
    direction_changed = users_repo.update_profile(
        user_id,
        {
            **updates,
            "target_seniority": target_seniority_for_profile({"target_seniority": seniority}),
            "target_locations": chosen_locations,
        },
    )
    if not direction_changed:
        # Same direction re-submitted (a back-and-forward through the journey,
        # or a double-tap). The existing matches already answer this exact
        # question, and the refresh below runs the full Career-Ops brain with
        # `force`, bypassing the cache gate — so re-running it would spend a
        # real LLM pass to arrive back where the user already is.
        return
    OnboardingRepository(db).patch_state(
        user_id,
        {"current_stage": "result", "status": "analyzing"},
    )
    background.enqueue(
        background.LANE_FAST,
        "onboarding_target_refresh",
        payload={"user_id": user_id},
        # Idempotency key must reflect the choice actually written, or a user who
        # only changes cities re-uses the previous job id and their edit is a no-op.
        correlation_id=(
            f"target:{user_id}:{'|'.join(titles)}:{seniority}:{','.join(chosen_locations)}"
        ),
    )


def reset_target(db: Client, user_id: str) -> None:
    """Return a confirmed-skill user to direction selection without data loss."""
    UsersRepository(db).update_profile(
        user_id,
        {
            "target_role_title": None,
            "target_role_titles": [],
            "target_roles": [],
            "target_career_band": None,
            "explored_career_bands": [],
        },
    )
    OnboardingRepository(db).patch_state(
        user_id,
        {"current_stage": "result", "status": "result_ready"},
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
        # FAST, not BULK. The bulk lane is documented "nobody is watching" — and
        # the onboarding shortlist is the most-watched job in the product: the
        # result screen polls for it every 2.5s while the user waits on step 3.
        # (Head-of-line risk against CV analysis is real but theoretical at this
        # volume; if throughput ever bites, that is a lane-count decision, not a
        # reason to file a watched job under "nobody is watching".)
        background.enqueue(
            background.LANE_FAST,
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
    """Seniority evidence readable from the parsed CV.

    Thin alias over `experience_years.seniority_from_cv`, which the confirm-skills
    step also reads so the band the score is computed against is the same one this
    screen offers.
    """
    return seniority_from_cv(baseline)


# One score re-enqueue per user per window. Long enough that a 2s poll cannot turn
# a stalled user into a job storm; short enough that a user who waits through one
# "this is taking longer" prompt gets a genuine second attempt.
_SCORE_HEAL_WINDOW_SECONDS = 120


def _heal_missing_score(user_id: str) -> None:
    """Re-enqueue the score job for a user whose skills and direction are both in,
    but whose score never landed.

    This branch used to be a pure read, which made a lost job permanent: RQ
    retried three times, exhausted, and `get_result` then answered
    `full_result_processing` forever. Three prod users sat there after the
    2026-07-31 `domain_skill_counts` outage with no path back except a support
    ticket — the poll that was supposed to reveal the score was the only thing
    still running, and it asked for nothing.

    Debounced, so the repair cannot become the next incident, and fail-soft: a
    heal that cannot be enqueued must not take down the result screen with it.
    """
    if not background.claim(f"score-heal:{user_id}", _SCORE_HEAL_WINDOW_SECONDS):
        return
    try:
        background.enqueue(
            background.LANE_FAST,
            "onboarding_target_refresh",
            payload={"user_id": user_id},
            correlation_id=f"score-heal:{user_id}",
        )
        logger.info("metric onboarding.score_heal_enqueued user=%s", user_id)
    except Exception as exc:  # noqa: BLE001 — never fail the result read
        logger.warning(
            "metric onboarding.score_heal_failed user=%s exc=%s",
            user_id, exc.__class__.__name__,
        )


_MATCH_GRACE_SECONDS = 300
_MATCH_HEAL_WINDOW_SECONDS = 300


def _parse_ts(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _heal_outstanding_matches(user_id: str) -> None:
    """Re-run a match that was enqueued for this direction and never landed.

    Same shape as `_heal_missing_score`, for the same reason: a read that can
    only report leaves a lost job lost forever, and the poll asking about it is
    the one thing still running. Debounced and fail-soft — a repair must not
    become the next incident, and it must never take down the screen it repairs.
    """
    if not background.claim(f"match-heal:{user_id}", _MATCH_HEAL_WINDOW_SECONDS):
        return
    try:
        background.enqueue(
            background.LANE_FAST,
            "initial_match",
            payload={"user_id": user_id, "force_context_refresh": True},
            correlation_id=f"match-heal:{user_id}",
        )
        logger.info("metric onboarding.match_heal_enqueued user=%s", user_id)
    except Exception as exc:  # noqa: BLE001 — never fail the result read
        logger.warning(
            "metric onboarding.match_heal_failed user=%s exc=%s",
            user_id, exc.__class__.__name__,
        )


def _shortlist(
    db: Client,
    user_id: str,
    profile: dict[str, Any],
    baseline_version_id: int,
    context_hash: str,
) -> tuple[list[dict[str, Any]], str]:
    """The first shortlist, scoped to the direction that produced it.

    Returns `(rows, status)` where status is one of:

    - ``ready``    — matches exist for this exact (baseline, direction).
    - ``computing``— a run for this direction is outstanding and still young.
    - ``stalled``  — outstanding past the grace window; re-enqueued, and the
      user is told rather than left watching a spinner forever.
    - ``empty``    — the run for this direction finished and matched nothing.

    The status is derived, not guessed: `last_match_run_at` is stamped only by
    `match_run.run_match` on completion, and `target_updated_at` only by a
    direction change, so `ran >= changed` is a fact about work that finished
    for the direction currently on screen.
    """
    from app.routers.jobs._shared import last_monday, to_job_match

    rows = JobsRepository(db).get_matches_for_context(
        user_id, baseline_version_id, context_hash, limit=3
    )
    if rows:
        batch_week = last_monday()
        return [to_job_match(row, batch_week).model_dump(mode="json") for row in rows], "ready"

    ran_at = _parse_ts(profile.get("last_match_run_at"))
    changed_at = _parse_ts(profile.get("target_updated_at"))
    if ran_at and changed_at and ran_at >= changed_at:
        # A run covering this direction completed and produced nothing. Not a
        # failure — the market genuinely has no overlap. Offer a new direction.
        return [], "empty"

    age = (datetime.now(timezone.utc) - changed_at).total_seconds() if changed_at else None
    if age is None or age <= _MATCH_GRACE_SECONDS:
        return [], "computing"
    _heal_outstanding_matches(user_id)
    return [], "stalled"


# The optional Career-Ops inputs, by the names the pre-flight manifest gives
# them. Onboarding already fixes target roles, location and the CV; these three
# are what a user can add later to sharpen the same run.
_OPS_OPTIONAL_INPUTS = ("deal_breakers", "career_goal", "superpower")


def _unused_ops_inputs(profile: dict[str, Any]) -> list[str]:
    """Which optional Career-Ops inputs this user has not supplied.

    Reported, never invented: the pre-flight modal can gap-fill these from
    memory, but a receipt of a run that already happened must not present a
    suggestion as something the run used.
    """
    unused: list[str] = []
    for key in _OPS_OPTIONAL_INPUTS:
        value = profile.get(key)
        filled = bool(value.strip()) if isinstance(value, str) else bool(value)
        if not filled:
            unused.append(key)
    return unused


def _reviewable_step(
    db: Client,
    user_id: str,
    profile: dict[str, Any],
    baseline: dict[str, Any],
    step: int,
) -> dict[str, Any] | None:
    """Re-render an already-completed step, with the user's answers restored.

    Nothing here writes. The journey's step used to BE its facts — skills
    confirmed, target set — so "where you are" and "what you decided" were the
    same variable and the only way back was to erase a decision. That made going
    back destructive (step 2 came back blank) and going forward impossible
    without re-choosing, which also re-ran the matcher. A view cursor separates
    the two: looking is free, only changing an answer costs anything.
    """
    if step == 1:
        return {
            "kind": "awaiting_skill_confirmation",
            "baseline_version_id": int(baseline["id"]),
            "skills": _candidate_skills(ScoresRepository(db), baseline),
            "journey_step": 1,
        }
    if step == 2:
        families_repo = RoleFamiliesRepository(db)
        chosen_keys = [str(key) for key in (profile.get("target_roles") or []) if str(key).strip()]
        selected = families_repo.resolve_families(user_id, chosen_keys)
        suggested = families_repo.list_families(user_id)
        chosen = {str(row.get("family")) for row in selected}
        return {
            "kind": "awaiting_target",
            "baseline_version_id": int(baseline["id"]),
            # Chosen first, then the suggestions they didn't take — so a pick made
            # through search is still on screen when they come back to it.
            "families": selected + [row for row in suggested if str(row.get("family")) not in chosen],
            "seniority": _seniority_suggestion(baseline),
            "selected": {
                "families": selected,
                "seniority": profile.get("target_seniority") or None,
                "locations": [
                    str(value).strip()
                    for value in (profile.get("target_locations") or [])
                    if str(value).strip()
                ],
            },
            "journey_step": 2,
        }
    return None


def get_result(db: Client, user_id: str, *, step: int | None = None) -> dict[str, Any]:
    """The step the user should see.

    `step` is a VIEW cursor, not progress: it may only look at ground already
    covered. `furthest_step` rides on every payload so the client knows which
    way it can move without asking.
    """
    result = _current_result(db, user_id)
    furthest = int(result.get("journey_step") or 0) or (
        3 if result.get("kind") in ("full_result_ready", "first_role_saved") else 0
    )
    result["furthest_step"] = furthest

    if step is None or step >= furthest or furthest == 0:
        return result

    users_repo = UsersRepository(db)
    profile = users_repo.get_profile(user_id) or {}
    baseline = CVVersionsRepository(db).latest_baseline(user_id)
    if not baseline:
        return result
    review = _reviewable_step(db, user_id, profile, baseline, step)
    if review is None:
        return result
    review["furthest_step"] = furthest
    return review


def _current_result(db: Client, user_id: str) -> dict[str, Any]:
    onboarding_repo = OnboardingRepository(db)
    users_repo = UsersRepository(db)
    state = onboarding_repo.get_state(user_id) or {}
    profile = users_repo.get_profile(user_id) or {}
    baseline = CVVersionsRepository(db).latest_baseline(user_id)

    if state.get("completed_at") and state.get("credible_job_saved_at"):
        from app.services.onboarding_first_role import saved_first_role

        saved = saved_first_role(JobsRepository(db), user_id)
        if saved:
            return {"kind": "first_role_saved", **saved}

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
        # Step 1. The CV is still being read, so nothing has been checked and no
        # direction chosen — the progress rail must not tick those off. It did,
        # because the frontend mapped every `full_result_processing` to step 3,
        # and this branch and the post-target one share the kind.
        return {
            "kind": "full_result_processing",
            "target": target,
            "phase": (job or {}).get("current_phase") or "queued",
            "journey_step": 1,
        }

    if not baseline.get("skills_confirmed_at"):
        return {
            "kind": "awaiting_skill_confirmation",
            "baseline_version_id": int(baseline["id"]),
            "skills": _candidate_skills(ScoresRepository(db), baseline),
            "journey_step": 1,
        }

    if not has_target:
        return {
            "kind": "awaiting_target",
            "baseline_version_id": int(baseline["id"]),
            "families": RoleFamiliesRepository(db).list_families(user_id),
            "seniority": _seniority_suggestion(baseline),
            # Same shape as the reviewed step, empty here. One payload shape means
            # the client seeds its form the same way whichever way it arrived.
            "selected": {"families": [], "seniority": None, "locations": []},
            "journey_step": 2,
        }

    score = ScoresRepository(db).get_mirror_score(user_id)
    if not score:
        _heal_missing_score(user_id)
        return {
            # Step 3: skills checked, direction chosen — only the score is left.
            "kind": "full_result_processing",
            "target": target,
            "phase": "scoring",
            "journey_step": 3,
        }

    context_hash = target_context_hash(
        int(baseline["id"]),
        target["role_title"],
        target["seniority"],
        target["location"],
    )
    shortlist, shortlist_status = _shortlist(
        db, user_id, profile, int(baseline["id"]), context_hash
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
        # Server-authored, direction-scoped. The screen and `commit_first_role`
        # now read the same rows through the same function, so a card can never
        # be offered that the save will refuse.
        "shortlist": shortlist,
        "shortlist_status": shortlist_status,
        # This shortlist IS a Career-Ops run — the same brain, on the house. The
        # user was never told that, and met the vocabulary for the first time on
        # a modal quoting 100 coins. Naming the run here, and naming the inputs
        # it did NOT have, teaches the surface before it ever charges for it.
        "career_ops": {"sharpeners": _unused_ops_inputs(profile)},
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
