"""Unit tests for the gap-driven rewrite session planner (gap_planner).

Pure logic — no DB, no LLM. The router fetches gap/bullets/assessed-levels and
calls the LLM; this module turns those already-fetched inputs into the honest
session plan (latent → surface host bullet, absent → Forge, shallow → one-notch
surface + Forge, flywheel upgrade when practice has out-paced the CV).

Spec: memory/project_gap_driven_rewrite_session.md (GRILL-LOCKED 2026-06-23).
"""
import json

from app.services import gap_planner


def _gap(skill, *, is_primary=True, user_level=0, required_level=4):
    return {
        "skill": skill,
        "is_primary": is_primary,
        "user_level": user_level,
        "required_level": required_level,
        "missing": user_level < required_level,
    }


def _bullet(section, item_index, bullet_index, text):
    return {
        "section": section,
        "item_index": item_index,
        "bullet_index": bullet_index,
        "text": text,
    }


# ── gap-item build + priority sort ───────────────────────────────────────────

def test_build_gap_items_sorts_missing_primary_first():
    job_skills = [
        {"taxonomy_key": "sql", "is_primary": False, "required_level": 2},        # below secondary
        {"taxonomy_key": "sprint_planning", "is_primary": True, "required_level": 4},  # missing primary
        {"taxonomy_key": "python", "is_primary": True, "required_level": 4},       # below primary
    ]
    user_skill_map = {"python": 2}  # sql absent, sprint absent, python L2
    items = gap_planner.build_gap_items(job_skills, user_skill_map)
    assert [g["skill"] for g in items] == ["sprint_planning", "python", "sql"]
    assert items[0]["user_level"] == 0 and items[0]["missing"] is True


# ── classify prompt ──────────────────────────────────────────────────────────

def test_build_classify_messages_lists_skills_and_indexed_bullets_with_honesty_framing():
    msgs = gap_planner.build_classify_messages(
        zero_level_skills=[{"skill": "sprint_planning", "display_name": "Sprint Planning"}],
        bullets=[_bullet("exp_bullet", 0, 0, "Managed delivery across two teams")],
    )
    system = msgs[0]["content"].lower()
    user = msgs[-1]["content"]
    # Honesty: only call it latent on genuine evidence — never assume.
    assert "evidence" in system
    assert "absent" in system and "latent" in system
    assert "Sprint Planning" in user
    # Bullets are presented indexed so the model can cite a host.
    assert "0" in user and "Managed delivery across two teams" in user


# ── classify parse (defensive, fail-safe to honest) ──────────────────────────

def test_parse_classification_maps_latent_with_host_index():
    raw = json.dumps({"classifications": [
        {"skill": "sprint_planning", "verdict": "latent", "host_bullet": 0},
    ]})
    out = gap_planner.parse_classification(raw, valid_skills={"sprint_planning"}, n_bullets=1)
    assert out["sprint_planning"] == ("latent", 0)


def test_parse_classification_unparseable_falls_back_to_absent():
    out = gap_planner.parse_classification("not json", valid_skills={"x"}, n_bullets=2)
    # Fail-safe: when we can't read the model, never claim a skill is latent.
    assert out["x"] == ("absent", None)


def test_parse_classification_out_of_range_host_becomes_absent():
    raw = json.dumps({"classifications": [
        {"skill": "x", "verdict": "latent", "host_bullet": 9},  # only 2 bullets exist
    ]})
    out = gap_planner.parse_classification(raw, valid_skills={"x"}, n_bullets=2)
    assert out["x"] == ("absent", None)


def test_parse_classification_latent_without_host_becomes_absent():
    raw = json.dumps({"classifications": [
        {"skill": "x", "verdict": "latent", "host_bullet": None},
    ]})
    out = gap_planner.parse_classification(raw, valid_skills={"x"}, n_bullets=2)
    assert out["x"] == ("absent", None)


def test_parse_classification_ignores_unknown_skills():
    raw = json.dumps({"classifications": [
        {"skill": "hallucinated", "verdict": "latent", "host_bullet": 0},
    ]})
    out = gap_planner.parse_classification(raw, valid_skills={"x"}, n_bullets=1)
    assert "hallucinated" not in out


# ── plan assembly ────────────────────────────────────────────────────────────

def test_assemble_latent_gap_hosts_onto_cited_bullet():
    plan = gap_planner.assemble_plan(
        gap_items=[_gap("sprint_planning", user_level=0)],
        bullets=[_bullet("exp_bullet", 0, 0, "Managed delivery across two teams")],
        classification={"sprint_planning": ("latent", 0)},
        assessed_levels={},
        display_names={"sprint_planning": "Sprint Planning"},
    )
    assert len(plan["host_bullet_cards"]) == 1
    card = plan["host_bullet_cards"][0]
    assert card["bullet_text"] == "Managed delivery across two teams"
    assert card["section"] == "exp_bullet"
    assert [s["display_name"] for s in card["skills"]] == ["Sprint Planning"]
    assert plan["absent_skills"] == []


