"""One telemetry vocabulary, spelled the same in all three places.

`phase` and `outcome` are declared four times — a TypeScript union that produces
them, a Pydantic `Literal` that accepts them, and a SQL CHECK that stores them
(twice, since the phase CHECK was widened by a later migration). Nothing tied
them together, and they drifted: `confirm` and `direction` were added to the
Literal with no migration, so for seven days every one of those events raised
inside the BackgroundTask AFTER the route had answered 202. The table held
zero `confirm` and zero `direction` rows and no one could tell, because the
client reads nothing and a background failure names no table.

These tests are the tie. The Python `Literal` is the single definition;
`CV_UPLOAD_PHASES` / `CV_UPLOAD_OUTCOMES` are derived from it with `get_args`,
so a value added to the model is automatically checked against the other two.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.routers.telemetry import CV_UPLOAD_PHASES, CV_UPLOAD_OUTCOMES

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "database" / "migrations"
API_TS = ROOT / "frontend" / "lib" / "api.ts"


def _sql_check_values(table: str, column: str) -> set[str]:
    """The values the LAST migration to constrain `column` allows.

    Last, not first: `20260525e` created the phase CHECK and `20260908b`
    dropped and re-added it. A test reading only the creating migration would
    have passed throughout the seven-day outage.
    """
    # Matches both spellings: the inline column CHECK of the CREATE TABLE and
    # the `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` that widens it later.
    pattern = re.compile(
        rf"check\s*\(\s*{column}\s+in\s*\(([^)]*)\)",
        re.IGNORECASE | re.DOTALL,
    )
    found: list[set[str]] = []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        sql = path.read_text(encoding="utf-8")
        if table not in sql:
            continue
        for match in pattern.finditer(sql):
            found.append(set(re.findall(r"'([^']+)'", match.group(1))))
    if not found:
        raise AssertionError(f"no CHECK on {table}.{column} found in any migration")
    return found[-1]


def test_every_phase_the_api_accepts_the_database_also_stores() -> None:
    allowed = _sql_check_values("cv_upload_phase_events", "phase")
    missing = set(CV_UPLOAD_PHASES) - allowed
    assert not missing, (
        f"the API accepts {sorted(missing)} and the CHECK rejects them — every one of "
        "those events will raise inside a BackgroundTask after a 202 and vanish"
    )


def test_the_database_stores_no_phase_the_api_cannot_send() -> None:
    # The other direction is not an outage, but it is a dead value nobody
    # writes, and it makes the CHECK stop describing the system.
    allowed = _sql_check_values("cv_upload_phase_events", "phase")
    assert not allowed - set(CV_UPLOAD_PHASES), "the CHECK allows a phase the API cannot produce"


def test_every_outcome_the_api_accepts_the_database_also_stores() -> None:
    allowed = _sql_check_values("cv_upload_phase_events", "outcome")
    missing = set(CV_UPLOAD_OUTCOMES) - allowed
    assert not missing, f"outcome CHECK rejects {sorted(missing)}"


def test_the_outcome_check_and_the_api_agree_exactly() -> None:
    assert _sql_check_values("cv_upload_phase_events", "outcome") == set(CV_UPLOAD_OUTCOMES)


# ── the third spelling: the TypeScript that produces these events ────────────


def _ts_union(name: str) -> set[str]:
    source = API_TS.read_text(encoding="utf-8")
    match = re.search(rf"type\s+{name}\s*=\s*([^\n]+)", source)
    assert match, f"{name} is gone from lib/api.ts — the emitter's vocabulary moved"
    return set(re.findall(r'"([^"]+)"', match.group(1)))


@pytest.mark.parametrize("union", ["CVUploadTelemetryPhase", "JourneyTelemetryPhase"])
def test_the_frontend_sends_no_phase_the_api_rejects(union: str) -> None:
    unknown = _ts_union(union) - set(CV_UPLOAD_PHASES)
    assert not unknown, f"{union} can emit {sorted(unknown)}, which the API 422s"


def test_the_frontend_covers_every_phase_between_its_two_unions() -> None:
    # Two unions, one vocabulary: the upload emits its own phases from inside
    # `uploadCV`, and the two post-upload steps emit through `emitJourneyPhase`.
    # Together they must account for the whole Literal, or a phase exists that
    # nothing can ever send.
    both = _ts_union("CVUploadTelemetryPhase") | _ts_union("JourneyTelemetryPhase")
    assert both == set(CV_UPLOAD_PHASES)


def test_the_frontend_sends_no_outcome_the_api_rejects() -> None:
    unknown = _ts_union("CVUploadTelemetryOutcome") - set(CV_UPLOAD_OUTCOMES)
    assert not unknown, f"the emitter can send {sorted(unknown)}, which the API 422s"
