"""ADR-0009 progress-stream helpers (PR2 — SSE relay).

A *snapshot-watch relay*: the web process tails an existing source of truth
(the Job Refresh Redis state key, the cv_versions.recompute_finished_at flag)
on a short server-side tick and emits the ADR-0009 typed envelope over SSE.
The browser holds ONE long-lived `text/event-stream` connection instead of
issuing N short polls — latency-to-first-signal drops to the snapshot read,
and reconnect is free (a fresh connection re-reads the snapshot).

Why snapshot-watch and not Redis pub/sub fan-out (the ADR-0009 "Decision"):
the source of truth is already cross-process (Redis state key / Postgres flag),
so a server-side tail is correct in BOTH durable (RQ worker) and in-process
(no-Redis dev/test) modes with zero worker changes. Pub/sub stays a future
latency optimization layered on top — see ADR-0009.
"""

from __future__ import annotations

import json
from typing import Any

# Comment frame — keeps proxies from idling the connection closed. Clients
# ignore any frame that is not a `data:` line.
HEARTBEAT = ": keepalive\n\n"

# How often the relay re-reads the source of truth, and the hard cap after which
# it emits a terminal frame so a connection never hangs forever.
TICK_SECONDS = 0.7
TIMEOUT_SECONDS = 45.0

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    # Disable proxy buffering (nginx / Railway edge) so frames flush live.
    "X-Accel-Buffering": "no",
}


def sse(payload: dict[str, Any]) -> str:
    """Serialise one ADR-0009 envelope as an SSE `data:` frame."""
    return f"data: {json.dumps(payload)}\n\n"
