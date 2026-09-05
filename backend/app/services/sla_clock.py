"""The one working-day clock.

Three paid, human-reviewed deliverables promise a turnaround in working days —
the ₹99 Job-Switch Plan, the Myrology map, and the ₹999 AI Workflow Audit — and
each had grown, or was about to grow, its own copy of this arithmetic. Three
implementations of an SLA is three chances to promise a different Friday.

Public holidays are deliberately not modelled: the reviewer queue absorbs them,
and a holiday calendar that nobody maintains is worse than a rule everyone
understands.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import TypeVar

#: `datetime` is a subclass of `date`, and both support `+ timedelta` and
#: `.weekday()`, so one implementation serves both and returns what it was given.
D = TypeVar("D", date, datetime)


def add_working_days(start: D, days: int) -> D:
    """`start` plus `days` working days, skipping Saturday and Sunday.

    Counting forward from the day AFTER `start`: an SLA of one working day set
    on a Monday is due Tuesday, and one set on a Friday is due Monday.
    """
    day = start
    added = 0
    while added < days:
        day = day + timedelta(days=1)
        if day.weekday() < 5:  # Mon–Fri
            added += 1
    return day
