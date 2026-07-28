"""Manual admin trigger for a scrape-triggered match sweep (Backlog #36).

    python -m app.workers.scrape_sweep_cli --hours 24 [--cap 200]

⚠️ NOT the routine path. Since 2026-07-28 a landing matches nobody: the rows carry
`ingested_at`, each user's next visit turns that into a bell prompt, and the user
pulls their own match (`services/new_inventory.py`) — compute follows intent. Use
this only for a deliberate fan-out (backfill after an outage, force-match a window)
and know it spends LLM budget for every user it enqueues.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

from app.database import get_supabase_admin
from app.repositories.jobs import JobsRepository
from app.services.matching.scrape_sweep import DEFAULT_SWEEP_CAP, run_sweep


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--hours", type=int, default=24,
        help="Look back this many hours of landings (jobs.ingested_at). Default: 24.",
    )
    parser.add_argument(
        "--cap", type=int, default=DEFAULT_SWEEP_CAP,
        help="Max users to enqueue this run (protects the shared LLM budget).",
    )
    args = parser.parse_args()

    since = datetime.now(timezone.utc) - timedelta(hours=max(1, args.hours))
    admin_db = get_supabase_admin()
    repo = JobsRepository(admin_db, admin_db)
    result = run_sweep(repo, since=since, cap=args.cap)
    print(f"scrape_sweep: since={since.isoformat()} cap={args.cap} -> {result}")


if __name__ == "__main__":
    main()