def test_collision_two_latent_gaps_same_host_collapse_to_one_card():
    plan = gap_planner.assemble_plan(
        gap_items=[_gap("sprint_planning"), _gap("agile")],
        bullets=[_bullet("exp_bullet", 0, 0, "Managed delivery across two teams")],
        classification={"sprint_planning": ("latent", 0), "agile": ("latent", 0)},
        assessed_levels={},
        display_names={"sprint_planning": "Sprint Planning", "agile": "Agile"},
    )
    assert len(plan["host_bullet_cards"]) == 1  # one bullet, one card
    keywords = [s["display_name"] for s in plan["host_bullet_cards"][0]["skills"]]
    assert keywords == ["Sprint Planning", "Agile"]


def test_absent_gap_routes_to_forge_list():
    plan = gap_planner.assemble_plan(
        gap_items=[_gap("content_development", is_primary=True, user_level=0)],
        bullets=[_bullet("exp_bullet", 0, 0, "Backend services in Go")],
        classification={"content_development": ("absent", None)},
        assessed_levels={},
        display_names={"content_development": "Content Development"},
    )
    assert plan["host_bullet_cards"] == []
    assert len(plan["absent_skills"]) == 1
    assert plan["absent_skills"][0]["display_name"] == "Content Development"
    assert plan["absent_skills"][0]["is_primary"] is True


def test_below_level_gap_surfaces_one_notch_capped_then_forge():
    # user is L2, JD wants L4 → surface to L3 only (one notch), earn L4 via Forge.
    plan = gap_planner.assemble_plan(
        gap_items=[_gap("sql", user_level=2, required_level=4)],
        bullets=[],
        classification={},  # level>=1 skips LLM classification
        assessed_levels={},
        display_names={"sql": "SQL"},
    )
    assert len(plan["below_level_cards"]) == 1
    c = plan["below_level_cards"][0]
    assert c["current_level"] == 2
    assert c["required_level"] == 4
    assert c["surface_to"] == 3  # min(current+1, required)


def test_below_level_one_notch_never_overshoots_required():
    # user L2, JD wants L3 → surface fully to L3 (cap is required, not current+2).
    plan = gap_planner.assemble_plan(
        gap_items=[_gap("sql", user_level=2, required_level=3)],
        bullets=[], classification={}, assessed_levels={},
        display_names={"sql": "SQL"},
    )
    assert plan["below_level_cards"][0]["surface_to"] == 3


def test_flywheel_practice_proven_beyond_cv_offers_upgrade():
    # CV shows L2, practice proved L4 → offer to surface CV up to proven level.
    plan = gap_planner.assemble_plan(
        gap_items=[_gap("sql", user_level=2, required_level=4)],
        bullets=[], classification={},
        assessed_levels={"sql": 4},
        display_names={"sql": "SQL"},
    )
    assert len(plan["upgrade_offers"]) == 1
    up = plan["upgrade_offers"][0]
    assert up["from_level"] == 2
    assert up["to_level"] == 4  # min(assessed, required)


def test_flywheel_proven_caps_at_required_not_beyond():
    plan = gap_planner.assemble_plan(
        gap_items=[_gap("sql", user_level=2, required_level=3)],
        bullets=[], classification={},
        assessed_levels={"sql": 5},
        display_names={"sql": "SQL"},
    )
    assert plan["upgrade_offers"][0]["to_level"] == 3


def test_non_missing_gaps_are_excluded():
    plan = gap_planner.assemble_plan(
        gap_items=[_gap("matched", user_level=4, required_level=4)],
        bullets=[], classification={}, assessed_levels={},
        display_names={"matched": "Matched"},
    )
    assert plan["host_bullet_cards"] == []
    assert plan["below_level_cards"] == []
    assert plan["absent_skills"] == []


def test_top_n_reports_shown_and_remaining_in_priority_order():
    gaps = [_gap(f"s{i}", user_level=0) for i in range(7)]
    bullets = [_bullet("exp_bullet", i, 0, f"bullet {i}") for i in range(7)]
    classification = {f"s{i}": ("latent", i) for i in range(7)}
    plan = gap_planner.assemble_plan(
        gap_items=gaps, bullets=bullets, classification=classification,
        assessed_levels={}, display_names={f"s{i}": f"S{i}" for i in range(7)},
        top_n=5,
    )
    assert plan["total_actionable"] == 7
    assert plan["shown"] == 5
    assert plan["remaining"] == 2
    # Cards carry their priority order so the frontend can merge/paginate.
    orders = [c["order"] for c in plan["host_bullet_cards"]]
    assert orders == sorted(orders)
