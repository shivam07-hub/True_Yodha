"""Unit tests for the pure skills-section refresh logic (no DB, no LLM)."""
from __future__ import annotations

from app.services import cv_skills_refresh as csr


def _inv(skill, name, level=1, demand=0, title="Scout"):
    return {
        "skill": skill,
        "display_name": name,
        "current_level": level,
        "weighted_demand": demand,
        "proficiency_title": title,
    }


# ── parse_skills_line ──────────────────────────────────────────────────────────

def test_parse_splits_on_mixed_separators_and_dedups():
    line = "Python, SQL (Snowflake); Excel | Excel / Tableau and PowerPoint"
    assert csr.parse_skills_line(line) == [
        "Python", "SQL (Snowflake)", "Excel", "Tableau", "PowerPoint",
    ]


def test_parse_handles_empty():
    assert csr.parse_skills_line("") == []
    assert csr.parse_skills_line(None) == []


# ── additions: honesty bar + dedup against existing ──────────────────────────────

def test_adds_only_proven_missing_skills():
    line = "Python, Excel"
    inventory = [
        _inv("sql", "SQL", level=3, demand=20),          # missing + proven → add
        _inv("python", "Python (Programming)", level=2),  # already on line → skip
        _inv("airflow", "Airflow", level=0, demand=15),   # level 0 → below honesty bar
    ]
    out = csr.build_proposal(line, inventory)
    names = [a["display_name"] for a in out["added"]]
    assert names == ["SQL"]
    assert out["changed"] is True


def test_existing_tokens_never_dropped():
    line = "Cobol, Python"  # Cobol unknown to inventory — must survive
    inventory = [_inv("python", "Python", level=2, demand=10)]
    out = csr.build_proposal(line, inventory)
    all_out = out["primary"] + out["secondary"]
    assert "Cobol" in all_out
    assert "Python" in all_out


def test_paren_variant_counts_as_represented():
    line = "SQL (Snowflake)"
    inventory = [_inv("sql", "SQL", level=3, demand=9)]
    out = csr.build_proposal(line, inventory)
    assert out["added"] == []  # SQL already represented despite the parenthetical


def test_short_token_does_not_swallow_unrelated_skill():
    line = "Go"
    inventory = [_inv("google_analytics", "Google Analytics", level=2, demand=5)]
    out = csr.build_proposal(line, inventory)
    assert [a["display_name"] for a in out["added"]] == ["Google Analytics"]


def test_caps_additions():
    line = ""
    inventory = [_inv(f"s{i}", f"Skill{i}", level=2, demand=i) for i in range(30)]
    out = csr.build_proposal(line, inventory)
    assert len(out["added"]) == csr.MAX_ADDITIONS


def test_focus_skill_adds_only_the_user_selected_assessment():
    inventory = [
        _inv("sql", "SQL", level=3, demand=20),
        _inv("python", "Python", level=4, demand=50),
    ]

    out = csr.build_proposal("Excel", inventory, focus_skill="SQL")

    assert [a["display_name"] for a in out["added"]] == ["SQL"]
    assert "Python" not in out["proposed_skills_line"]


# ── ordering: no-JD demand ranking ───────────────────────────────────────────────

def test_no_jd_primary_band_is_top_demand():
    line = "Excel, SQL, PowerPoint"
    inventory = [
        _inv("sql", "SQL", level=2, demand=50),
        _inv("excel", "Excel", level=1, demand=5),
        _inv("powerpoint", "PowerPoint", level=1, demand=0),  # zero demand → secondary
    ]
    out = csr.build_proposal(line, inventory)
    assert out["primary"][0] == "SQL"          # highest demand leads
    assert "PowerPoint" in out["secondary"]    # no demand → secondary band
    assert out["proposed_skills_line"].startswith("SQL")


# ── ordering: JD-aware ───────────────────────────────────────────────────────────

def test_jd_primary_skills_lead():
    line = "Excel, Python, Tableau"
    inventory = [
        _inv("python", "Python", level=2, demand=3),
        _inv("tableau", "Tableau", level=1, demand=8),
        _inv("excel", "Excel", level=1, demand=2),
    ]
    out = csr.build_proposal(
        line, inventory,
        jd_primary_keys={"python"},
        jd_keys={"python", "tableau"},
    )
    # JD-required skills form the primary band; Excel (not in JD) drops to secondary.
    assert set(out["primary"]) == {"Python", "Tableau"}
    assert out["primary"][0] == "Python"   # jd-primary outranks jd-secondary
    assert out["secondary"] == ["Excel"]


def test_jd_addition_reason():
    line = ""
    inventory = [_inv("kafka", "Kafka", level=1, demand=4)]
    out = csr.build_proposal(line, inventory, jd_keys={"kafka"})
    assert out["added"][0]["reason"] == "This job asks for it"


# ── no-op detection ──────────────────────────────────────────────────────────────

def test_unchanged_when_line_already_optimal():
    line = "SQL, Excel"
    inventory = [
        _inv("sql", "SQL", level=2, demand=10),
        _inv("excel", "Excel", level=1, demand=4),
    ]
    out = csr.build_proposal(line, inventory)
    assert out["added"] == []
    assert out["changed"] is False
