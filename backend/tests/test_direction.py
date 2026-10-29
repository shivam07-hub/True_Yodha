"""One answer to "what is this person aiming at", for every surface and the run.

Every state here was measured on prod 2026-09-27 across 924 users.
"""
from __future__ import annotations

from app.services import direction


def test_the_one_vocabulary_is_the_common_case() -> None:
    """97 users. The picker writes the corpus family's name into both columns
    (CONTEXT.md §1023), so titles and families are the SAME string by design."""
    d = direction.of({"target_role_titles": ["Data Science"], "target_roles": ["Data Science"]})
    assert d.titles == ("Data Science",)
    assert d.families == ("Data Science",)
    assert d.scope_mode == "targeted"
    assert d.is_set and d.is_runnable


def test_two_vocabularies_is_allowed_not_broken() -> None:
    """51 users typed their own titles against a corpus family. Every one of
    their scope keys names a real family — divergence is legitimate."""
    d = direction.of(
        {"target_role_titles": ["tech sales", "IT Sales"], "target_roles": ["Customer Service"]}
    )
    assert d.scope_mode == "targeted"
    assert d.is_runnable
    assert d.primary_title == "tech sales"


def test_titles_with_no_scope_run_on_skills_and_must_say_so() -> None:
    """The 29 left by the 2026-09-15 phantom repair. The run used to fall back
    to skill overlap in SILENCE — that is the failure being closed."""
    d = direction.of({"target_role_titles": ["Product Manager"], "target_roles": []})
    assert d.scope_mode == "skills_only"
    assert d.is_set, "they named the work — do not ask them to pick a target again"
    assert not d.is_runnable


def test_a_scope_with_no_titles_still_counts_as_a_direction() -> None:
    """6 users. Nothing to show them, but they are not target-less."""
    d = direction.of({"target_roles": ["Data Science"], "target_role_titles": []})
    assert d.is_set and d.is_runnable
    assert d.primary_title is None


def test_no_direction_at_all() -> None:
    """743 of 924. The only state that should be asked to pick a target."""
    d = direction.of({})
    assert d.scope_mode == "none"
    assert not d.is_set and not d.is_runnable
    assert d.to_dict()["primary_title"] is None


def test_the_legacy_singular_is_a_synced_copy_never_a_source() -> None:
    """The writer keeps `target_role_title` = titles[0]. On 2026-10-27 no row had
    the singular without the list, so a fallback read it for nobody (CONTEXT →
    Targeting Brief)."""
    assert direction.of({"target_role_title": "Product Manager"}).titles == ()
    d = direction.of({"target_role_titles": ["Data Science"], "target_role_title": "Old Title"})
    assert d.titles == ("Data Science",)


def test_blanks_and_repeats_never_reach_a_caller() -> None:
    d = direction.of({"target_role_titles": ["  Data Science ", "", "Data Science", None]})
    assert d.titles == ("Data Science",)


def test_a_missing_profile_is_not_a_crash() -> None:
    assert direction.of(None).scope_mode == "none"


def test_the_wire_shape_answers_every_surface_without_reconstruction() -> None:
    """Nine frontend chains read raw columns and five disagreed. This dict is
    what replaces all of them."""
    assert set(direction.of({}).to_dict()) == {
        "titles", "families", "primary_title", "is_set", "is_runnable", "scope_mode",
        "level", "missing",
    }


# ── a direction is a role and a level (Shivam, 2026-10-27) ──────────────────

def test_a_role_with_a_level_is_complete() -> None:
    d = direction.of({"target_roles": ["Sales Management"], "target_seniority": "mid"})
    assert d.level == "mid"
    assert d.missing is None


def test_a_role_without_a_level_is_asked_only_the_level() -> None:
    """41 people on 2026-10-27, all set before September. They chose the work;
    sending them back to pick it again is the bug."""
    for seniority in (None, "", "any"):
        d = direction.of({"target_roles": ["Sales Management"], "target_seniority": seniority})
        assert d.level is None
        assert d.missing == "level"
        assert d.is_set and d.is_runnable


def test_no_role_the_matcher_can_scope_on_asks_for_the_role() -> None:
    assert direction.of({}).missing == "role"
    # Titles alone cannot run: there is no corpus family to scope on.
    assert direction.of({"target_role_titles": ["growth"], "target_seniority": "mid"}).missing == "role"


def test_a_level_alias_reads_as_its_band() -> None:
    assert direction.of({"target_roles": ["Sales Management"], "target_seniority": "junior"}).level == "entry"


# ── places: the plural columns, and only those ──────────────────────────────

def test_locations_are_the_list_cleaned() -> None:
    profile = {"target_locations": [" Mumbai ", "mumbai", "", None, "Pune"]}
    assert direction.locations(profile) == ["Mumbai", "Pune"]


def test_countries_are_the_list_cleaned() -> None:
    assert direction.countries({"target_location_countries": ["India", " india ", ""]}) == ["India"]


def test_the_singular_place_columns_are_never_read() -> None:
    """Synced copies of locations[0] and countries[0]; seven readers fell back to
    them and the fallback fired for no row (2026-10-27)."""
    profile = {"target_location": "Mumbai", "target_location_country": "India"}
    assert direction.locations(profile) == []
    assert direction.countries(profile) == []
    assert direction.locations({"target_locations": None, "target_location": "Mumbai"}) == []


# ── the run reads the same answer as the screen ──────────────────────────────

from app.services.matching.targeting import TargetingBrief  # noqa: E402


def test_the_run_and_the_screen_read_one_definition() -> None:
    """Shivam, 2026-09-27: the Career Ops run must understand the target from
    the same surface the frontend does, so a new batch of jobs cannot get lost."""
    profile = {"target_role_titles": ["Data Science"], "target_roles": ["Data Science"]}
    brief = TargetingBrief(profile=profile, facts=[])
    assert brief.direction().to_dict() == direction.of(profile).to_dict()


def test_a_run_that_cannot_scope_carries_that_fact_to_every_ranking_path() -> None:
    """The silence being closed: the run fell back to skill overlap and nothing
    on the row or the surface said the role targeting never happened."""
    brief = TargetingBrief(profile={"target_role_titles": ["Product Manager"]}, facts=[])
    assert brief.ranking_profile()["scope_mode"] == "skills_only"


def test_a_targeted_run_says_so_too() -> None:
    brief = TargetingBrief(profile={"target_roles": ["Data Science"]}, facts=[])
    assert brief.ranking_profile()["scope_mode"] == "targeted"


def test_scope_mode_rides_beside_the_facts_not_instead_of_them() -> None:
    from app.services.matching.targeting import MemoryFact

    brief = TargetingBrief(
        profile={"target_roles": ["Data Science"]},
        facts=[MemoryFact(kind="aspiration", text="lead a data team")],
    )
    ranking = brief.ranking_profile()
    assert ranking["scope_mode"] == "targeted"
    assert ranking["known_facts"] == ["aspiration: lead a data team"]
