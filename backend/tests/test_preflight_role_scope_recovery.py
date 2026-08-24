"""A direction the user can neither see nor edit becomes a line they must answer.

34 users carry `target_roles` with no `target_role_titles` behind it — written
April–June 2026 by a path that no longer exists, holding Lightcast SKILL names
("Java", "Communication", "Initiative and Leadership") as the ILIKE keys their
whole search is scoped on. No backfill: the next time they open Myro Search,
the modal asks.
"""
from __future__ import annotations

from app.services.matching.targeting import TargetingBrief
from app.services.preflight import memory_import


def brief(**profile) -> TargetingBrief:
    return TargetingBrief(profile=profile, facts=[])


def test_an_orphaned_scope_is_offered_for_a_verdict() -> None:
    lines = memory_import.guesses_from(
        brief(target_roles=["Java", "Communication"], target_role_titles=[])
    )
    scope = [x for x in lines if x.kind == "role"]
    assert [x.text for x in scope] == ["Java", "Communication"]
    assert all(x.status == "unanswered" for x in scope)


def test_a_derived_value_can_never_be_rubber_stamped_into_a_title() -> None:
    """`unusable` refuses `yes`. A yes would assert "this is a role I chose",
    which is the one thing nobody can say about the matcher's read model."""
    lines = memory_import.guesses_from(brief(target_roles=["Communication"]))
    assert [x.unusable for x in lines if x.kind == "role"] == [True]


def test_a_user_with_titles_is_not_asked_about_their_clusters() -> None:
    lines = memory_import.guesses_from(
        brief(target_roles=["product_management"], target_role_titles=["Product Manager"])
    )
    assert [x for x in lines if x.kind == "role"] == []


def test_the_scope_line_survives_the_cross_kind_merge() -> None:
    """The merge collapses one statement asked twice across Won't take and
    Drawn to. A role that happens to share a word with one is not that."""
    lines = memory_import.guesses_from(brief(target_roles=["Java"]))
    assert any(x.kind == "role" and x.text == "Java" for x in lines)
