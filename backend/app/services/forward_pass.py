"""What a returning user is behind on, brought forward the moment they arrive.

**Myro does not backfill.** When we ship a capability that needs data we were
not collecting before, the people who came earlier do not get a migration run at
them while they are not looking. They get it the first time they come back and
touch the surface it belongs to — once, for themselves.

That is not squeamishness about bulk jobs. It is what the numbers say. A
backfill spends a paid extraction on every dormant account at once, mints
thousands of rows against a loop no user has yet exercised, and lands a bug on
everyone simultaneously instead of on one person who is present to see it. The
same work, done as people return, costs the same per user, arrives with
evidence, and stops costing anything for users who never come back — which is
the correct amount to spend on someone who is not there.

**A sweep may finish work a user started. It may never start work they did not.**
That line is what separates `reservoir_ingest_sweep` — which re-enqueues an
ingest the user's own upload created — from a backfill wearing a cron's clothes.
Both run on a timer; only one of them invents work on behalf of the absent.

Shape of a pass, and every future one must keep it:

  claim first   a Redis one-per-window claim gates everything, so a polled or
                repeated read cannot turn one returning user into N jobs.
  cheap check   the "is this user behind?" test is an existence query, never a
                model and never a scan.
  enqueue only  the work itself happens on the Work Lane. A forward pass must
                never be paid for on the read path the user is waiting on.
  idempotent    the record that it ran is the work's own artefact — here, the
                inflow ledger — so a second pass is a no-op rather than a
                duplicate. No new column, no migration, no parallel bookkeeping
                to drift out of step.
  fail-soft     the user came to read their CV. A pass that cannot run must
                leave that read untouched and try again next time.

Adding a pass means adding to `PASSES` and calling it from the surface its
cohort actually reaches — a door on a path nobody walks is not a forward pass,
it is a dead end with a timer (see `reservoir_ingest_sweep`, where healing on a
single surface left three inflows dead for two months).
"""
from __future__ import annotations

import logging
from typing import Any

from app.services.background import debounce

logger = logging.getLogger("myro.forward_pass")

#: One claim per user per day. Long enough that a user clicking round their CV
#: costs one Redis op and nothing else; short enough that a pass which failed
#: gets another go tomorrow rather than never.
CLAIM_TTL_SECONDS = 24 * 60 * 60

#: A baseline shorter than this is a failed parse, not a career.
MIN_BANKABLE_CHARS = 200


def _claim(name: str, user_id: str) -> bool:
    return debounce.claim(f"forward_pass:{name}:{user_id}", CLAIM_TTL_SECONDS)


