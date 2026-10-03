"""Per-request database read counter (ARCHITECTURE_READ_PATH.md §2, §17).

`fanout.over_budget` reports the WIDTH of a wave, and only for code that calls
`run_concurrently`. /career-skill-path shipped nineteen SEQUENTIAL reads and no
guard saw it, because a route that never fans out never touches that seam.

Every PostgREST read leaves through one place — the shared transport in
`app.database` — so that is where the count belongs. This module is the tally
behind it: the middleware opens a counter per request, the transport increments
it, and the middleware reports the total.

Counting only. It never blocks, raises, or changes a response; the read-capacity
limiter already owns admission, and a diagnostic that can fail a user's request
is worse than no diagnostic.
"""

from __future__ import annotations

import threading
import traceback
from contextvars import ContextVar, Token
from typing import NamedTuple


class ReadCounter:
    """A request's read tally.

    Mutable ON PURPOSE, and shared by reference rather than by value.
    `run_concurrently` hands sections to a thread pool under a COPIED context,
    and a value written inside a copied context is invisible to the parent. A
    plain `ContextVar[int]` would therefore count only the reads a route issues
    on its own thread — silently excluding exactly the fan-out reads the
    contract is about. Sharing one object means every thread increments the
    same tally.
    """

    __slots__ = ("_count", "_lock", "_slowest")

    def __init__(self) -> None:
        self._count = 0
        self._lock = threading.Lock()
        self._slowest: SlowRoundTrip | None = None

    def record(self) -> None:
        with self._lock:
            self._count += 1

    def record_slow(self, trip: SlowRoundTrip) -> None:
        with self._lock:
            if self._slowest is None or trip.ms > self._slowest.ms:
                self._slowest = trip

    @property
    def count(self) -> int:
        with self._lock:
            return self._count

    @property
    def slowest(self) -> SlowRoundTrip | None:
        with self._lock:
            return self._slowest


class SlowRoundTrip(NamedTuple):
    """One database round trip that was slow on its own, and the app code that
    asked for it — the same file:function identity an unhandled 500 carries."""

    ms: float
    file: str
    function: str


_current: ContextVar[ReadCounter | None] = ContextVar("db_read_counter", default=None)

# What a single user-facing request may read in total. The contract's own limit
# is 3 CONCURRENT reads; this is the looser total-depth companion, set above the
# worst legitimate shape so it names outliers rather than nagging:
#   /career-skill-path  11 reads / 5 round trips (§17, after f138a5b9)
#   /home/bootstrap      8 concurrent sections, matches fans out again (§15 row 1)
# Nineteen sequential reads — the shape this exists to catch — clears it easily.
READ_BUDGET_PER_REQUEST = 16


def begin() -> Token[ReadCounter | None]:
    """Start counting for one request. Returns a token for `end`."""
    return _current.set(ReadCounter())


def end(token: Token[ReadCounter | None]) -> None:
    _current.reset(token)


def record_read() -> None:
    """Count one database read against the request in flight, if any.

    Reads issued outside a request — workers, startup checks, scripts — have no
    counter and are deliberately not tallied.
    """
    counter = _current.get()
    if counter is not None:
        counter.record()


def current_count() -> int:
    counter = _current.get()
    return counter.count if counter is not None else 0


# A single round trip this slow is the request's cause, not a queue it stood in.
# Half the 1s slow-request line: past it, one query owns most of the wait.
SLOW_ROUND_TRIP_MS = 500.0

# Frames that are the transport, not the caller. The site is the first app frame
# outside them — the repository or service that asked the question.
_TRANSPORT_FILES = ("app/database.py", "app/services/read_budget.py", "app/db_safe.py")


def record_round_trip(elapsed_ms: float) -> None:
    """Time one PostgREST round trip against the request in flight.

    Only a slow trip pays for a stack walk, so the common case is one compare.
    The time is the network call alone — never the read-capacity wait before
    it, or a queue victim would be named as its own cause.
    """
    if elapsed_ms < SLOW_ROUND_TRIP_MS:
        return
    counter = _current.get()
    if counter is None:
        return
    file, function = _caller_site()
    counter.record_slow(SlowRoundTrip(ms=elapsed_ms, file=file, function=function))


def slowest_round_trip() -> SlowRoundTrip | None:
    counter = _current.get()
    return counter.slowest if counter is not None else None


def _caller_site() -> tuple[str, str]:
    for frame in reversed(traceback.extract_stack()):
        path = frame.filename.replace("\\", "/")
        marker = path.rfind("/app/")
        if marker == -1:
            continue
        rel = path[marker + 1:]
        if rel in _TRANSPORT_FILES:
            continue
        return rel, frame.name
    return "unknown", "unknown"
