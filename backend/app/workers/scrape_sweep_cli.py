"""Manual/scheduled trigger for the scrape-triggered match sweep (Backlog #36).

    python -m app.workers.scrape_sweep_cli --since 20260709 [--cap 200]

Cadence/automation is intentionally NOT wired here — call this from a Railway
one-off command, a manually-configured cron, or an admin action, on whatever
schedule is decided (poll interval is a cost/product call, see CLAUDE.md
backlog #36). `--since` defaults to yesterday if omitted — a safe one-off
manual-run default, not an assumed auto-loop cadence.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

from app.database import get_supabase_admin
from app.repositories.jobs import JobsRepository
from app.services.matching.scrape_sweep import DEFAULT_SWEEP_CAP, run_sweep


def _yesterday_marker() -> int:
    return int((datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y%m%d"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--since", type=int, default=None,
        help="YYYYMMDD marker — jobs with first_seen after this count as new. Default: yesterday.",
    )
    parser.add_argument(
        "--cap", type=int, default=DEFAULT_SWEEP_CAP,
        help="Max users to enqueue this run (protects the shared LLM budget).",
    )
    args = parser.parse_args()

    since_marker = args.since if args.since is not None else _yesterday_marker()
    admin_db = get_supabase_admin()
    repo = JobsRepository(admin_db, admin_db)
    result = run_sweep(repo, since_marker=since_marker, cap=args.cap)
    print(f"scrape_sweep: since={since_marker} cap={args.cap} -> {result}")


if __name__ == "__main__":
    main()
