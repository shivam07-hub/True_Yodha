"""Targeting Brief — the single "what Myro knows about what this user wants" read.

The module is the test surface: the known_facts prompt ride and the shared
role-title derivation are tested here once, not through each router.
"""
from __future__ import annotations

from app.services import onboarding_service
from app.services.llm_ranker import build_system_prompt
from app.services.matching.targeting import MemoryFact, TargetingBrief, for_ranking


def _fact(kind: str, text: str) -> MemoryFact:
    return MemoryFact(kind=kind, text=text)


# ── ranking_profile ──────────────────────────────────────────────────────────

def test_ranking_profile_passes_columns_through_and_adds_known_facts():
    brief = TargetingBrief(
        profile={"target_roles": ["Data Science"]},
        facts=[_fact("constraint", "no night shifts"), _fact("salary", "floor 18 LPA")],
    )
    prof = brief.ranking_profile()
    assert prof["target_roles"] == ["Data Science"]
    assert prof["known_facts"] == ["constraint: no night shifts", "salary: floor 18 LPA"]


def test_ranking_profile_omits_known_facts_when_memory_empty():
    prof = TargetingBrief(profile={"target_roles": []}, facts=[]).ranking_profile()
    assert "known_facts" not in prof


def test_ranking_profile_caps_prompt_facts_at_eight():
    facts = [_fact("note", f"fact {i}") for i in range(12)]
    prof = TargetingBrief(profile={}, facts=facts).ranking_profile()
    assert len(prof["known_facts"]) == 8


def test_for_ranking_without_client_carries_no_facts():
    class FakeRepo:
        def get_user_profile_targeting(self, user_id):
            return {"target_roles": ["Software Development"]}

    brief = for_ranking(FakeRepo(), "u1")
    assert brief.facts == []
    ranking = brief.ranking_profile()
    assert "known_facts" not in ranking, "no client means no facts ride along"
    assert ranking["target_roles"] == ["Software Development"]
    # `scope_mode` travels on every ranking dict from 2026-09-27 — what the run
    # can honestly promise, beside what it is scoping on.
    assert ranking["scope_mode"] == "targeted"


# ── prompt block ─────────────────────────────────────────────────────────────

def test_system_prompt_includes_memory_block_only_when_facts_present():
    base = {"target_roles": ["Data Science"]}
    without = build_system_prompt(base, "cv text")
    assert "What Myro remembers" not in without

    with_facts = build_system_prompt(
        {**base, "known_facts": ["constraint: no night shifts"]}, "cv text"
    )
    assert "What Myro remembers about this candidate" in with_facts
    assert "- constraint: no night shifts" in with_facts


# ── shared role-title derivation (split-brain kill) ──────────────────────────

def test_role_title_updates_derives_cluster_union():
    updates = onboarding_service.role_title_updates(["Sales Lead"], role_family="Sales and Marketing")
    assert updates["target_role_titles"][0] == "Sales Lead"
    assert updates["target_role_titles"] == ["Sales Lead"]
    assert updates["target_roles"] == ["Sales and Marketing"]


def test_role_title_updates_unmatched_title_contributes_itself():
    updates = onboarding_service.role_title_updates(["Technical Account Manager"])
    assert updates["target_roles"] == []


def test_role_title_updates_empty_clears_both():
    assert onboarding_service.role_title_updates([]) == {
        "target_role_titles": [],
        "target_roles": [],
    }
