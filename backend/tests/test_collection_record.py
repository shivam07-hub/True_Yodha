"""The Collection Record's rules, tested once — here, not through each skin.

CONTEXT.md → Collection Record.
"""
from datetime import date, datetime, timedelta, timezone

from app.services.collections import PENDING_INTENT_AFTER, resolve_collection

BATCH_WEEK = date(2026, 8, 31)
NOW = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)


def job(**over):
    base = {
        "job_title": "Analyst",
        "company_name": "Acme",
        "is_active": True,
        "listing_confidence": "active",
    }
    base.update(over)
    return base


def match(job_id="j1", *, strong=True, **over):
    row = {
        "id": 1,
        "job_id": job_id,
        "overlap_score": 70.0,
        "overall_score": 4.2 if strong else 2.0,
        "recommendation": "apply" if strong else "consider",
        "seniority_compatibility": "compatible",
        "batch_week": BATCH_WEEK,
        "jobs": job(),
    }
    row.update(over)
    return row


def application(job_id="j1", status="saved", **over):
    row = {
        "id": 10,
        "job_id": job_id,
        "status": status,
        "source": "user_discovery",
        "created_at": "2026-08-20T08:00:00+00:00",
        "jobs": job(),
    }
    row.update(over)
    return row


def resolve(**over):
    kwargs = dict(
        applications=[],
        match_rows=[],
        dismissed_job_ids=set(),
        tailored_by_job={},
        pending_intent_job_ids=set(),
        batch_week=BATCH_WEEK,
        now=NOW,
    )
    kwargs.update(over)
    return resolve_collection(**kwargs)


# ── one entry, one stage ─────────────────────────────────────────────────────

def test_a_job_in_both_spines_produces_exactly_one_entry():
    """The defect this module exists to remove: a saved match used to render in
    "Myro found" AND "You added" at once (35 rows in prod)."""
    out = resolve(match_rows=[match("j1")], applications=[application("j1")])
    assert [e.job_id for e in out.entries] == ["j1"]
    assert out.entries[0].stage == "saved"
    assert out.stages["found"] == 0
    assert sum(out.stages.values()) == 1


def test_the_stage_is_the_highest_rung_reached():
    ladder = [
        (dict(), "found"),
        (dict(applications=[application("j1")]), "saved"),
        (dict(applications=[application("j1")], tailored_by_job={"j1": {"id": 5, "kind": "deterministic"}}), "tailored"),
        (dict(applications=[application("j1", status="applied")]), "applied"),
    ]
    for extra, expected in ladder:
        out = resolve(match_rows=[match("j1")], **extra)
        assert out.entries[0].stage == expected, expected


def test_an_applied_entry_outranks_a_tailored_one():
    out = resolve(
        applications=[application("j1", status="interviewing")],
        tailored_by_job={"j1": {"id": 5, "kind": "polished"}},
    )
    assert out.entries[0].stage == "applied"
    assert out.entries[0].status == "interviewing"


# ── liveness is an attribute, not a stage ────────────────────────────────────

def test_a_dead_listing_closes_found_and_saved():
    for confidence in ("closed", "likely_closed"):
        out = resolve(match_rows=[match("j1", jobs=job(listing_confidence=confidence))])
        assert out.entries[0].stage == "closed"
        assert out.entries[0].liveness == "down"


def test_a_dead_listing_never_demotes_tailored_or_applied():
    """7 prod rows — 3 of them mid-interview — had been filed into the graveyard
    chip for succeeding. The ad coming down is what applying LOOKS like."""
    dead = job(listing_confidence="closed")
    applied = resolve(applications=[application("j1", status="interviewing", jobs=dead)])
    assert applied.entries[0].stage == "applied"
    assert applied.entries[0].liveness == "down"

    tailored = resolve(
        applications=[application("j1", jobs=dead)],
        tailored_by_job={"j1": {"id": 5, "kind": "deterministic"}},
    )
    assert tailored.entries[0].stage == "tailored"


def test_is_active_false_is_down_on_its_own():
    """16 prod rows carry listing_confidence='closed' with is_active still true,
    and the inverse exists — reading one column alone disagrees with the sweep."""
    out = resolve(match_rows=[match("j1", jobs=job(is_active=False, listing_confidence="active"))])
    assert out.entries[0].liveness == "down"


def test_an_unverified_listing_is_uncertain_not_down():
    out = resolve(match_rows=[match("j1", jobs=job(listing_confidence="uncertain"))])
    assert out.entries[0].liveness == "uncertain"
    assert out.entries[0].stage == "found"


# ── origin is a label, read from the spine ───────────────────────────────────

