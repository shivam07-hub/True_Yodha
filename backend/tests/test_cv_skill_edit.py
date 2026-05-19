"""Pure-logic unit tests for cv_skill_edit.

The locator + mutator are pure functions over cv_structured dicts — no DB
required. DB-touching helpers (diff_keyword_skills, run_async_retag) are
exercised end-to-end in higher-level integration runs.
"""
from __future__ import annotations

import pytest

from app.services import cv_skill_edit


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _sample_cv() -> dict:
    return {
        "summary": "Senior data engineer with deep Python and Snowflake expertise.",
        "experience": [
            {
                "role": "Senior Data Engineer",
                "company": "Acme",
                "dates": "2024–present",
                "bullets": [
                    "Built ML inference pipeline on Snowflake serving 30M rows/day.",
                    "Migrated Airflow DAGs from v1 to v2 with zero downtime.",
                ],
            },
            {
                "role": "Data Engineer",
                "company": "Globex",
                "dates": "2022–2024",
                "bullets": [
                    "Owned Snowflake warehouse architecture for finance team.",
                ],
            },
        ],
        "projects": [
            {
                "name": "OSS contributor",
                "dates": "2023",
                "bullets": ["Shipped Python connector merged upstream."],
            },
        ],
        "education": [
            {"institution": "IIT-B", "degree": "BTech CS", "dates": "2018"},
        ],
        "skills_line": "Python, SQL, Snowflake, Airflow",
        "certs": ["AWS Solutions Architect — Associate"],
    }


# ── Locator ───────────────────────────────────────────────────────────────────


def test_locate_bullet_finds_unique_exp_bullet() -> None:
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(
        cv,
        "Built ML inference pipeline on Snowflake serving 30M rows/day.",
    )
    assert isinstance(located, cv_skill_edit.BulletLocation)
    assert located.section == "exp_bullet"
    assert located.item_index == 0
    assert located.bullet_index == 0


def test_locate_bullet_returns_conflict_on_multi_match() -> None:
    # Snowflake substring appears in summary + 2 exp bullets + skills_line.
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(cv, "Snowflake")
    assert isinstance(located, cv_skill_edit.LocateConflict)
    assert len(located.candidates) >= 2


def test_locate_bullet_returns_none_when_unmatched() -> None:
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(cv, "Quantum entanglement research lead")
    assert located is None


def test_locate_bullet_honours_hint_tuple() -> None:
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(
        cv,
        "Snowflake",
        section_hint="exp_bullet",
        item_index=1,
        bullet_index=0,
    )
    assert isinstance(located, cv_skill_edit.BulletLocation)
    assert located.item_index == 1
    assert "Snowflake warehouse" in located.text


def test_locate_bullet_finds_summary() -> None:
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(cv, cv["summary"])
    assert isinstance(located, cv_skill_edit.BulletLocation)
    assert located.section == "summary"


def test_locate_bullet_finds_skills_line() -> None:
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(cv, cv["skills_line"])
    assert isinstance(located, cv_skill_edit.BulletLocation)
    assert located.section == "skills_line"


def test_locate_bullet_finds_cert() -> None:
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(cv, cv["certs"][0])
    assert isinstance(located, cv_skill_edit.BulletLocation)
    assert located.section == "cert"


# ── Mutator ───────────────────────────────────────────────────────────────────


def test_apply_bullet_edit_replaces_exp_bullet_without_mutating_original() -> None:
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(
        cv,
        "Built ML inference pipeline on Snowflake serving 30M rows/day.",
    )
    assert isinstance(located, cv_skill_edit.BulletLocation)

    new_cv = cv_skill_edit.apply_bullet_edit(
        cv,
        located,
        "Shipped ML inference pipeline serving 120M rows/day at p99 < 80ms.",
    )

    # Original untouched
    assert cv["experience"][0]["bullets"][0].startswith("Built ML inference pipeline")
    # New copy mutated
    assert new_cv["experience"][0]["bullets"][0].startswith("Shipped ML inference pipeline")
    assert new_cv is not cv


def test_apply_bullet_edit_rejects_empty_text() -> None:
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(cv, cv["summary"])
    assert isinstance(located, cv_skill_edit.BulletLocation)
    with pytest.raises(ValueError):
        cv_skill_edit.apply_bullet_edit(cv, located, "   ")


def test_apply_bullet_edit_updates_skills_line_singleton() -> None:
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(cv, cv["skills_line"])
    assert isinstance(located, cv_skill_edit.BulletLocation)
    new_cv = cv_skill_edit.apply_bullet_edit(cv, located, "Python, Snowflake, dbt, Spark")
    assert new_cv["skills_line"] == "Python, Snowflake, dbt, Spark"


def test_apply_bullet_edit_updates_cert_by_index() -> None:
    cv = _sample_cv()
    located = cv_skill_edit.locate_bullet(cv, cv["certs"][0])
    assert isinstance(located, cv_skill_edit.BulletLocation)
    new_cv = cv_skill_edit.apply_bullet_edit(cv, located, "AWS Solutions Architect — Professional")
    assert new_cv["certs"][0].endswith("Professional")


# ── Render seam ───────────────────────────────────────────────────────────────


def test_render_baseline_text_emits_sections() -> None:
    body = cv_skill_edit.render_baseline_text(_sample_cv())
    assert "SUMMARY" in body
    assert "EXPERIENCE" in body
    assert "Snowflake" in body
    assert "EDUCATION" in body
