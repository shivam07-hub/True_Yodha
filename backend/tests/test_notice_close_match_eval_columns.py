"""Close proof: the match-eval read must never name a column the DDL lacks.

`464f216c` (2026-09-17 23:04 IST) added `eval_outcome` to the eval select and
shipped `20260917140000_user_job_matches_eval_outcome.sql` in the same commit.
Production took the code at 20:03 UTC; the column arrived later, outside
`schema_migrations`. In between, `GET /jobs/applications` 500'd 11 times on
`get_cached_match_evals`, and stopped once the column existed. Same shape as
the 2026-07-31 score outage (`test_score_persist_contract.py`).

This proves the repo half: every selected column is declared by
`database/schema.sql` or an `add column` migration. The deployed half — a
migration applied before the code that reads it — is a process rule, and a
BACKLOG item.
"""
from __future__ import annotations

import re
from pathlib import Path

from app.repositories.jobs import JobsRepository

NOTICE_CAUSE_KEY = "unhandled_500:APIError:app/repositories/jobs.py:get_cached_match_evals"

_ROOT = Path(__file__).resolve().parents[2]
_CREATE = re.compile(
    r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?user_job_matches\s*\((.*?)\n\s*\);",
    re.IGNORECASE | re.DOTALL,
)
_ALTER = re.compile(
    r"alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?user_job_matches\b(.*?);",
    re.IGNORECASE | re.DOTALL,
)
_ADD = re.compile(r"add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)", re.IGNORECASE)
_RENAME = re.compile(r"rename\s+column\s+[a-z_0-9]+\s+to\s+([a-z_][a-z0-9_]*)", re.IGNORECASE)


def _declared() -> set[str]:
    body = _CREATE.search((_ROOT / "database/schema.sql").read_text())
    assert body, "user_job_matches CREATE TABLE not found in database/schema.sql"
    columns = {
        line.strip().split()[0].strip(",").lower()
        for line in body.group(1).splitlines()
        if line.strip() and not line.strip().upper().startswith(("CONSTRAINT", "UNIQUE", "PRIMARY", "--"))
    }
    for path in sorted((_ROOT / "database/migrations").glob("*.sql")):
        for alter in _ALTER.finditer(path.read_text()):
            columns |= {c.lower() for c in _ADD.findall(alter.group(1))}
            columns |= {c.lower() for c in _RENAME.findall(alter.group(1))}
    return columns


def test_every_eval_column_the_read_names_is_declared() -> None:
    selected = {
        c.strip()
        for c in (
            JobsRepository._MATCH_EVAL_BADGE_COLS + "," + JobsRepository._MATCH_EVAL_FULL_COLS
        ).split(",")
        if c.strip()
    }
    missing = selected - _declared()
    assert not missing, f"user_job_matches has no DDL for {sorted(missing)}"