def bank_existing_baseline(user_id: str) -> bool:
    """Bank the CV a user uploaded before the upload bridge existed.

    `a191350a` made every NEW upload mint Career Stories. It did nothing for the
    394 users whose CV was already sitting in `cv_versions` — and only 40 of them
    have ever uploaded a second time, so waiting for a re-upload reaches one in
    ten. Their document is already here; the only thing missing was an occasion.
    Opening their CV is that occasion.

    Returns True when a bank was enqueued. False means nothing to do, someone
    else already claimed the window, or the attempt failed — all three are the
    same to the caller, which is a read that must not change because of this.
    """
    if not _claim("baseline_bank", user_id):
        return False
    try:
        from app.database import get_supabase_admin
        from app.services import career_reservoir

        db = get_supabase_admin()
        # Already banked? The inflow ledger IS the record that this pass ran —
        # every door into the reservoir leaves a row here, so a user who dumped
        # their CV by hand is correctly treated as already forward.
        banked = (
            db.table("cv_dump_entries")
            .select("id")
            .eq("user_id", user_id)
            .in_("source", ["onboarding_cv", "baseline_bank", "reservoir_dump"])
            .limit(1)
            .execute()
        )
        if banked.data:
            return False

        rows = (
            db.table("cv_versions")
            .select("id, body_text")
            .eq("user_id", user_id)
            .eq("kind", "baseline_upload")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        baseline = (rows.data or [None])[0]
        if not baseline:
            return False
        text = str(baseline.get("body_text") or "").strip()
        if len(text) < MIN_BANKABLE_CHARS:
            logger.info("metric forward_pass.baseline_too_thin user=%s chars=%d", user_id, len(text))
            return False

        entry_id = career_reservoir.bank_uploaded_cv(
            user_id, text, baseline.get("id"),
            source=career_reservoir.BASELINE_BANK_SOURCE,
        )
        if not entry_id:
            return False
        logger.info(
            "metric forward_pass.baseline_banked user=%s entry=%s chars=%d",
            user_id, entry_id, len(text),
        )
        return True
    except Exception as exc:  # noqa: BLE001 — a read must never fail on a forward pass
        logger.warning(
            "metric forward_pass.failed pass=baseline_bank user=%s reason=%s",
            user_id, exc.__class__.__name__,
        )
        return False


def drop_stray_cv_skills(user_id: str) -> bool:
    """Employer-header and nameless-metric skills come off on the next CV visit.

    Extraction now refuses them. People who uploaded before that still carry
    them; opening the CV is the occasion. Claim + cheap check + enqueue — the
    delete and recompute never run on the read they came for.
    """
    if not _claim("stray_skills", user_id):
        return False
    try:
        from app.services.cv_stray_heal import enqueue_if_behind

        return enqueue_if_behind(user_id)
    except Exception as exc:  # noqa: BLE001 — a read must never fail on a forward pass
        logger.warning(
            "metric forward_pass.failed pass=stray_skills user=%s reason=%s",
            user_id, exc.__class__.__name__,
        )
        return False


#: Every pass the platform runs. One entry per capability that shipped after the
#: data it needs — the list is the answer to "what is a returning user behind on".
PASSES: tuple[tuple[str, Any], ...] = (
    ("baseline_bank", bank_existing_baseline),
    ("stray_skills", drop_stray_cv_skills),
)


# Cheap skip for the /users/me door. The write path reads is_catch_all; this is
# the seed from 20260909100000 plus the two prefixes that migration also marked.
# A hand-edited flag the seed misses waits for a re-save.
_SEEDED_BUCKETS = frozenset({
    "Business Operations", "Business Management", "Business Solutions",
    "Business Leadership", "Business Continuity", "Computer Science",
    "Administrative Support and Clerical Tasks",
    "Office and Productivity Equipment and Technology",
    "Scripting Languages", "Query Languages",
})


def _clean_names(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(value).strip() for value in raw if str(value).strip()]


def _looks_like_bucket(name: str) -> bool:
    return name.startswith(("General ", "Other ")) or name in _SEEDED_BUCKETS


def _needs_promote(names: list[str]) -> bool:
    return (
        len(names) >= 2
        and _looks_like_bucket(names[0])
        and any(not _looks_like_bucket(name) for name in names[1:])
    )


def on_profile_read(user_id: str, profile: dict[str, Any]) -> None:
    """A catch-all cannot stay the main role. Fix it on the visit they already make.

    `/users/me` is the shell on every authed page — the 23 people in this state
    walk it. The cheap check is string-only, so everyone else pays nothing.
    The write itself goes through `save_target`, so score and match refresh
    the same way a Direction save does. Nothing is edited by hand.
    """
    titles = _clean_names(profile.get("target_role_titles"))
    families = _clean_names(profile.get("target_roles"))
    if not titles or not (_needs_promote(titles) or _needs_promote(families)):
        return
    if not _claim("promote_primary", user_id):
        return
    try:
        from app.database import get_supabase_admin
        from app.services.onboarding_service import save_target
        from app.services.targeting_write import demote_catch_all_primary

        kwargs: dict[str, Any] = {"role_titles": titles}
        if families:
            kwargs["role_families"] = families
        save_target(get_supabase_admin(), user_id, **kwargs)
        catch = {name for name in [*titles, *families] if _looks_like_bucket(name)}
        promoted_titles = demote_catch_all_primary(titles, catch)
        profile["target_role_titles"] = promoted_titles
        profile["target_role_title"] = promoted_titles[0]
        if families:
            profile["target_roles"] = demote_catch_all_primary(families, catch)
        logger.info("metric forward_pass.primary_promoted user=%s", user_id)
    except Exception as exc:  # noqa: BLE001 — a read must never fail on a forward pass
        logger.warning(
            "metric forward_pass.failed pass=promote_primary user=%s reason=%s",
            user_id, exc.__class__.__name__,
        )


def on_cv_read(user_id: str) -> None:
    """The user opened their CV. Bring them up to whatever we have since built.

    Called from the CV reads a returning CV-holder actually lands on. Every pass
    is claim-gated and fail-soft, so this is a cheap no-op for a user who is
    already current — which, after a pass has run once, is everyone.
    """
    for name, run in PASSES:
        try:
            run(user_id)
        except Exception as exc:  # noqa: BLE001 — one bad pass must not stop the rest
            logger.warning(
                "metric forward_pass.raised pass=%s user=%s reason=%s",
                name, user_id, exc.__class__.__name__,
            )
