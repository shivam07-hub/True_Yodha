"""A column default must satisfy its own CHECK constraint.

`job_applications.status` defaulted to 'pending' while its CHECK constraint
allowed only ('saved','applied','screening','interviewing','final_round',
'ghosted','rejected','offer','withdrew'). The two drifted apart in stages:
`20260517_tracker_v1.sql` remapped the DATA off 'pending' and the vocabulary
CHECK was later rewritten without it, but nothing moved the DEFAULT.

Nothing failed loudly, because PostgREST upserts compile to
INSERT ... ON CONFLICT and every caller but one sets `status` explicitly. The
exception is PUT /jobs/applications/{job_id}/priority — the heart. Postgres
evaluates CHECK constraints on the proposed tuple before conflict arbitration,
so the orphaned default materialised and raised

    23514: new row for relation "job_applications" violates check constraint
           "job_applications_status_check"

on every heart tap, for every user, on desktop and mobile alike — even when
the row already existed. The frontend's optimistic fill rolled straight back,
so it looked like a toggle that would not stick rather than a 500.

Falsified: revert `database/migrations/20260826100000_job_applications_status_default.sql`
(or set schema.sql's default back to 'pending') and
`test_status_default_is_an_allowed_status` fails naming 'pending' — it
reproduces the outage at test time instead of at heart-tap time.
"""

from __future__ import annotations

import re
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCHEMA = _REPO_ROOT / "database" / "schema.sql"
_MIGRATIONS = _REPO_ROOT / "database" / "migrations"

_STATUS_COLUMN = re.compile(
    r"status\s+VARCHAR\(\d+\)\s+NOT NULL\s+DEFAULT\s+'(?P<default>[a-z_]+)'"
    r"\s*(?:--[^\n]*\n\s*)*CHECK\s*\(status\s+IN\s*\((?P<allowed>[^)]*)\)\)",
    re.IGNORECASE,
)
_ALTER_DEFAULT = re.compile(
    r"ALTER\s+TABLE\s+(?:public\.)?job_applications\s+ALTER\s+COLUMN\s+status\s+"
    r"SET\s+DEFAULT\s+'(?P<default>[a-z_]+)'",
    re.IGNORECASE,
)


def _declared() -> tuple[str, set[str]]:
    """The default and allowed set as the checked-in schema declares them,
    with any later ALTER ... SET DEFAULT applied in migration-name order."""
    match = _STATUS_COLUMN.search(_SCHEMA.read_text())
    assert match, "job_applications.status not found in schema.sql"
    default = match.group("default")
    allowed = {value.strip().strip("'") for value in match.group("allowed").split(",")}

    for migration in sorted(_MIGRATIONS.glob("*.sql")):
        altered = _ALTER_DEFAULT.search(migration.read_text())
        if altered:
            default = altered.group("default")
    return default, allowed


def test_status_default_is_an_allowed_status() -> None:
    default, allowed = _declared()
    assert default in allowed, (
        f"job_applications.status defaults to {default!r}, which its own CHECK "
        f"constraint rejects (allows {sorted(allowed)}). Every write that omits "
        f"`status` will raise 23514 — including the heart."
    )


def test_the_allowed_set_is_the_vocabulary_the_code_writes() -> None:
    """The stages the API can persist must all be accepted by the constraint."""
    _, allowed = _declared()
    written_by_code = {"saved", "applied", "screening", "interviewing",
                       "final_round", "ghosted", "rejected", "offer", "withdrew"}
    assert written_by_code <= allowed, (
        f"the API writes statuses the CHECK rejects: {sorted(written_by_code - allowed)}"
    )
