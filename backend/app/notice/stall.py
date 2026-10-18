"""One database stall is one cause, not one Notice per query it slowed.

A slow read names the code that asked (`slow_200:slow_read:<file>:<function>`).
That is right when one query is expensive, and wrong when the database stalls
for everyone: each request's slowest trip crosses 2s and opens a Notice under
whichever query happened to be running. 2026-10-16 05:08–05:15 (the scraper's
landing) left five call sites sighted, four of them failed closes; at 05:09
four different routes crossed 2s in one minute. 2026-10-13 14:52:13 opened
three in one second. The 10-18 digest listed 31 slow reads to fix and no cause.

So a slow read waits out its window before it is filed. If, within
`STALL_WINDOW` either side of it, slow reads came from `STALL_SITES` or more
different call sites, it is `slow_200:db_stall` — the database, not that
query. One site hammered many times is still that site: a slow query under
load is the case the slow-read Notice exists for.

Used by the Notice writer thread alone (`wiring._drain`); not thread-safe. A
process that exits loses at most one window of held slow reads.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.notice.types import Sighting

STALL_WINDOW = timedelta(seconds=60)
STALL_SITES = 3


@dataclass
class _Held:
    at: datetime
    sighting: Sighting
    filed: bool = False


def _is_slow_read(sighting: Sighting) -> bool:
    return sighting.cause_class == "slow_200" and sighting.slow_kind == "slow_read"


def _site(sighting: Sighting) -> tuple[str | None, str | None]:
    return sighting.site_file, sighting.site_function


class StallWindow:
    def __init__(
        self,
        *,
        window: timedelta = STALL_WINDOW,
        sites: int = STALL_SITES,
    ) -> None:
        self._window = window
        self._sites = sites
        self._held: list[_Held] = []

    def admit(self, sighting: Sighting, now: datetime) -> tuple[Sighting, ...]:
        """What may be filed now, in arrival order. A slow read waits its window."""
        ready = self.due(now)
        if not _is_slow_read(sighting):
            return (*ready, sighting)
        self._held.append(_Held(at=now, sighting=sighting))
        return ready

    def due(self, now: datetime) -> tuple[Sighting, ...]:
        """Held slow reads whose window has closed, each judged by its neighbours."""
        out: list[Sighting] = []
        for held in self._held:
            if held.filed or now - held.at < self._window:
                continue
            held.filed = True
            out.append(self._judge(held))
        # A filed read stays one more window: it is still a later read's neighbour.
        self._held = [
            held
            for held in self._held
            if not held.filed or now - held.at <= 2 * self._window
        ]
        return tuple(out)

    def _judge(self, held: _Held) -> Sighting:
        sites = {
            _site(other.sighting)
            for other in self._held
            if abs(other.at - held.at) <= self._window
        }
        if len(sites) < self._sites:
            return held.sighting
        return Sighting.slow_200(
            kind="db_stall",
            method=held.sighting.method,
            path=held.sighting.path,
        )
