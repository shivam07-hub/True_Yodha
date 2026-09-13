"""Thin vs told, and whether a bullet is whole (BACKLOG #13, locked 2026-09-13).

The upload bridge mints a story from every CV line. These are the rules that
stop a scraped line behaving like a story the user actually told.
"""
from __future__ import annotations

from app.services import story_depth as sd


def _story(**narrative):
    return {"narrative": narrative}


# ── depth ────────────────────────────────────────────────────────────────────

def test_a_cv_bullet_is_thin():
    """`parse_extraction` drops empty narrative keys, so a lifted CV line arrives
    with `result` alone. That is the shape the bridge produces at scale."""
    assert sd.depth_of(_story(result="Led migration of billing platform to AWS.")) == "thin"


def test_a_told_story_is_told():
    assert sd.depth_of(_story(situation="a", task="b", action="c", result="d")) == "told"
    assert sd.depth_of(_story(situation="a", action="c", result="d")) == "told"


def test_two_fields_is_still_thin():
    """A fleshed-out bullet is not a told story: result plus one more is what a
    well-written CV line already implies."""
    assert sd.depth_of(_story(action="c", result="d")) == "thin"


def test_depth_survives_junk_narratives():
    assert sd.depth_of({}) == "thin"
    assert sd.depth_of({"narrative": None}) == "thin"
    assert sd.depth_of({"narrative": "not a dict"}) == "thin"
    assert sd.depth_of(_story(situation="  ", task="", action="c", result="d")) == "thin"


# ── whole bullets ────────────────────────────────────────────────────────────

def test_a_bullet_with_no_number_is_missing_its_measure():
    gaps = sd.missing_from_pointer(
        "Led the migration of the billing platform to AWS across four teams", []
    )
    assert any("number" in g for g in gaps)


def test_a_recorded_metric_counts_even_when_the_bullet_spells_it_out():
    """The extractor weaves the metric into the pointer, but a user's own wording
    may carry it as words while the story holds it structurally."""
    text = "Migrated the entire billing platform to AWS with zero downtime while leading four engineers"
    assert not any("number" in g for g in sd.missing_from_pointer(text, [{"value": "40Cr"}]))


def test_a_whole_bullet_needs_nothing():
    text = (
        "Migrated a 40Cr per month billing platform to AWS with zero downtime, "
        "leading four engineers over one quarter"
    )
    assert sd.missing_from_pointer(text, [{"value": "40Cr"}]) == []
    assert sd.pointer_is_whole(text, [{"value": "40Cr"}])


def test_an_empty_bullet_is_missing_itself():
    assert sd.missing_from_pointer("", []) == ["the bullet itself"]


def test_a_paragraph_is_not_a_cv_line():
    long_text = "Delivered " + " ".join(f"word{i}" for i in range(40)) + " in 2024"
    assert any("tightening" in g for g in sd.missing_from_pointer(long_text, [{"value": "1"}]))


# ── the readers that learn depth ─────────────────────────────────────────────

def test_a_thin_story_may_evidence_a_requirement_but_never_close_it():
    """L1. `covered` removes a requirement from the weave interview permanently —
    on this job and every later one. A line we scraped off a CV must not be able
    to do that, or the bridge silences the door that actually works."""
    from app.services import jd_coverage

    assert jd_coverage.COVERED_MIN > jd_coverage.WEAK_MIN  # bands still ordered
    thin_at_covered_strength = 0.90
    assert jd_coverage._classify(thin_at_covered_strength) == "covered"
    # …and _cover_one downgrades it, which the handler test below drives.


def test_pick_keep_prefers_the_story_the_user_actually_told():
    """A fold never merges `narrative` — the loser's STAR text is archived. So
    depth must outrank pointer count, or two uploads of one CV outvote the story
    the user sat down and told."""
    from app.services import story_identity_rules as rules

    told = {"id": "told", "narrative": {"situation": "s", "action": "a", "result": "r"},
            "inflow_ids": ["i1"], "created_at": "2026-08-01"}
    thin = {"id": "thin", "narrative": {"result": "r"},
            "inflow_ids": ["i1", "i2"], "created_at": "2026-07-01"}
    # thin wins on BOTH old tiebreaks: more pointers, older, more provenance.
    keep, dup = rules.pick_keep(told, thin, {"told": 1, "thin": 2})
    assert keep["id"] == "told" and dup["id"] == "thin"


def test_two_told_stories_still_fall_back_to_the_old_order():
    from app.services import story_identity_rules as rules

    a = {"id": "a", "narrative": {"situation": "s", "action": "a", "result": "r"},
         "inflow_ids": [], "created_at": "2026-08-01"}
    b = {"id": "b", "narrative": {"situation": "s", "action": "a", "result": "r"},
         "inflow_ids": [], "created_at": "2026-07-01"}
    keep, _ = rules.pick_keep(a, b, {"a": 1, "b": 3})
    assert keep["id"] == "b", "more phrasings still wins between equals"


def test_a_told_story_outranks_an_equally_relevant_thin_one():
    from app.services import career_projection as cp

    told = {"id": "t", "status": "active", "metrics": [],
            "narrative": {"situation": "s", "action": "a", "result": "r"}}
    thin = {"id": "n", "status": "active", "metrics": [], "narrative": {"result": "r"}}
    vec = [1.0, 0.0]
    ranked = cp.rank_stories([thin, told], {"t": vec, "n": vec}, [vec])
    assert [s["id"] for s, _ in ranked] == ["t", "n"]
