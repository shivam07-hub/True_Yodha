"""Durable Background-Work seam (ADR-0008).

One way to defer LLM-bearing work off the request path:

    from app.services import background
    background.enqueue(background.LANE_FAST, "cv_parse_score", payload={...})

Routing is decided by `settings.redis_url`:
  - set   → RQ durable queue on the named Work Lane, consumed by a Job Runner.
  - unset → in-process `asyncio.create_task` (current prod + local dev), so
            porting a call site never breaks an environment without Redis. The
            cutover to durable is a deploy-time env change, not a code change.

See CONTEXT.md → Background Job / Work Lane / Job Runner.
"""

from app.services.background.dispatch import (
    LANE_BULK,
    LANE_FAST,
    TransientJobError,
    enqueue,
    handler,
    run_job_sync,
)

__all__ = [
    "LANE_FAST",
    "LANE_BULK",
    "TransientJobError",
    "enqueue",
    "handler",
    "run_job_sync",
]
