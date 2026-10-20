"""core_loop_events — the one writer of the core loop's otherwise-blind steps.

Two kinds of step land in the table (CONTEXT.md → Apply funnel):

  · beacon steps — sent by a surface when it happens (a Tailor click, the
    editor opening, the "Did you apply?" prompt rendering). Accepted by
    `POST /v1/telemetry/loop-step`.
  · server steps — facts only the server may state. `applied` is written where
    a job first moves to `applied`, with the door the caller names; a client
    cannot send it, or one beacon would forge the north star's door count.

Best-effort and LOUD: a dropped row must never fail the step it watches, and
must never be silent either (the 20260908b CHECK drift stayed invisible for
seven days because a background failure names no table).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.database import get_supabase_admin

_log = logging.getLogger(__name__)

#: Written only by the server, where the fact happens. `weave_ran`: a Mentor
#: weave produced a proposal and was paid for. `review_done`: the landing that
#: decided that proposal's last card.
SERVER_STEPS: tuple[str, ...] = ("applied", "weave_ran", "review_done")


def record_step(user_id: str, job_id: str, step: str, surface: str | None) -> bool:
    try:
        get_supabase_admin().table("core_loop_events").insert({
            "user_id": user_id,
            "job_id": job_id,
            "step": step,
            "surface": surface,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        return True
    except Exception as exc:  # noqa: BLE001 — a dropped step must be visible, never fatal
        _log.warning("metric core_loop.persist_failed step=%s error=%s", step, exc)
        return False
