"""generate_learning_ladder.py — Learning Ladder content foundation (CLAUDE.md #15).

Two passes, in order:
  1. Complete — any technical-domain skill with SOME active content but not
     all 5 levels (a prior truncated/failed run) gets its missing levels
     filled before anything new is picked. A skill playable at only 1-4 of
     5 levels is worse than not started.
  2. Top-up — picks the top-N technical skills by real user demand not yet
     in the bank at all, generates a full 5-level x 10-question ladder.

Both use get_judgment_provider() (no cheap models) and an independent verify
pass that re-checks every correct_index. This command does not ingest source
material, so it writes draft `review` rows. The source-grounded publisher is
the path that may activate verified questions with a legitimate `source_url`.

Usage (from backend/, with SUPABASE_* + OPENROUTER_API_KEY/GROQ_API_KEY in env):
    python -m scripts.generate_learning_ladder --dry-run        # show plan only
    python -m scripts.generate_learning_ladder                  # complete + top-up 10
    python -m scripts.generate_learning_ladder --limit 3         # smaller top-up batch
    python -m scripts.generate_learning_ladder --skip-complete   # top-up only
"""
from __future__ import annotations

import argparse
import asyncio

from app.services.learning_ladder import (
    find_incomplete_skills,
    generate_ladder_for_skill,
    insert_rows,
    pick_target_skills,
    rows_for_insert,
)


async def _generate_and_write(skill, levels=None) -> tuple[int, int]:
    kwargs = {"levels": levels} if levels is not None else {}
    result = await generate_ladder_for_skill(skill, **kwargs)
    rows = rows_for_insert(result)
    written = insert_rows(rows)
    publishable = sum(1 for r in rows if r.get("review_status") == "published")
    return written, publishable


async def run(limit: int, dry_run: bool, skip_complete: bool) -> int:
    incomplete = [] if skip_complete else find_incomplete_skills()
    targets = pick_target_skills(limit=limit)

    if not incomplete and not targets:
        print("Nothing to do — bank already covers top demand, no partial ladders.")
        return 0

    if incomplete:
        print(f"incomplete ({len(incomplete)} — filled first):")
        for skill, missing in incomplete:
            print(f"  [{skill.id}] {skill.display_name}  missing levels {missing}")
    if targets:
        print(f"\nnew targets ({len(targets)}):")
        for t in targets:
            print(f"  [{t.id}] {t.display_name}  ({t.l1_domain} / {t.l2_cluster})")

    if dry_run:
        print("\nDRY RUN — no generation, nothing written.")
        return 0

    total_publishable, total_written = 0, 0
    for skill, missing in incomplete:
        print(f"\ncompleting: {skill.display_name} (levels {missing}) ...")
        written, publishable = await _generate_and_write(skill, levels=missing)
        total_publishable += publishable
        total_written += written
        print(f"  wrote {written} draft rows ({publishable} active)")

    for skill in targets:
        print(f"\ngenerating: {skill.display_name} ...")
        written, publishable = await _generate_and_write(skill)
        total_publishable += publishable
        total_written += written
        print(f"  wrote {written} draft rows ({publishable} active)")

    print(
        f"\ndone. {total_written} draft rows, {total_publishable} active "
        f"across {len(incomplete) + len(targets)} skill(s)."
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Generate Learning Ladder quiz content.")
    ap.add_argument("--limit", type=int, default=10, help="how many NEW skills to add (default 10)")
    ap.add_argument("--dry-run", action="store_true", help="show the plan only, generate nothing")
    ap.add_argument(
        "--skip-complete", action="store_true",
        help="skip the partial-ladder completion pass, top-up only",
    )
    args = ap.parse_args(argv)
    return asyncio.run(run(limit=args.limit, dry_run=args.dry_run, skip_complete=args.skip_complete))


if __name__ == "__main__":
    raise SystemExit(main())
