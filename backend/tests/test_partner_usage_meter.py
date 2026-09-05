"""The B2B usage meter.

The partner API carried 281 seats for 26 days before anything counted them, and
both `last_used_at` and `last_sso_at` are overwritten on each use — so there was
no history to recover and the meter starts at zero. These lock the decisions
that made it safe to add to a live sign-in path.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.repositories.partner_usage import METRIC_SSO_SESSION, PartnerUsageRepository

MIGRATION = (
    Path(__file__).parents[2] / "database/migrations/20260905g_partner_usage_meter.sql"
).read_text()

#: The DDL with prose removed — both `--` comments and `comment on ... is '...'`
#: statements, which are DDL but are still prose. A contract test that greps the
#: raw file trips on the file's own explanation: the header and the table comment
#: both say there is no plan or quota column, which is the very word an
#: assertion about quotas was looking for. Assert on structure, not vocabulary.
_NO_LINE_COMMENTS = "\n".join(line.split("--")[0] for line in MIGRATION.splitlines())
DDL = re.sub(r"comment on [^;]+;", "", _NO_LINE_COMMENTS, flags=re.IGNORECASE | re.DOTALL)

#: Column names declared in the CREATE TABLE body. Matched at the body's own
#: indent only: `period_month`'s generated expression wraps onto a continuation
#: line, and a naive first-token split counted that wrap as an eighth column.
COLUMNS = re.findall(
    r"^  (\w+)\s+\w",
    DDL.split("create table if not exists public.partner_usage_events (")[1].split(");")[0],
    flags=re.MULTILINE,
)


class _Recorder:
    """Captures the insert, and can be told to fail like a real outage."""

    def __init__(self, *, explode: bool = False) -> None:
        self.explode = explode
        self.rows: list[dict[str, Any]] = []
        self.table_name = ""

    def table(self, name: str) -> "_Recorder":
        self.table_name = name
        return self

    def insert(self, row: dict[str, Any]) -> "_Recorder":
        self.rows.append(row)
        return self

    def execute(self) -> Any:
        if self.explode:
            raise RuntimeError("data api unavailable")
        return type("R", (), {"data": []})()


def test_a_metered_event_never_carries_its_own_period() -> None:
    """The month is generated in the column, from occurred_at.

    Two callers computing their own month disagree at a boundary exactly once,
    in production, and nobody notices until an invoice is queried.
    """
    db = _Recorder()
    PartnerUsageRepository(db).record(
        partner_id="p1", metric=METRIC_SSO_SESSION, subject_id="seat-1"
    )
    row = db.rows[0]
    assert "period" not in row and "period_month" not in row
    assert "occurred_at" not in row  # the column default is the clock of record
    assert db.table_name == "partner_usage_events"


def test_a_meter_outage_never_reaches_the_caller() -> None:
    """This runs behind a live sign-in path for 281 students.

    A lost write undercounts, and undercounting is the acceptable direction: the
    billable unit is a distinct seat per month, so losing one session of a seat
    that signs in repeatedly costs nothing.
    """
    db = _Recorder(explode=True)
    PartnerUsageRepository(db).record(
        partner_id="p1", metric=METRIC_SSO_SESSION, subject_id="seat-1"
    )  # must not raise


def test_the_billing_month_is_ist_not_utc() -> None:
    """A 4am IST login on the 1st is 22:30 UTC on the previous month's last day.

    A UTC period bills that September session to August. India-first product,
    India-based partner.
    """
    assert "interval '05:30'" in MIGRATION
    assert "date_trunc('month'" in MIGRATION


def test_the_period_column_avoids_to_char_entirely() -> None:
    """EVERY variant of `to_char` is STABLE — it reads DateStyle and lc_time — so
    Postgres refuses it in a generated column. This cost two failed migrations
    before the column became a date."""
    generated = DDL.split("period_month date generated always as")[1]
    generated = generated.split("stored")[0]
    assert "to_char" not in generated


def test_the_meter_hangs_off_the_account_table_that_already_exists() -> None:
    """`partners` is the account. A second tenant table is the drift this whole
    design exists to avoid — a dataset customer later is a row in it."""
    assert "references public.partners(id)" in DDL
    created = [
        line.split("create table if not exists")[1].split("(")[0].strip()
        for line in DDL.splitlines()
        if "create table if not exists" in line
    ]
    assert created == ["public.partner_usage_events"]


def test_there_is_no_plan_quota_or_enforcement() -> None:
    """Record, never block. The first act of a new meter must not be an outage
    on the sign-in path of a live partner.

    Asserted as the exact column set: a quota needs somewhere to live, and there
    is nowhere. This also catches the opposite drift — a column added later
    without anyone deciding what it means for a live partner's sign-in.
    """
    assert COLUMNS == [
        "id",
        "partner_id",
        "metric",
        "subject_id",
        "occurred_at",
        "period_month",
        "detail",
    ]


def test_usage_is_service_role_only() -> None:
    """No end-user token reads what a partner is billed for."""
    assert "revoke all on public.partner_usage_events from public, anon, authenticated;" in DDL
    assert "grant select, insert on public.partner_usage_events to service_role;" in DDL


def test_the_subject_is_text_so_a_roster_edit_cannot_erase_a_bill() -> None:
    subject_line = next(
        line for line in DDL.splitlines() if line.strip().startswith("subject_id")
    )
    assert "text" in subject_line
    assert "references" not in subject_line


def test_the_metric_namespace_is_enforced_in_the_column() -> None:
    """A typo becomes a write error in a background task, not a silent second
    metric discovered when a period is queried."""
    assert "check (metric ~" in DDL
    assert METRIC_SSO_SESSION == "sso.session"
