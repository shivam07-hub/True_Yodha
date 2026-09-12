"""The target-level rule has one home, and both readers use it.

It had two. `career_skill_path_cards.required_level` and
`ScoresRepository.get_role_family_market` each implemented it, and the second
disagreed with its own docstring — the doc said L3 needed 25% of jobs, the code
gave L3 to a skill that was primary in one. These tests pin the rule and pin the
fact that nobody re-implements it.
"""
from __future__ import annotations

from pathlib import Path

from app.services.career_skill_path_cards import required_level
from app.services.scoring.demand_rule import target_level

_ROOT = Path(__file__).resolve().parents[1] / "app"


def test_the_rule_at_every_boundary() -> None:
    # must-have in MORE than half -> 4. Exactly half is not more than half.
    assert target_level(jobs_must_have=51, job_count=100, present=True) == 4
    assert target_level(jobs_must_have=50, job_count=100, present=True) == 3
    # must-have anywhere at all -> 3, however rare.
    assert target_level(jobs_must_have=1, job_count=100, present=True) == 3
    # named but never must-have -> 2.
    assert target_level(jobs_must_have=0, job_count=100, present=True) == 2
    # not named -> no demand, which is not the same as a level of 0.
    assert target_level(jobs_must_have=0, job_count=100, present=False) is None
    # an empty scope cannot demand anything; never divide by it.
    assert target_level(jobs_must_have=5, job_count=0, present=True) is None


def test_the_cards_delegate_rather_than_restate() -> None:
    assert required_level(60, 100, False) == target_level(
        jobs_must_have=60, job_count=100, present=True
    )
    assert required_level(0, 100, True) == 2
    assert required_level(0, 0, True) is None


def test_is_primary_is_not_consulted_on_the_demand_path() -> None:
    """Lock 4 retires `is_primary`, and the corpus is why: on Stage A rows it is
    `required_level = 4` restated, and on the 296,886 legacy enrichment rows it is
    a 94.7% constant. The snapshot counts `jobs_must_have` instead."""
    rule = (_ROOT / "services" / "scoring" / "demand_rule.py").read_text()
    body = rule.split('"""', 2)[-1]
    assert "is_primary" not in body, "the rule reads is_primary again"
    assert "jobs_must_have" in body

    aspirations = (_ROOT / "services" / "scoring" / "aspirations.py").read_text()
    assert "target_level(" in aspirations, "the service stopped using the shared rule"
    assert "primary_job_count" not in aspirations
