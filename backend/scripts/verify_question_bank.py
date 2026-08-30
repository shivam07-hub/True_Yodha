"""verify_question_bank.py — stamp `verified_at` on the bank, retire what fails.

Learning grill decision 5 (2026-08-30) moves the serving gate off `source_url`
and onto independent verification. Nothing has ever been verified — all 1,545
rows carry NULL `verified_at`, the 300 currently served included — so the gate
cannot flip until this has run.

Order matters and is not negotiable: **run this to completion, confirm the
count, and only then ship the gate change.** Flipping first takes /practice to
zero ladders, because every question would fail the new gate at once.

Reads are paged (1,545 rows is past PostgREST's silent 1,000-row cap). Writes
are chunked id-lists. Verification uses get_judgment_provider() — no cheap
models on a judgment path — at roughly one call per ten questions.

Usage (from backend/, with SUPABASE_* + provider keys in env):
    python -m scripts.verify_question_bank                    # dry run, full plan
    python -m scripts.verify_question_bank --limit 3          # dry run, 3 batches
    python -m scripts.verify_question_bank --limit 3 --apply  # write 3 batches
    python -m scripts.verify_question_bank --apply            # the real run
"""
from __future__ import annotations

import argparse
import asyncio
from collections import defaultdict
from datetime import datetime, timezone

from app.database import get_supabase_admin
from app.repositories.job_skills_read_model import fetch_all_rows
from app.services.learning_ladder_prompts import TargetSkill
from app.services.llm_provider import get_judgment_provider
from app.services.question_bank_verify import batches, malformed_ids, verify_batch

COLUMNS = "id, skill_id, level, question_text, options, correct_index, explanation"
WRITE_CHUNK = 100


def _load_bank(admin) -> list[dict]:
    return fetch_all_rows(
        admin,
        table="skill_questions",
        columns=COLUMNS,
        query_builder=lambda q: q.is_("retired_at", "null"),
    )


def _load_skills(admin, skill_ids: list[int]) -> dict[int, TargetSkill]:
    out: dict[int, TargetSkill] = {}
    for start in range(0, len(skill_ids), WRITE_CHUNK):
        chunk = skill_ids[start : start + WRITE_CHUNK]
        rows = (
            admin.table("skills")
            .select("id, display_name, taxonomy_key, l1_domain, l2_cluster")
            .in_("id", chunk)
            .execute()
        ).data or []
        for r in rows:
            sid = int(r["id"])
            out[sid] = TargetSkill(
                id=sid,
                display_name=(r.get("display_name") or r.get("taxonomy_key") or f"Skill {sid}"),
                l1_domain=r.get("l1_domain") or "",
                l2_cluster=r.get("l2_cluster") or "",
            )
    return out


def _stamp(admin, ids: list[int], *, verified: bool, reason: str | None = None) -> None:
    """Chunked so the id list never travels as one oversized filter."""
    now = datetime.now(timezone.utc).isoformat()
    patch = {"verified_at": now} if verified else {
        "retired_at": now,
        "retirement_reason": reason or "verify_failed",
    }
    for start in range(0, len(ids), WRITE_CHUNK):
        chunk = ids[start : start + WRITE_CHUNK]
        admin.table("skill_questions").update(patch).in_("id", chunk).execute()


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write; omit for a dry run")
    ap.add_argument("--limit", type=int, default=0, help="stop after N batches (0 = all)")
    args = ap.parse_args()

    admin = get_supabase_admin()
    bank = _load_bank(admin)
    print(f"bank: {len(bank)} non-retired questions")

    bad = malformed_ids(bank)
    usable = [r for r in bank if int(r["id"]) not in set(bad)]
    print(f"malformed (retire, no call spent): {len(bad)}")

    grouped: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for row in usable:
        grouped[(int(row["skill_id"]), int(row["level"]))].append(row)

    skills = _load_skills(admin, sorted({sid for sid, _ in grouped}))
    plan = [
        (sid, lvl, chunk)
        for (sid, lvl), rows in sorted(grouped.items())
        for chunk in batches(rows)
    ]
    if args.limit:
        plan = plan[: args.limit]
    print(f"batches to verify: {len(plan)} (~{sum(len(c) for _, _, c in plan)} questions)")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return

    if bad:
        _stamp(admin, bad, verified=False, reason="malformed")

    provider = get_judgment_provider()
    agreed_total = retired_total = inconclusive_total = 0
    for n, (sid, lvl, chunk) in enumerate(plan, 1):
        skill = skills.get(sid)
        if skill is None:
            print(f"  [{n}/{len(plan)}] skill {sid} missing from taxonomy — skipped")
            continue
        out = await verify_batch(provider, skill, lvl, chunk)
        if out.inconclusive:
            inconclusive_total += len(chunk)
            print(f"  [{n}/{len(plan)}] {skill.display_name} L{lvl}: inconclusive, untouched")
            continue
        if out.agreed_ids:
            _stamp(admin, out.agreed_ids, verified=True)
        if out.retired_ids:
            _stamp(admin, out.retired_ids, verified=False, reason="verifier_disagreed")
        agreed_total += len(out.agreed_ids)
        retired_total += len(out.retired_ids)
        print(
            f"  [{n}/{len(plan)}] {skill.display_name} L{lvl}: "
            f"{len(out.agreed_ids)} verified, {len(out.retired_ids)} retired"
        )

    print(
        f"\nverified {agreed_total} · retired {retired_total + len(bad)} · "
        f"inconclusive {inconclusive_total} (re-run to retry those)"
    )


if __name__ == "__main__":
    asyncio.run(main())
