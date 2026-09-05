"""The B2B usage meter.

One append-only table, keyed on `partners` — the account table that already
exists. The partner API is its first caller, not its owner: a dataset customer
later is a row in `partners` and writes the same metric shape here, so there is
never a second meter to keep in step with this one.

What it does NOT do, on purpose: refuse anything. There is no plan, no quota and
no enforcement. The partner API's SSO is the sign-in path for 281 real students,
and a meter whose first act is an outage is worse than no meter.
"""
from __future__ import annotations

import logging
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

# Metric namespace. Dotted, lowercase — the column's CHECK enforces the shape so
# a typo becomes a write error in a background task rather than a silent second
# metric nobody notices until a period is queried.
METRIC_SSO_SESSION = "sso.session"


class PartnerUsageRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    def record(
        self,
        *,
        partner_id: str,
        metric: str,
        subject_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> None:
        """Record one metered event. Best-effort, and deliberately so.

        This runs in a background task after the response is already on its way,
        so a failure here cannot reach the caller. That is the trade being made
        knowingly: a lost write undercounts, and undercounting is the acceptable
        direction. The billable unit is a monthly ACTIVE SEAT — distinct seats in
        a month — so losing one session of a seat that signs in repeatedly costs
        nothing at all, and the worst case is one seat missing from one month.

        `period_month` is not passed. The column generates it from `occurred_at`
        in IST, so no caller can disagree with another about which month an event
        belongs to.
        """
        try:
            self._db.table("partner_usage_events").insert(
                {
                    "partner_id": partner_id,
                    "metric": metric,
                    "subject_id": subject_id,
                    "detail": detail or {},
                }
            ).execute()
        except Exception as exc:  # noqa: BLE001 — metering, never control flow
            # Loud enough to find in logs, quiet enough that it never becomes an
            # incident: nothing downstream reads this result.
            logger.warning(
                "metric partner_usage.write_failed partner=%s metric=%s reason=%s",
                partner_id,
                metric,
                type(exc).__name__,
            )

    def summary(
        self, *, partner_id: str | None = None, period: str | None = None
    ) -> list[dict[str, Any]]:
        """Usage per account, period and metric. `period` is 'YYYY-MM'."""
        resp = self._db.rpc(
            "partner_usage_summary",
            {"p_partner_id": partner_id, "p_period": period},
        ).execute()
        return list(resp.data or [])
