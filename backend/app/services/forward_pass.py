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


def retag_file_billed_as_text(user_id: str) -> bool:
    """A PDF billed as a paste is retagged the next time they open their CV.

    Claim + two existence reads + a cheap write. The historical ledger stays;
    only `cv_versions.source` and `entry_mode` come forward.
    """
    if not _claim("cv_source", user_id):
        return False
    try:
        from app.database import get_supabase_admin
        from app.repositories.cv import CVVersionsRepository
        from app.repositories.onboarding import OnboardingRepository
        from app.services.cv_entry_heal import heal_loaded

        db = get_supabase_admin()
        return heal_loaded(
            db,
            user_id,
            OnboardingRepository(db).get_state(user_id),
            CVVersionsRepository(db).latest_baseline(user_id),
        )
    except Exception as exc:  # noqa: BLE001 — a read must never fail on a forward pass
        logger.warning(
            "metric forward_pass.failed pass=cv_source user=%s reason=%s",
            user_id, exc.__class__.__name__,
        )
        return False


def read_years_from_banked_cv(user_id: str) -> float | None:
    """Years of experience, read off the CV they already uploaded. Returns what it
    wrote, so the surface that called it can show that number in the same response.

    `years_experience` shipped on 2026-09-24; every account before it holds NULL,
    and retrieval then falls back to the band's implied span. For a mid-band
    person that is [2,5] where her actual [2.2,4.2] would be, and the Match
    Quality gate measured what that costs: 52% of the forty jobs shown failed the
    level rule, all of them at the top end — 5-8 year roles in a 3.2-year list.

    A heal, not a backfill, and the line is exact: she uploaded a CV and asked to
    be matched against it. Reading her years out of that same CV finishes work she
    started. It invents nothing, spends no model call — `seniority_from_cv` is
    date arithmetic — and never touches an account that is not present.

    It writes only when nobody has corrected the number: `years_experience_source
    = 'user'` outranks any parse, forever (CEO decision 2026-09-23).

    **It is NOT in `PASSES`, and that is the point.** Every other pass rides a CV
    read and enqueues; this one changes which jobs she is shown, so it has to run
    where she can SEE the number and correct it — the Direction journey's Level
    step, which is the only surface that renders years. A pass that silently
    reshaped her matches on a CV read would be enrichment she never got told about
    (`964f1587`), and the rule is explicit that a pass must show on the surface
    that fires it.

    It also breaks the "enqueue only" half of the pass shape deliberately, because
    the work is date arithmetic over a document already in memory plus one narrow
    update — no model call, no scan. The read it rides is a Direction payload that
    measured 2,461ms of family lookups; this is not what the user is waiting on,
    and deferring it would mean showing her a blank field and the right number one
    visit later.
    """
    if not _claim("cv_years", user_id):
        return None
    try:
        from app.database import get_supabase_admin
        from app.repositories.cv import CVVersionsRepository
        from app.repositories.users import UsersRepository
        from app.services import targeting_write
        from app.services.experience_years import seniority_from_cv

        db = get_supabase_admin()
        users = UsersRepository(db)
        profile = users.get_profile(user_id) or {}
        # Cheap check: two fields already in hand. Absent is not the same as
        # corrected — only a `user` source stops us.
        if profile.get("years_experience") is not None:
            return None
        if profile.get("years_experience_source") == "user":
            return None

        baseline = CVVersionsRepository(db).latest_baseline(user_id)
        if not baseline:
            return None
        years = seniority_from_cv(baseline).get("years")
        if years is None:
            return None

        targeting_write.commit(users, user_id, {
            "years_experience": years,
            "years_experience_source": "cv",
        })
        logger.info(
            "metric forward_pass.cv_years_read user=%s years=%s", user_id, years,
        )
        return years
    except Exception as exc:  # noqa: BLE001 — a read must never fail on a forward pass
        logger.warning(
            "metric forward_pass.failed pass=cv_years user=%s reason=%s",
            user_id, exc.__class__.__name__,
        )
        return None


#: Every pass the platform runs. One entry per capability that shipped after the
#: data it needs — the list is the answer to "what is a returning user behind on".
#: `cv_years` is deliberately absent — it runs from the Direction payload, the one
#: surface that shows the number it writes. See its docstring.
PASSES: tuple[tuple[str, Any], ...] = (
    ("baseline_bank", bank_existing_baseline),
    ("stray_skills", drop_stray_cv_skills),
    ("cv_source", retag_file_billed_as_text),
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
