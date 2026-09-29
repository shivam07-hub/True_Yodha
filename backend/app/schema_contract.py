"""The columns the code names, checked against the running database at boot.

A migration file proves a column was meant; only the database can say it was
applied. `464f216c` read `user_job_matches.eval_outcome` from 20:03 UTC on
2026-09-17, the column arrived hours later, and `GET /jobs/applications` 500'd
in between. PostgREST resolves columns per request, so nothing failed at boot.

Each contract is a column set the code already declares next to its read or
write. The probe is a zero-row select per table. Only "no such column/table"
counts as a mismatch: a timeout or a dropped connection at boot says nothing
about the schema, and must never hold a deploy back.

`/health/ready` serves the result. A deploy gate (Railway `healthcheckPath`)
that asks it will not promote a build whose columns are not there yet.
"""
from __future__ import annotations

import logging
from typing import Any

from postgrest.exceptions import APIError

logger = logging.getLogger(__name__)

# 42703 undefined column · 42P01 undefined table · PGRST204/205 not in the
# schema cache (a column / a table). Anything else is not about the schema.
_SCHEMA_CODES = frozenset({"42703", "42P01", "PGRST204", "PGRST205"})

_missing_at_boot: list[str] = []


def contracts() -> dict[str, tuple[str, ...]]:
    """Table → the columns the code names on it, from the constants it already keeps."""
    from app.repositories.jobs import JobsRepository
    from app.services.scoring.orchestrator import MIRROR_SCORE_COLUMNS

    evals = (JobsRepository._MATCH_EVAL_BADGE_COLS + "," + JobsRepository._MATCH_EVAL_FULL_COLS)
    return {
        "user_job_matches": tuple(dict.fromkeys(c.strip() for c in evals.split(",") if c.strip())),
        "mirror_scores": tuple(sorted(MIRROR_SCORE_COLUMNS)),
    }


def missing(db: Any) -> list[str]:
    """`table: reason` for every contract the database cannot answer."""
    out: list[str] = []
    for table, columns in contracts().items():
        try:
            db.table(table).select(",".join(columns)).limit(0).execute()
        except APIError as exc:
            if getattr(exc, "code", None) in _SCHEMA_CODES:
                out.append(f"{table}: {exc.message}")
            else:
                logger.warning("metric schema_contract.probe_inconclusive table=%s code=%s",
                               table, getattr(exc, "code", None))
        except Exception as exc:  # noqa: BLE001 — a boot probe must not decide on a blip
            logger.warning("metric schema_contract.probe_inconclusive table=%s reason=%s",
                           table, exc.__class__.__name__)
    return out


def check_at_boot(db: Any) -> list[str]:
    global _missing_at_boot
    _missing_at_boot = missing(db)
    if _missing_at_boot:
        logger.error("metric schema_contract.missing %s", " | ".join(_missing_at_boot))
    return _missing_at_boot


def missing_at_boot() -> list[str]:
    return list(_missing_at_boot)