def test_origin_comes_from_the_stack_not_the_source_string():
    """`source` defaults to system_match and every save writes user_discovery, so
    it labelled Myro's finds "You added" and the user's own finds Myro's."""
    myro = resolve(match_rows=[match("j1")], applications=[application("j1", source="user_discovery")])
    assert myro.entries[0].origin == "myro"

    mine = resolve(applications=[application("j2", source="system_match")])
    assert mine.entries[0].origin == "you"


def test_an_extension_import_is_labelled_extension():
    out = resolve(applications=[application("ext_abc")])
    assert out.entries[0].origin == "extension"


# ── the bar ──────────────────────────────────────────────────────────────────

def test_below_bar_matches_are_counted_not_entered():
    out = resolve(match_rows=[match("j1", strong=False)])
    assert out.entries == []
    assert out.below_bar_count == 1


def test_rejected_matches_are_counted_separately():
    out = resolve(match_rows=[
        match("j1", legitimacy_tier="suspicious"),
        match("j2", recommendation="skip"),
    ])
    assert out.entries == []
    assert out.rejected_count == 2
    assert out.below_bar_count == 0


def test_a_below_bar_match_the_user_saved_still_gets_an_entry():
    """The bar decides what Myro OFFERS. It never overrules what the user chose."""
    out = resolve(match_rows=[match("j1", strong=False)], applications=[application("j1")])
    assert [e.stage for e in out.entries] == ["saved"]
    assert out.below_bar_count == 0


def test_dismissed_matches_leave_the_collection_entirely():
    out = resolve(match_rows=[match("j1")], dismissed_job_ids={"j1"})
    assert out.entries == []
    assert out.below_bar_count == 0
    assert out.rejected_count == 0


# ── never advance a stage on the user's behalf ───────────────────────────────

def test_an_unanswered_apply_intent_is_a_question_not_an_applied_stage():
    out = resolve(applications=[application("j1")], pending_intent_job_ids={"j1"})
    entry = out.entries[0]
    assert entry.stage == "saved"
    assert entry.pending_apply is True
    assert entry.needs_user is True


def test_an_answered_apply_clears_the_pending_ask():
    out = resolve(
        applications=[application("j1", status="applied")],
        pending_intent_job_ids={"j1"},
    )
    assert out.entries[0].pending_apply is False


# ── the landing rule ─────────────────────────────────────────────────────────

def test_landing_opens_on_the_first_stage_that_still_needs_the_user():
    out = resolve(
        applications=[application("j2")],
        tailored_by_job={},
        match_rows=[],
    )
    assert out.landing == "saved"


def test_a_settled_collection_lands_on_the_goal_step():
    """Everything applied or tailored-and-quiet: land where the work is, not on
    an empty Found. Stages are for working, never a toll on finding your work."""
    out = resolve(
        applications=[application("j1", status="applied"), application("j2")],
        tailored_by_job={"j2": {"id": 5, "kind": "deterministic"}},
    )
    assert out.landing == "tailored"


def test_a_snoozed_entry_does_not_pull_the_landing():
    """The user asked not to be shown this one. Landing on it anyway is the
    opposite of honouring the snooze — fall through to their live work."""
    later = (NOW + timedelta(days=2)).isoformat()
    out = resolve(applications=[
        application("j1", collection_snoozed_until=later),
        application("j2", status="applied"),
    ])
    assert out.entries[0].needs_user is False
    assert out.landing == "applied"


def test_a_snooze_that_has_expired_asks_again():
    past = (NOW - timedelta(days=2)).isoformat()
    out = resolve(applications=[application("j1", collection_snoozed_until=past)])
    assert out.entries[0].needs_user is True


def test_closed_entries_never_ask():
    out = resolve(applications=[application("j1", jobs=job(listing_confidence="closed"))])
    assert out.entries[0].stage == "closed"
    assert out.entries[0].needs_user is False
    assert out.landing == "found"


# ── counts ───────────────────────────────────────────────────────────────────

def test_stages_counts_every_entry_exactly_once():
    out = resolve(
        match_rows=[match("j1"), match("j2"), match("j3", strong=False)],
        applications=[application("j2"), application("j4", status="applied")],
        tailored_by_job={"j2": {"id": 7, "kind": "deterministic"}},
    )
    assert sum(out.stages.values()) == len(out.entries) == 3
    assert out.stages == {"found": 1, "saved": 0, "tailored": 1, "applied": 1, "closed": 0}
    assert out.below_bar_count == 1


def test_the_pending_intent_window_is_a_real_delay():
    assert PENDING_INTENT_AFTER >= timedelta(minutes=1)
