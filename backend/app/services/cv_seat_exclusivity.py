"""A full-time seat is exclusive on the page (ADR-0026 step 4).

Two employers cannot run at the same time. When a job document dates one
experience row across another, one of them is a side pursuit wearing a second
employer's clothes — the defect the Microsoft application had to be corrected
out of (Finlatics dated across Capgemini). This is a deterministic read of the
dates the person already confirmed, never a model's guess about which seat is
"real".

Scope is employer-vs-employer overlap only. A role that overlaps a degree is
left alone: interning or working through a full-time degree is ordinary and
true, and blocking it would cost a sent application for no defect. The fix for
a flagged pair is to date the side role so it does not run across the seat, or
to move it to projects — not to invent a date.
"""
from __future__ import annotations

from typing import Any, Mapping

from app.services.cv_role_guard import date_span


def _label(row: Mapping[str, Any]) -> str:
    role = str(row.get("role") or "").strip()
    company = str(row.get("company") or "").strip()
    return " · ".join(part for part in (role, company) if part) or "A role"


def overlapping_seats(experience: Any) -> tuple[str, str] | None:
    """The first pair of experience rows whose dated spans overlap, or None.

    Spans are month-granular (YYYYMM). Two rows overlap only when each starts
    strictly before the other ends, so a role that ends the same month the next
    begins is adjacent, not concurrent.
    """
    if not isinstance(experience, list):
        return None
    dated: list[tuple[tuple[int, int], str]] = []
    for row in experience:
        if not isinstance(row, dict):
            continue
        span = date_span(str(row.get("dates") or ""))
        if span is not None:
            dated.append((span, _label(row)))
    for i in range(len(dated)):
        (a_start, a_end), a_label = dated[i]
        for j in range(i + 1, len(dated)):
            (b_start, b_end), b_label = dated[j]
            if a_start < b_end and b_start < a_end:
                return a_label, b_label
    return None
