"""The score write must never name a column the schema does not have.

This test exists because of a three-day, total, invisible outage.

`8a9741c2 feat(onboarding): target roles from live job families` added
`domain_skill_counts` to the `mirror_scores` payload and shipped no migration.
Every score write from 2026-07-31 onward died on

    PGRST204: Could not find the 'domain_skill_counts' column of 'mirror_scores'

and nothing in the product said so. `onboarding_target_refresh` raised, RQ retried
its three times, exhausted, and the user was left on "Calculating your Myro Score"
with a spinner that never resolved. `max(computed_at)` on prod stood still for
three days across every user while the app reported progress.

The whole pipeline was green: types checked, lint passed, the unit tests mocked
the repository. Nothing on the path compared what the code writes against what the
database accepts. That comparison is this file.

Falsified: delete the `domain_skill_counts` line from
`database/migrations/20260803_mirror_scores_domain_skill_counts.sql` and
`test_every_written_column_exists_in_the_schema` fails naming that column — i.e.
it reproduces the outage at test time instead of at signup time.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.services.scoring.orchestrator import MIRROR_SCORE_COLUMNS, ScoreProjection, _persist_score

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCHEMA = _REPO_ROOT / "database" / "schema.sql"
_MIGRATIONS = _REPO_ROOT / "database" / "migrations"

_CREATE_TABLE = re.compile(
    r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?mirror_scores\s*\((.*?)\n\s*\);",
    re.IGNORECASE | re.DOTALL,
)
_ADD_COLUMN = re.compile(
    r"alter\s+table\s+(?:public\.)?mirror_scores\s+add\s+column\s+"
    r"(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)",
    re.IGNORECASE,
)


def _declared_columns() -> set[str]:
    """Columns `mirror_scores` has according to the DDL in this repo.

    Reads the base schema plus every migration that adds a column, which is the
    same union the deployed database is built from.
    """
    columns: set[str] = set()

    body = _CREATE_TABLE.search(_SCHEMA.read_text())
    assert body, "mirror_scores CREATE TABLE not found in database/schema.sql"
    for line in body.group(1).splitlines():
        name = line.strip().split(" ", 1)[0].strip().strip(",")
        # Skip table-level constraints, which are not columns.
        if name and re.fullmatch(r"[a-z_][a-z0-9_]*", name, re.IGNORECASE):
            if name.lower() not in {"primary", "unique", "constraint", "foreign", "check"}:
                columns.add(name)

    for migration in sorted(_MIGRATIONS.glob("*.sql")):
        columns.update(match.lower() for match in _ADD_COLUMN.findall(migration.read_text()))

    return columns


def test_every_written_column_exists_in_the_schema() -> None:
    declared = _declared_columns()
    missing = {column for column in MIRROR_SCORE_COLUMNS if column not in declared}
    assert not missing, (
        f"_persist_score writes {sorted(missing)}, which mirror_scores does not have. "
        "Add the migration — otherwise every score write returns PGRST204 and the "
        "user waits on a spinner forever."
    )


def test_payload_matches_its_declared_columns() -> None:
    """The declaration is only worth having if the write is held to it."""
    written: dict[str, object] = {}

    class _Repo:
        def mirror_score_exists(self, _user_id: str) -> bool:
            return False

        def insert_mirror_score(self, _user_id: str, payload: dict) -> None:
            written.update(payload)

        def append_score_history(self, _user_id: str, _total: float) -> None:
            pass

        def require_mirror_score(self, _user_id: str) -> dict:
            return {"total_score": 42.0}

    _persist_score(
        _Repo(),
        "user-1",
        ScoreProjection(
            total_score=42.0,
            domain_scores={"IT": 42.0},
            domain_skill_counts={"IT": 3},
            gap_skills=[],
            rank_tier="Explorer",
            skills_assessed=3,
        ),
    )
    assert set(written) == MIRROR_SCORE_COLUMNS


def test_write_failure_is_raised_not_swallowed() -> None:
    """A failed score write must reach RQ. Returning normally is what let the old
    failure be recorded as 'Job OK' while the user's score never existed."""

    class _FailingRepo:
        def mirror_score_exists(self, _user_id: str) -> bool:
            return False

        def insert_mirror_score(self, _user_id: str, _payload: dict) -> None:
            raise RuntimeError("PGRST204: column does not exist")

        def append_score_history(self, _user_id: str, _total: float) -> None:  # pragma: no cover
            raise AssertionError("history must not be appended for a score that never landed")

        def require_mirror_score(self, _user_id: str) -> dict:  # pragma: no cover
            raise AssertionError("must not report a score it failed to write")

    projection = ScoreProjection(
        total_score=1.0,
        domain_scores={},
        domain_skill_counts={},
        gap_skills=[],
        rank_tier="Newcomer",
        skills_assessed=0,
    )
    try:
        _persist_score(_FailingRepo(), "user-1", projection)
    except RuntimeError:
        return
    raise AssertionError("_persist_score swallowed a failed write")
