"""Four stored copies stop being written (Shivam, 2026-10-27; BACKLOG: drop five).

`user_skills.proficiency_title` is derived from the level (`scoring.level_name`),
and `target_location`, `target_location_country` and `target_role_title` are the
first element of their lists (`direction.of`, `direction.locations`). Every reader
moved first and reached `main` in #345. This is step 2: nothing in this repo names
them, so the columns go unread and unwritten for the week before the drop.

Select lists count. A column named in a select fails the moment it is dropped.
"""
from __future__ import annotations

import ast
import re
from collections.abc import Iterator
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
_SINGULAR = re.compile(r"\b(target_location_country|target_location|target_role_title)\b")


def _docstrings(tree: ast.AST) -> set[int]:
    found: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            first = node.body[0] if node.body else None
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                found.add(id(first.value))
    return found


def _strings(path: Path) -> Iterator[tuple[int, str]]:
    """Every string the code uses. A docstring or comment naming a column is history."""
    tree = ast.parse(path.read_text())
    skip = _docstrings(tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in skip:
            yield node.lineno, node.value


def _sources() -> Iterator[Path]:
    yield from (BACKEND / "app").rglob("*.py")
    yield from (BACKEND / "scripts").rglob("*.py")


def test_no_code_names_a_singular_direction_column() -> None:
    offenders = [
        f"{path.relative_to(ROOT)}:{line}"
        for path in _sources()
        for line, text in _strings(path)
        if _SINGULAR.search(text)
    ]
    assert offenders == [], "lists only — direction.of / direction.locations: " + ", ".join(offenders)


@pytest.mark.parametrize(
    "module",
    [
        "app/services/skill_overrides.py",
        "app/services/skill_correction.py",
        "app/services/skill_confirmation.py",
        "app/services/scoring/orchestrator.py",
    ],
)
def test_a_skill_row_carries_no_level_name(module: str) -> None:
    named = [line for line, text in _strings(BACKEND / module) if text == "proficiency_title"]
    assert named == [], f"{module} writes the stored level name at {named}"


def test_confirm_cv_skills_writes_no_level_name() -> None:
    migration = ROOT / "database/migrations/20261030130000_confirm_cv_skills_no_level_name.sql"
    code = re.sub(r"--[^\n]*", "", migration.read_text())
    assert "confirm_cv_skills" in code
    assert "proficiency_title" not in code


# ── the derivations return the lists alone ──────────────────────────────────

def test_a_location_edit_derives_two_columns() -> None:
    from app.services.location_normalizer import derive_location_columns

    assert derive_location_columns(["Bangalore", "Mumbai"]) == {
        "target_locations": ["Bangalore", "Mumbai"],
        "target_location_countries": ["India"],
    }


def test_a_title_edit_derives_two_columns() -> None:
    from app.services import onboarding_service

    assert onboarding_service.role_title_updates(["Sales Lead"], role_family="Sales") == {
        "target_role_titles": ["Sales Lead"],
        "target_roles": ["Sales"],
    }
    assert onboarding_service.role_title_updates([]) == {
        "target_role_titles": [],
        "target_roles": [],
    }


def test_a_reviewed_skill_row_has_no_level_name() -> None:
    from app.services import skill_confirmation

    rows = skill_confirmation._reviewed_rows(
        [{"skill_id": 1, "taxonomy_key": "sql", "matched_level": 5, "evidence_text": "x"}],
        [{"skill_id": 2, "taxonomy_key": "go", "action": "add", "evidence_text": "y"}],
    )
    assert rows and all("proficiency_title" not in row for row in rows)


def test_a_candidate_names_its_level_through_the_one_rule() -> None:
    """The confirm screen's name is a read: it must say Legend at L5, not Scout."""
    source = (BACKEND / "app/services/onboarding_service.py").read_text()
    assert "_PROFICIENCY_TITLES" not in source
    assert '"proficiency_title": scoring.level_name(level)' in source
