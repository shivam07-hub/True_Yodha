"""Orchestration for target capture, result assembly, and milestones."""
from __future__ import annotations

import hashlib
import json
import logging
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
from app.services.concurrent_reads import run_concurrently
from app.services.experience_years import seniority_from_cv

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


def context_key(profile: dict[str, Any]) -> str | None:
    """THE derivation of a targeting profile's direction key. One function, so the
    writer and the reader cannot produce different keys for the same direction.

    They did. `evaluate_credibility` normalised (`.strip().lower()` on seniority)
    and required a role title; `get_result` built its own `target` dict with
    neither. The missing-title half was live — 162 users, see CONTEXT.md "Targeting
    Brief" — and the normalisation half was latent only because no profile in prod
    happened to carry an untrimmed or capitalised value. A key with two producers
    is a bug waiting for the first row that tells them apart.

    Returns None only when there is no baseline to scope to — the queries that use
    this key (`get_matches_for_context`, `get_current_credible_match`) filter on
    `baseline_version_id` too, so a keyless row is unreadable by them either way.
    A blank direction still gets a key: absence of a title is a direction we can
    name, not a reason to withhold the name.
    """
    baseline_id = profile.get("baseline_version_id")
    if not baseline_id:
        return None
    return target_context_hash(
        int(baseline_id),
        str(profile.get("target_role_title") or "").strip(),
        str(profile.get("target_seniority") or "any").strip().lower(),
        str(profile.get("target_location") or "").strip(),
    )


