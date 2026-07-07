"""Targeting Brief — the single "what Myro knows about what this user wants" read.

The module is the test surface: fact→field gap-fill, the known_facts prompt
ride, and the shared role-title derivation are tested here once, not through
each router.
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
        profile={"target_roles": ["Data Science"], "career_goal": "lead a team"},
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
    assert brief.ranking_profile() == {"target_roles": ["Software Development"]}


# ── preflight gap-fill ───────────────────────────────────────────────────────

def test_preflight_role_titles_prefer_titles_then_single_then_clusters():
    titles = TargetingBrief(
        profile={"target_role_titles": ["TAM"], "target_role_title": "Old", "target_roles": ["X"]},
        facts=[],
    ).preflight()
    assert titles["role_titles"] == ["TAM"]

    single = TargetingBrief(
        profile={"target_role_titles": [], "target_role_title": "Account Manager", "target_roles": ["X"]},
        facts=[],
    ).preflight()
    assert single["role_titles"] == ["Account Manager"]

    clusters = TargetingBrief(profile={"target_roles": ["Software Development"]}, facts=[]).preflight()
    assert clusters["role_titles"] == ["Software Development"]


def test_preflight_fills_empty_fields_from_memory_with_provenance():
    brief = TargetingBrief(
        profile={"deal_breakers": [], "career_goal": None},
        facts=[
            _fact("constraint", "no relocation"),
            _fact("work_mode", "hybrid only"),
            _fact("aspiration", "move into platform work"),
            _fact("note", "irrelevant"),
        ],
    )
    pf = brief.preflight()
    assert pf["deal_breakers"] == ["no relocation", "hybrid only"]
    assert pf["career_goal"] == "move into platform work"
    assert pf["prefilled"] == {"deal_breakers": "memory", "career_goal": "memory"}
    assert pf["memory_count"] == 4


def test_preflight_never_overwrites_user_entered_columns():
    brief = TargetingBrief(
        profile={"deal_breakers": ["no travel"], "career_goal": "No", "superpower": "  "},
        facts=[_fact("constraint", "no relocation"), _fact("aspiration", "lead a team")],
    )
    pf = brief.preflight()
    assert pf["deal_breakers"] == ["no travel"]  # column wins
    assert pf["career_goal"] == "No"             # junk stays user-owned; edited in the modal
    assert pf["superpower"] is None              # no memory kind maps → stays manual
    assert pf["prefilled"] == {}


def test_preflight_location_falls_back_to_target_locations():
    pf = TargetingBrief(
        profile={"target_location": "", "target_locations": ["Gurugram", "Remote"]},
        facts=[],
    ).preflight()
    assert pf["location"] == "Gurugram"


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
    updates = onboarding_service.role_title_updates(["Sales Lead", "ML Engineer"])
    assert updates["target_role_title"] == "Sales Lead"
    assert updates["target_role_titles"] == ["Sales Lead", "ML Engineer"]
    assert "General Sales Practices" in updates["target_roles"]


def test_role_title_updates_unmatched_title_contributes_itself():
    updates = onboarding_service.role_title_updates(["Technical Account Manager"])
    assert updates["target_roles"] == ["Technical Account Manager"]


def test_role_title_updates_empty_clears_all_three():
    assert onboarding_service.role_title_updates([]) == {
        "target_role_title": None,
        "target_role_titles": [],
        "target_roles": [],
    }
