"""The two targeting keys — `context_key` and `eval_context_key`.

They answer different questions and must not be collapsed:

- `context_key` → `user_job_matches.target_context_hash`. WHICH DIRECTION a verdict
  belongs to. A scoping key; the onboarding shortlist filters on it, so it must move
  only when the user changes direction.
- `eval_context_key` → `user_job_matches.eval_context_hash`. WHAT THE BRAIN WAS
  TOLD: direction plus the `known_facts` block the Career Ops prompt renders. Only
  the skip gates read it.

One key doing both would either re-rate on every memory edit or never re-rate at
all. This module is the test surface for that split.
"""
from __future__ import annotations

from app.services.onboarding_service import (
    context_key,
    eval_context_key,
    eval_matches_context,
)

_PROFILE = {
    "baseline_version_id": 7,
    "target_role_title": "Software Engineer",
    "target_seniority": "senior",
    "target_location": "gurugram",
}


# ── the split ────────────────────────────────────────────────────────────────

def test_memory_moves_the_eval_key_but_not_the_direction_key() -> None:
    with_memory = {**_PROFILE, "known_facts": ["constraint: no night shifts"]}
    assert eval_context_key(with_memory) != eval_context_key(_PROFILE)
    # ...and the shortlist does NOT reshuffle because a distiller wrote a fact.
    assert context_key(with_memory) == context_key(_PROFILE)


def test_a_direction_change_moves_both_keys() -> None:
    moved = {**_PROFILE, "target_role_title": "Data Scientist"}
    assert context_key(moved) != context_key(_PROFILE)
    assert eval_context_key(moved) != eval_context_key(_PROFILE)


def test_a_new_cv_baseline_moves_both_keys() -> None:
    moved = {**_PROFILE, "baseline_version_id": 8}
    assert context_key(moved) != context_key(_PROFILE)
    assert eval_context_key(moved) != eval_context_key(_PROFILE)


# ── stability: a key that churns re-rates jobs nothing changed for ───────────

def test_both_keys_are_stable_across_equal_profiles() -> None:
    assert context_key(dict(_PROFILE)) == context_key(_PROFILE)
    assert eval_context_key(dict(_PROFILE)) == eval_context_key(_PROFILE)


def test_unrelated_profile_fields_do_not_move_either_key() -> None:
    noisy = {**_PROFILE, "cv_markdown": "…", "target_roles": ["SDE"], "coins": 100}
    assert context_key(noisy) == context_key(_PROFILE)
    assert eval_context_key(noisy) == eval_context_key(_PROFILE)


def test_the_same_facts_in_the_same_order_keep_the_same_eval_key() -> None:
    """`UserMemoryRepository.list_active` orders totally (created_at, id) precisely
    so this holds — 7 of 83 active facts in prod share a timestamp with a sibling,
    and an unstable order would reshuffle the 8-fact cap and re-rate for nothing."""
    facts = ["constraint: no nights", "aspiration: platform work"]
    assert eval_context_key({**_PROFILE, "known_facts": list(facts)}) == eval_context_key(
        {**_PROFILE, "known_facts": list(facts)}
    )


def test_reordered_facts_are_a_different_prompt_and_a_different_eval_key() -> None:
    """Order is part of what the brain was told. With list_active totally ordered,
    the order moves only when the facts do."""
    a = eval_context_key({**_PROFILE, "known_facts": ["x", "y"]})
    b = eval_context_key({**_PROFILE, "known_facts": ["y", "x"]})
    assert a != b


# ── absence ──────────────────────────────────────────────────────────────────

def test_no_baseline_leaves_the_direction_key_unset_but_still_keys_the_eval() -> None:
    """`context_key` is None without a baseline because its queries filter on
    baseline anyway. `eval_context_key` must NOT be — two Nones would compare equal
    and silently disable re-rating for the users least likely to be noticed."""
    keyless = {**_PROFILE, "baseline_version_id": None}
    assert context_key(keyless) is None
    assert isinstance(eval_context_key(keyless), str)


def test_a_blank_direction_still_gets_both_keys() -> None:
    blank = {"baseline_version_id": 7}
    assert context_key(blank) is not None
    assert eval_context_key(blank) is not None


# ── the shared skip-gate rule ────────────────────────────────────────────────

def test_a_row_from_this_context_is_current() -> None:
    ctx = eval_context_key(_PROFILE)
    assert eval_matches_context({"eval_context_hash": ctx}, ctx) is True


def test_a_row_from_another_context_is_not() -> None:
    assert eval_matches_context({"eval_context_hash": "older"}, eval_context_key(_PROFILE)) is False


def test_a_row_with_no_key_is_not_current() -> None:
    """NULL is "we cannot tell", not "still valid". Every row written before the
    column existed reads that way — which is what makes the next Myro Ops Search
    correct without backfilling anything."""
    ctx = eval_context_key(_PROFILE)
    assert eval_matches_context({"eval_context_hash": None}, ctx) is False
    assert eval_matches_context({}, ctx) is False
    assert eval_matches_context(None, ctx) is False