def eval_context_key(profile: dict[str, Any]) -> str:
    """What the BRAIN saw when it judged a job — the staleness key for an eval.

    Distinct from `context_key`, and deliberately a second field rather than a
    widened first one, because they answer different questions:

    - `context_key` (`user_job_matches.target_context_hash`) — WHICH DIRECTION a
      verdict belongs to. A scoping key. The onboarding shortlist filters on it, so
      it must move only when the user changes direction; folding memory into it
      would make a distiller write invalidate a shortlist mid-read.
    - `eval_context_key` (`user_job_matches.eval_context_hash`) — WHAT THE BRAIN
      WAS TOLD. Direction *plus* the `known_facts` block the Career Ops prompt
      renders. Only the skip gates read it, to answer "is this cached verdict still
      the answer, or was it computed against something we no longer believe?"

    Two keys, two names, two questions. One key doing both would either re-rate on
    every memory edit or never re-rate at all.

    Always returns a key — unlike `context_key`, which is None without a baseline
    because the queries that use it filter on `baseline_version_id` anyway. A None
    here would compare equal to another None and silently disable re-rating for
    exactly the users least likely to be noticed.

    Hashes the facts in the order the prompt lists them (post-cap), not a sorted
    set: the prompt's order is part of what the brain was told, and
    `UserMemoryRepository.list_active` now orders totally, so the order moves only
    when the facts do.
    """
    raw = json.dumps(
        [
            profile.get("baseline_version_id"),
            str(profile.get("target_role_title") or "").strip().casefold(),
            str(profile.get("target_seniority") or "any").strip().lower(),
            str(profile.get("target_location") or "").strip().casefold(),
            [str(f) for f in (profile.get("known_facts") or [])],
        ],
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def eval_matches_context(row: dict[str, Any] | None, eval_ctx: str) -> bool:
    """Was this cached verdict reasoned from `eval_ctx`?

    The one rule every skip gate asks — `jobs_workflow`'s cache fetcher (the Myro
    Ops Search), `on_demand.ensure_job_eval` (brain-on-open), and
    `feed_warm.warm_feed_shortlist` (the /market top-10). Three copies of a
    staleness test is how they drift apart; the gates still differ in what ELSE
    they require of a row (on-open also insists on a real score, so a Provisional
    Match recomputes), and that difference stays visible at each call site instead
    of being smuggled in here.

    A NULL key is not "still valid" — it is "we cannot tell", which is a re-rate.
    Every row written before the column existed reads that way, which is exactly
    what makes the next Search correct without a backfill.
    """
    return bool(row) and (row or {}).get("eval_context_hash") == eval_ctx


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


_DIRECTION_PHRASE_CAP = 6
_DIRECTION_PHRASE_MAX_CHARS = 120
_LEAN_KIND = "preference"


def _normalize_direction_phrases(values: list[str]) -> list[str]:
    """De-duplicated, order-preserving clauses for `avoid` / `lean`.

    These are sentences, not tags — "avoids large corporations", not "no-bigco" —
    because they are rendered into a paragraph the user reads back and because the
    ranker reads them as language. Case-insensitive de-dup, since the same answer
    typed twice at different steps should not appear twice in one sentence.
    """
    seen: list[str] = []
    lowered: set[str] = set()
    for value in values:
        cleaned = " ".join((value or "").split())[:_DIRECTION_PHRASE_MAX_CHARS]
        key = cleaned.lower()
        if cleaned and key not in lowered:
            lowered.add(key)
            seen.append(cleaned)
    return seen[:_DIRECTION_PHRASE_CAP]


def replace_authored_leans(db: Client, user_id: str, leans: list[str]) -> bool:
    """Make the user's authored `preference` facts exactly `leans`. Returns whether
    anything moved.

    Only AUTHORED facts are touched. A distilled preference is Myro's own reading
    and is left alone — it gets proposed back at the next confirm rather than
    deleted behind the user's back. Fail-soft: the direction write above has
    already landed, and losing a lean must not fail the step the user is standing
    on.
    """
    from app.repositories.user_memory import UserMemoryRepository

    repo = UserMemoryRepository(db)
    leans = _normalize_direction_phrases(leans)
    try:
        existing = [
            row for row in repo.list_active(user_id, kinds=[_LEAN_KIND])
            if (row.get("source") or "authored") == "authored"
        ]
        current = [(row.get("text") or "").strip() for row in existing]
        if current == leans:
            return False
        # Two round trips, not one per lean. This ran inside POST /preflight/run,
        # which starts the user's search: a user with 19 confirmed leans paid
        # 19 deletes + 19 inserts sequentially against a shared Postgres, and the
        # client hit its 15s timeout before the run was ever dispatched.
        repo.delete_many(user_id, [str(row.get("id")) for row in existing])
        repo.add_many(user_id, [{"kind": _LEAN_KIND, "text": text} for text in leans])
        return True
    except Exception as exc:  # noqa: BLE001 — the direction itself is already saved
        logger.warning(
            "metric onboarding.lean_write_failed user=%s reason=%s",
            user_id, exc.__class__.__name__,
        )
        return False


def _direction_answer(db: Client, user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    """What Myro currently believes the user is drawn to and away from, plus where
    each half came from.

    Confirmed answers win: the `deal_breakers` column and authored `preference`
    facts are the user's own words and are returned as-is. Only when a half is
    empty is it gap-filled from Myro's own reading — the same fill-empty-only rule
    the pre-flight already uses — and `proposed` names that half so the step can
    say "read from your CV" instead of presenting a guess as a decision.
    """
    from app.repositories.user_memory import UserMemoryRepository
    from app.services.matching.targeting import _DEAL_BREAKER_KINDS

    proposed: list[str] = []
    avoid = [str(v).strip() for v in (profile.get("deal_breakers") or []) if str(v).strip()]
    lean: list[str] = []
    try:
        rows = UserMemoryRepository(db).list_active(
            user_id, kinds=[_LEAN_KIND, *_DEAL_BREAKER_KINDS]
        )
    except Exception:  # noqa: BLE001 — a memory outage must not block the step
        rows = []

    authored_leans = [
        (r.get("text") or "").strip() for r in rows
        if r.get("kind") == _LEAN_KIND and (r.get("source") or "authored") == "authored"
    ]
    lean = [text for text in authored_leans if text]
    if not lean:
        lean = [
            text for text in (
                (r.get("text") or "").strip() for r in rows
                if r.get("kind") == _LEAN_KIND
            ) if text
        ][:_DIRECTION_PHRASE_CAP]
        if lean:
            proposed.append("lean")
    if not avoid:
        avoid = [
            text for text in (
                (r.get("text") or "").strip() for r in rows
                if r.get("kind") in _DEAL_BREAKER_KINDS
            ) if text
        ][:_DIRECTION_PHRASE_CAP]
        if avoid:
            proposed.append("avoid")
    return {"avoid": avoid, "lean": lean, "proposed": proposed}


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
    return seen[:3]


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
    avoid: list[str] | None = None,
    lean: list[str] | None = None,
) -> None:
    """Canonical target-role write (issue #145 · multi-role, User Memory Phase 0).

    The user targets up to 5 human role titles (chips). Those titles are the
    source-of-record (`target_role_titles`); `target_roles` (taxonomy clusters,
    the matcher scoping key) is the DERIVED union from the selected family, and
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

    from app.services import targeting_write

    users_repo = UsersRepository(db)
    profile = users_repo.get_profile(user_id) or {}
    patch: dict[str, Any] = {
        "target_role_titles": titles,
        "role_family": role_family,
        "role_families": role_families,
    }
    if seniority is not None:
        patch["target_seniority"] = seniority
    chosen_locations: list[str] | None = None
    if location is not None or locations is not None:
        chosen_locations = _normalize_locations(location, locations)
        patch["target_locations"] = chosen_locations
    else:
        chosen_locations = [
            str(value).strip() for value in (profile.get("target_locations") or []) if str(value).strip()
        ] or ([profile["target_location"]] if profile.get("target_location") else [])
    if avoid is not None:
        patch["deal_breakers"] = _normalize_direction_phrases(avoid)
    if lean is not None:
        patch["lean"] = lean
    result = targeting_write.commit(users_repo, user_id, patch)
    stored_seniority = str((result.profile or {}).get("target_seniority") or seniority or "")
    if not result.direction_changed and not result.leans_changed:
        return
    background.enqueue(
        background.LANE_FAST,
        "onboarding_target_refresh",
        payload={"user_id": user_id},
        correlation_id=(
            f"target:{user_id}:{'|'.join(titles)}:{stored_seniority}:{','.join(chosen_locations or [])}"
            f":{','.join(patch.get('deal_breakers') or [])}"
            f":{','.join(_normalize_direction_phrases(lean) if lean is not None else [])}"
        ),
    )


def complete_onboarding_after_direction(db: Client, user_id: str) -> None:
    """Direction is the last onboarding page — Market is home after this.

    Requires a claimed ninja name (public identity). A signup placeholder slug
    does not count. Raises ValueError when the claim is still missing so the
    client can keep the user on Direction rather than landing them half-set-up.
    """
    state = OnboardingRepository(db).get_state(user_id) or {}
    if state.get("completed_at"):
        return
    baseline = CVVersionsRepository(db).latest_baseline(user_id)
    if not baseline or not baseline.get("skills_confirmed_at"):
        return
    from app.services.career_target import is_canonical_direction

    profile = UsersRepository(db).get_profile(user_id) or {}
    if not is_canonical_direction(profile):
        return
    if not profile.get("ninja_name_claimed_at"):
        raise ValueError("Claim your Myro name before continuing.")
    mark_completed(db, user_id)


def reset_target(db: Client, user_id: str) -> None:
    """Return a confirmed-skill user to direction selection without data loss."""
    from app.services import targeting_write

    targeting_write.commit(
        UsersRepository(db),
        user_id,
        {
            "target_role_titles": [],
            "role_families": [],
            "target_career_band": None,
            "explored_career_bands": [],
        },
    )


def seed_provisional_baseline_score(
    db: Client, user_id: str, baseline_version_id: int,
) -> bool:
    """Score from extraction while the user reviews skills — before confirm.

    Confirm is still the publication gate for *canonical* skills. This writes a
    best-effort ``user_skills`` + ``mirror_scores`` row from ``skills_detected``
    so Direction → Market does not wait on a cold score heal. Confirm replaces
    the skill rows; excludes force a recompute via ``enqueue_score_refresh``.
    """
    baseline = CVVersionsRepository(db).find(baseline_version_id, user_id)
    if not baseline or baseline.get("skills_confirmed_at"):
        return False
    scores_repo = ScoresRepository(db)
    if scores_repo.mirror_score_exists(user_id):
        return False
    signals = baseline.get("skills_detected") or []
    if not signals:
        return False
    users_repo = UsersRepository(db)
    profile = users_repo.get_profile(user_id) or {}
    if not (profile.get("target_seniority") or "").strip():
        suggestion = seniority_from_cv(baseline)
        value = suggestion.get("value")
        if value:
            from app.services import targeting_write
            targeting_write.commit(users_repo, user_id, {"target_seniority": value})
    try:
        scoring.record_cv_score(scores_repo, user_id, signals)
    except ValueError:
        logger.info(
            "metric onboarding.provisional_score_skipped user=%s baseline=%s reason=no_skills",
            user_id, baseline_version_id,
        )
        return False
    logger.info(
        "metric onboarding.provisional_score_seeded user=%s baseline=%s",
        user_id, baseline_version_id,
    )
    return True


def enqueue_provisional_baseline_score(user_id: str, baseline_version_id: int) -> bool:
    """Ask for a pre-confirm score while skill review is on screen."""
    try:
        background.enqueue(
            background.LANE_FAST,
            "provisional_baseline_score",
            payload={
                "user_id": user_id,
                "baseline_version_id": baseline_version_id,
            },
            correlation_id=f"provisional-score:{user_id}:{baseline_version_id}",
        )
        logger.info(
            "metric onboarding.provisional_score_enqueued user=%s baseline=%s",
            user_id, baseline_version_id,
        )
        return True
    except Exception as exc:  # noqa: BLE001 — never fail the upload that asked
        logger.warning(
            "metric onboarding.provisional_score_enqueue_failed user=%s baseline=%s exc=%s",
            user_id, baseline_version_id, exc.__class__.__name__,
        )
        return False


@background.handler("provisional_baseline_score")
async def provisional_baseline_score_job(payload: dict[str, Any], allow_retry: bool) -> None:
    user_id = str(payload["user_id"])
    baseline_version_id = int(payload["baseline_version_id"])
    seed_provisional_baseline_score(get_supabase_admin(), user_id, baseline_version_id)


@background.handler("onboarding_target_refresh")
async def refresh_target_result(payload: dict[str, Any], allow_retry: bool) -> None:
    user_id = str(payload["user_id"])
    db = get_supabase_admin()
    baseline = CVVersionsRepository(db).latest_baseline(user_id)
    if not baseline or not baseline.get("skills_confirmed_at"):
        return
    scores_repo = ScoresRepository(db)
    if scores_repo.get_user_skill_level_map(user_id):
        # Provisional score during skill review: skip recompute when confirm
        # left the skill set unchanged and the row already exists.
        if not (
            payload.get("score_fresh") and scores_repo.mirror_score_exists(user_id)
        ):
            scoring.recompute_score(scores_repo, user_id)
        # Match only when there is a direction to match against. This handler is
        # now also the score path for a user who has just confirmed skills and has
        # NOT chosen a direction yet — and the shortlist is direction-scoped, so
        # running the Career-Ops brain here would spend a real LLM pass to answer
        # a question the user has not asked.
        profile = UsersRepository(db).get_profile(user_id) or {}
        has_target = bool(
            profile.get("target_role_title") or profile.get("target_role_titles")
        )
        if has_target:
            # FAST lane: the user is already on Market after Direction. Match
            # fills the feed in the background — do not invent a waiting room.
            background.enqueue(
                background.LANE_FAST,
                "initial_match",
                payload={"user_id": user_id, "force_context_refresh": True},
                correlation_id=f"target-match:{user_id}",
            )


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


def enqueue_score_refresh(
    user_id: str,
    *,
    reason: str,
    force: bool = False,
    score_fresh: bool = False,
) -> bool:
    """Ask for this user's score to be (re)computed in the background.

    ONE enqueue seam for callers that want a score: skill confirmation hands
    the computation off rather than making the user watch it. Debounced so a
    confirm immediately followed by another refresh cannot enqueue the same
    work twice.

    ``force`` bypasses the debounce when confirmed skills differ from the
    provisional set (user excluded something). ``score_fresh`` tells the worker
    to skip recompute when a provisional ``mirror_scores`` row already exists.

    Debounced so the repair cannot become the next incident, and fail-soft: a
    refresh that cannot be enqueued must not take down the screen that asked
    for it. Returns whether work was enqueued, for the caller's log.
    """
    claimed = background.claim(f"score-heal:{user_id}", _SCORE_HEAL_WINDOW_SECONDS)
    if not force and not claimed:
        return False
    payload: dict[str, Any] = {"user_id": user_id}
    if score_fresh:
        payload["score_fresh"] = True
    try:
        background.enqueue(
            background.LANE_FAST,
            "onboarding_target_refresh",
            payload=payload,
            correlation_id=f"score-heal:{user_id}",
        )
        logger.info(
            "metric onboarding.score_refresh_enqueued user=%s reason=%s force=%s fresh=%s",
            user_id, reason, force, score_fresh,
        )
        return True
    except Exception as exc:  # noqa: BLE001 — never fail the read that asked
        logger.warning(
            "metric onboarding.score_refresh_failed user=%s reason=%s exc=%s",
            user_id, reason, exc.__class__.__name__,
        )
        return False


# The optional Career-Ops inputs, by the names the pre-flight manifest gives
# them. Onboarding already fixes target roles, location and the CV; these three
# are what a user can add later to sharpen a Myro Search.
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
        from app.services import ninja_name as nn

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
            "direction": _direction_answer(db, user_id, profile),
            "ninja": nn.suggestion_for(user_id, db),
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
        2 if result.get("kind") in (
            "onboarding_complete", "first_role_saved", "full_result_ready",
        ) else 0
    )
    result["furthest_step"] = furthest

    if step is None or step > furthest or furthest == 0:
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


def _parallel(db: Client, reads: dict[str, Any]) -> dict[str, Any]:
    """Run independent reads at once and return them by name.

    This endpoint is polled during CV analysis (step 1). Direction completes
    onboarding and sends the user to Market, so it is no longer polled for a
    shortlist wait. Keep the fan-out parallel: each call was a chain of
    sequential Supabase round trips when these reads ran in series.

    Same shape and same safety argument as `/home/bootstrap` and `/jobs/feed`: the
    admin client is a process-wide singleton whose underlying `httpx.Client` is
    threadsafe, each `.table()` builds its own request, and nothing here mutates
    shared query state (there is not even a per-request auth header to race, which
    is what bootstrap had to reason about). Each read is still bounded by the 8s
    PostgREST timeout, so the slowest caps the tail.
    """
    return run_concurrently(reads, label="onboarding.result")


JourneyPosition = str  # "experience" | "result" | "completed"


def journey_position(db: Client, user_id: str) -> dict[str, Any]:
    """Where this user is in onboarding, and the durable facts a screen needs.

    ONE answer, derived. There used to be two: `user_onboarding_state.status` and
    `.current_stage` were a stored copy, written in THIRTEEN places and read for a
    decision in TWO — while `_current_result` independently derived the same thing
    from the facts, and it was the derivation that actually decided what rendered.
    A `patch_state` forgotten at any of the thirteen desynced the entry redirect
    from the screen it sent you to. `start_over` already did exactly that: it set
    the stage back to `experience` without clearing the baseline, so the two models
    disagreed and the stored one won for precisely one screen.

    Three positions, because that is what the callers actually ask:
      - ``experience`` — nothing started; show the upload door.
      - ``result``     — work is in flight or done; the journey screen owns them.
      - ``completed``  — finished; they belong in the product, not the funnel.
    """
    from app.services.career_target import is_canonical_direction

    repo = OnboardingRepository(db)
    facts = _parallel(db, {
        "state": lambda: repo.get_state(user_id),
        "baseline": lambda: CVVersionsRepository(db).latest_baseline(user_id),
        "profile": lambda: UsersRepository(db).get_profile(user_id),
    })
    state = facts["state"] or {}
    started = bool(facts["baseline"] or state.get("upload_job_id"))
    # `completed_at` is a flag; a direction is the fact. `_current_result` already
    # refuses to trust the flag alone — it falls through to Direction when the
    # profile cannot mint a target. This function is the ENTRY redirect and used
    # the flag by itself, so it bounced those users to /market before the result
    # endpoint could offer them the step. One rule, both callers, or the door and
    # the room disagree.
    finished = bool(state.get("completed_at")) and is_canonical_direction(facts["profile"] or {})
    position = (
        "completed" if finished
        else "result" if started
        else "experience"
    )
    return {
        "user_id": user_id,
        "position": position,
        "generator_step": state.get("generator_step") or 1,
        "generator_answers": state.get("generator_answers") or {},
        "generated_draft": state.get("generated_draft"),
        "entry_mode": state.get("entry_mode"),
        "upload_job_id": state.get("upload_job_id"),
        "accepted_file_metadata": state.get("accepted_file_metadata") or {},
        "checklist_dismissed_at": state.get("checklist_dismissed_at"),
        "score_gap_reviewed_at": state.get("score_gap_reviewed_at"),
        "credible_job_saved_at": state.get("credible_job_saved_at"),
        "tailored_cv_created_at": state.get("tailored_cv_created_at"),
        "activation_kind": state.get("activation_kind"),
    }


def _awaiting_target_payload(
    db: Client,
    user_id: str,
    profile: dict[str, Any],
    baseline: dict[str, Any],
    *,
    include_families: bool = True,
) -> dict[str, Any]:
    """Direction step payload. Families are optional — confirm-skills returns
    without them so the button is not blocked on `list_role_families`; the
    Direction screen loads suggestions itself.
    """
    from app.services import ninja_name as nn

    families_repo = RoleFamiliesRepository(db)
    families = families_repo.list_families(user_id) if include_families else []
    chosen_keys = [
        str(key) for key in (profile.get("target_roles") or []) if str(key).strip()
    ]
    selected_families = (
        families_repo.resolve_families(user_id, chosen_keys) if include_families and chosen_keys else []
    )
    from app.services.job_eligibility import SOURCE_SENIORITY, canonical_source_seniority

    stored_band = canonical_source_seniority(profile.get("target_seniority"))
    stored_locations = [
        str(value).strip()
        for value in (profile.get("target_locations") or [])
        if str(value).strip()
    ][:3]
    chosen = {str(row.get("family")) for row in selected_families}
    return {
        "kind": "awaiting_target",
        "baseline_version_id": int(baseline["id"]),
        "families": selected_families + [row for row in families if str(row.get("family")) not in chosen],
        "seniority": _seniority_suggestion(baseline),
        "selected": {
            "families": selected_families,
            "seniority": stored_band if stored_band in SOURCE_SENIORITY else None,
            "locations": stored_locations,
        },
        "direction": _direction_answer(db, user_id, profile),
        "ninja": nn.suggestion_for(user_id, db),
        "journey_step": 2,
        "furthest_step": 2,
    }


def _current_result(db: Client, user_id: str) -> dict[str, Any]:
    users_repo = UsersRepository(db)
    facts = _parallel(db, {
        "state": lambda: OnboardingRepository(db).get_state(user_id),
        "profile": lambda: users_repo.get_profile(user_id),
        "baseline": lambda: CVVersionsRepository(db).latest_baseline(user_id),
    })
    state = facts["state"] or {}
    profile = facts["profile"] or {}
    baseline = facts["baseline"]

    from app.services.career_target import is_canonical_direction as _is_canonical

    # Completed onboarding lands on Market. A legacy first-role save still has a
    # tailor receipt; everyone else who finished Direction goes to /market.
    #
    # BUT completion is not taken on trust. 111 users carry `completed_at` with
    # no canonical direction — they came through a window where the gate was
    # leaky, between 2026-04-20 and 2026-06-20. For them this early return was a
    # closed door: the Market nudge is hidden because they are "complete", and
    # navigating to /onboarding bounced them straight back here. No path existed
    # to the one step that matters — users with a target apply at 26%, this
    # cohort at 9%.
    #
    # A flag is not the fact. Fall through and let them finish Direction.
    if state.get("completed_at"):
        # A saved first role is evidence of a finished journey in its own right —
        # the receipt stands regardless of what the profile looks like now.
        if state.get("credible_job_saved_at"):
            from app.services.onboarding_first_role import saved_first_role

            saved = saved_first_role(JobsRepository(db), user_id)
            if saved:
                return {"kind": "first_role_saved", **saved}
        if _is_canonical(profile):
            return {
                "kind": "onboarding_complete",
                "redirect_to": "/market",
                "journey_step": 2,
            }
        # Completed, no receipt, no direction — fall through to Direction.

    from app.services.career_target import SOURCE_SENIORITY, is_canonical_direction

    target = {
        "role_title": profile.get("target_role_title") or "",
        "seniority": profile.get("target_seniority") or "any",
        "location": profile.get("target_location") or "",
    }
    has_target = is_canonical_direction(profile)
    if not baseline:
        # There is no `profile_preview` step any more. Describing your experience
        # used to run a SECOND text→baseline pipeline that shadowed the Upload
        # Guarantee without inheriting it, and ended on an estimate RANGE — a
        # second scoring model beside the canonical one (OQ4). It now goes through
        # `start_cv_upload_job_from_text`, the same call `/baseline/approve` already
        # made, so a description produces a real baseline and a real Myro Score and
        # lands on this same step-1 wait.
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

    if not has_target or not profile.get("ninja_name_claimed_at"):
        # Direction is the last onboarding page. Target and claimed ninja name
        # are both required before Market. If a target was saved without a claim
        # (legacy / race), keep them on Direction until the name is claimed.
        payload = _awaiting_target_payload(db, user_id, profile, baseline)
        has_partial = bool(
            profile.get("target_roles")
            or profile.get("target_role_titles")
            or profile.get("target_role_title")
        )
        if has_partial:
            families_repo = RoleFamiliesRepository(db)
            chosen_keys = [
                str(key) for key in (profile.get("target_roles") or []) if str(key).strip()
            ]
            selected = families_repo.resolve_families(user_id, chosen_keys)
            stored_seniority = str(profile.get("target_seniority") or "")
            payload["selected"] = {
                "families": selected,
                "seniority": stored_seniority if stored_seniority in SOURCE_SENIORITY else None,
                "locations": [
                    str(value).strip()
                    for value in (profile.get("target_locations") or [])
                    if str(value).strip()
                ],
            }
            chosen = {str(row.get("family")) for row in selected}
            payload["families"] = selected + [
                row for row in payload["families"] if str(row.get("family")) not in chosen
            ]
        return payload

    # Target + claimed ninja, but completed_at missing — heal and send to Market.
    # Do not wait on score or shortlist: that was the old step-3 poll storm.
    mark_completed(db, user_id)
    return {
        "kind": "onboarding_complete",
        "redirect_to": "/market",
        "journey_step": 2,
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
        {"id": "set_direction", "label": "Choose your direction", "href": "/onboarding/result", "done": bool(state.get("completed_at"))},
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
