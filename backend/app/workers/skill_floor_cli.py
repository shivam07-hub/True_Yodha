"""Give every skill-less job its deterministic skill floor.

    python -m app.workers.skill_floor_cli --count
    python -m app.workers.skill_floor_cli --apply [--limit N]

`--count` is the read-only answer to "how much of the corpus is invisible to the
matcher right now". `--apply` closes it. Both call an anti-join that costs ~3s
and evicts a meaningful slice of the buffer cache — run them deliberately, not
on a timer tighter than the heartbeat in `app.main`.

Safe to re-run: the writer upserts and never deletes, so a second pass over an
already-floored corpus is a no-op.
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.database import get_supabase_admin_batch
from app.services import skill_floor

logger = logging.getLogger("skill_floor")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the floor (default: count only)")
    parser.add_argument("--limit", type=int, default=None, help="stop after N jobs")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    db = get_supabase_admin_batch()

    total, recommendable = skill_floor.count_missing_floor(db)
    logger.info("metric skill_floor.gap total=%d recommendable=%d", total, recommendable)
    if not args.apply:
        return 0

    result = skill_floor.drain_skill_floor_queue(db, limit=args.limit)
    after_total, after_recommendable = skill_floor.count_missing_floor(db)
    logger.info(
        "metric skill_floor.drain_done seen=%d written=%d empty=%d remaining=%d remaining_recommendable=%d",
        result["jobs_seen"], result["jobs_written"], result["jobs_empty"], after_total, after_recommendable,
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
