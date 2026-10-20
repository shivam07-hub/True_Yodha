#!/usr/bin/env python3
"""Triage replay — the gate List Reading must pass before it reads real piles.

    cd backend && .venv/bin/python -m scripts.triage_replay --user <uuid> --user <uuid>
    cd backend && .venv/bin/python -m scripts.triage_replay --users 4 --max-jobs 500 --out /tmp/replay.json

ADR-0027 point 7. For each person, the jobs the full career-ops evaluation
already judged are the answer key. The replay reads them the way List Reading
will: freshest first (`jobs.last_verified_live_at`), in rounds of 50, one
triage call per round (`list_reading.triage_round`, the judgment lane). It then
asks two questions of the stored verdicts:

- **Recall** — of the jobs the evaluation scored 3.5 or more, how many did
  triage keep? The gate is 90%.
- **Spend** — how many full evaluations List Reading would have needed to fill
  a list of 40, against judging the whole pile (today) and against stopping at
  40 with no triage.

It writes nothing to the database. The only spend is the triage calls, one per
round: `--max-jobs` bounds it. Verdicts written under an older prompt or older
facts are still answers the evaluation gave; the report says how many of them
are current for the person's brief today.

Reads the same env as the app (SUPABASE_URL + SUPABASE_SERVICE_KEY + the
provider keys). One database, so this measures real production piles.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import asdict, dataclass, field
from typing import Any

GATE_RECALL = 0.90
LIST_FULL = 40
SHOW_FLOOR = 3.5
_IN_CHUNK = 100


@dataclass
class PersonReplay:
    user_id: str
    pile: int
    good: int
    current_verdicts: int
    rounds: int
    rounds_unread: int
    kept: int
    good_kept: int
    evals_today: int
    evals_stop_only: int
    evals_list_reading: int
    list_reading_reached_40: bool
    missed_good_titles: list[str] = field(default_factory=list)

    @property
    def recall(self) -> float | None:
        return self.good_kept / self.good if self.good else None


def _real_users_with_piles(db: Any, limit: int) -> list[str]:
    """Real accounts (own accounts excluded) with the largest judged piles."""
    tests = {
        str(r["id"]) for r in (
            db.table("user_profiles").select("id").eq("is_test_account", True).execute().data or []
        )
    }
    counts: dict[str, int] = {}
    page, size = 0, 1000
    while True:
        rows = (
            db.table("user_job_matches").select("user_id")
            .not_.is_("overall_score", "null")
            .range(page * size, page * size + size - 1).execute().data or []
        )
        for r in rows:
            uid = str(r["user_id"])
            if uid not in tests:
                counts[uid] = counts.get(uid, 0) + 1
        if len(rows) < size:
            break
        page += 1
    return [uid for uid, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:limit]]


def _verdicts(db: Any, user_id: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    page, size = 0, 1000
    while True:
        rows = (
            db.table("user_job_matches")
            .select("job_id, overall_score, eval_context_hash")
            .eq("user_id", user_id).not_.is_("overall_score", "null")
            .range(page * size, page * size + size - 1).execute().data or []
        )
        out.extend(rows)
        if len(rows) < size:
            break
        page += 1
    return out


def _jobs(db: Any, job_ids: list[str]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for i in range(0, len(job_ids), _IN_CHUNK):
        chunk = job_ids[i:i + _IN_CHUNK]
        rows = (
            db.table("jobs")
            .select("job_id, job_title, company_name, location, job_description, last_verified_live_at")
            .in_("job_id", chunk).execute().data or []
        )
        for r in rows:
            out[str(r["job_id"])] = r
    return out


def _until_full(order: list[str], good: set[str]) -> int:
    """Evaluations spent reading `order` until LIST_FULL good jobs are found."""
    found = 0
    for spent, job_id in enumerate(order, start=1):
        found += job_id in good
        if found >= LIST_FULL:
            return spent
    return len(order)


async def replay_person(
    db: Any, provider: Any, user_id: str, *, max_jobs: int, keep: int, current_only: bool = False,
) -> PersonReplay:
    from app.repositories.jobs import JobsRepository
    from app.services import onboarding_service
    from app.services.matching import list_reading, targeting

    repo = JobsRepository(db, db)
    profile = targeting.for_ranking(repo, user_id).ranking_profile()
    profile["baseline_version_id"] = repo.get_latest_baseline_id(user_id)
    eval_ctx = onboarding_service.eval_context_key(profile)

    verdicts = {str(v["job_id"]): v for v in _verdicts(db, user_id)}
    if current_only:
        # Only answers the evaluation gave for the brief this person has today:
        # the triage reads that brief, so an older verdict is a different question.
        verdicts = {jid: v for jid, v in verdicts.items() if v.get("eval_context_hash") == eval_ctx}
    metas = _jobs(db, list(verdicts))
    # Freshest first, the order a round reads in. A judged job whose listing row
    # is gone cannot be read again, so it leaves the answer key too.
    order = sorted(
        (jid for jid in verdicts if jid in metas),
        key=lambda jid: (metas[jid].get("last_verified_live_at") or "", jid),
        reverse=True,
    )[:max_jobs]
    good = {jid for jid in order if float(verdicts[jid]["overall_score"]) >= SHOW_FLOOR}
    current = sum(1 for jid in order if verdicts[jid].get("eval_context_hash") == eval_ctx)

    rounds = [order[i:i + list_reading.ROUND_SIZE] for i in range(0, len(order), list_reading.ROUND_SIZE)]
    sem = asyncio.Semaphore(3)

    async def read(ids: list[str]) -> list[str] | None:
        jobs = [
            {
                "job_id": jid,
                "title": metas[jid].get("job_title") or "",
                "company": metas[jid].get("company_name"),
                "location": metas[jid].get("location"),
                "description": (metas[jid].get("job_description") or "")[:800],
            }
            for jid in ids
        ]
        async with sem:
            return await list_reading.triage_round(profile, jobs, provider, keep_n=keep)

    results = await asyncio.gather(*(read(ids) for ids in rounds))
    kept_order: list[str] = []
    unread = 0
    for result in results:
        if result is None:
            unread += 1
            continue
        kept_order.extend(result)
    kept = set(kept_order)

    return PersonReplay(
        user_id=user_id,
        pile=len(order),
        good=len(good),
        current_verdicts=current,
        rounds=len(rounds),
        rounds_unread=unread,
        kept=len(kept),
        good_kept=len(good & kept),
        evals_today=len(order),
        evals_stop_only=_until_full(order, good),
        evals_list_reading=_until_full(kept_order, good),
        list_reading_reached_40=len(good & kept) >= LIST_FULL,
        missed_good_titles=[
            str(metas[jid].get("job_title") or jid) for jid in order if jid in good and jid not in kept
        ][:8],
    )


def _report(people: list[PersonReplay]) -> dict[str, Any]:
    good = sum(p.good for p in people)
    good_kept = sum(p.good_kept for p in people)
    recall = good_kept / good if good else None
    return {
        "people": len(people),
        "pile": sum(p.pile for p in people),
        "good": good,
        "good_kept": good_kept,
        "recall": recall,
        "gate_recall": GATE_RECALL,
        "passes_gate": recall is not None and recall >= GATE_RECALL,
        "triage_calls": sum(p.rounds for p in people),
        "rounds_unread": sum(p.rounds_unread for p in people),
        "evals_today": sum(p.evals_today for p in people),
        "evals_stop_only": sum(p.evals_stop_only for p in people),
        "evals_list_reading": sum(p.evals_list_reading for p in people),
        "per_person": [{**asdict(p), "recall": p.recall} for p in people],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--user", action="append", default=[], help="user_profiles.id (repeatable)")
    parser.add_argument("--users", type=int, default=0, help="also take the N real accounts with the largest piles")
    parser.add_argument("--max-jobs", type=int, default=500, help="freshest judged jobs per person (bounds the spend)")
    parser.add_argument("--keep", type=int, default=None, help="most jobs a round keeps (default: list_reading.KEEP_PER_ROUND)")
    parser.add_argument("--out", default="", help="write the full report as JSON here")
    parser.add_argument("--current-only", action="store_true", help="answer key = verdicts current for today's brief")
    args = parser.parse_args()

    from app.database import get_supabase_admin_batch
    from app.services.llm_provider import get_judgment_provider
    from app.services.matching import list_reading

    db = get_supabase_admin_batch()
    user_ids = list(dict.fromkeys(args.user + (_real_users_with_piles(db, args.users) if args.users else [])))
    if not user_ids:
        parser.error("name at least one --user or pass --users N")
    keep = args.keep or list_reading.KEEP_PER_ROUND
    provider = get_judgment_provider()

    people = [
        asyncio.run(replay_person(db, provider, uid, max_jobs=args.max_jobs, keep=keep, current_only=args.current_only))
        for uid in user_ids
    ]
    report = _report(people)
    report["keep_per_round"] = keep
    report["max_jobs"] = args.max_jobs
    report["current_only"] = args.current_only

    for p in people:
        recall = f"{p.recall:.0%}" if p.recall is not None else "n/a"
        print(
            f"{p.user_id[:8]}  pile {p.pile:>4}  good {p.good:>4}  kept {p.kept:>4}  "
            f"recall {recall:>4}  evals today {p.evals_today:>4} · stop-only {p.evals_stop_only:>4} · "
            f"list reading {p.evals_list_reading:>4}  unread rounds {p.rounds_unread}  current verdicts {p.current_verdicts}"
        )
    recall = report["recall"]
    print(
        f"\nRECALL {recall:.1%} (gate {GATE_RECALL:.0%}) — {'PASSES' if report['passes_gate'] else 'FAILS'}"
        if recall is not None else "\nRECALL n/a — no job in these piles cleared 3.5"
    )
    print(
        f"evaluations: today {report['evals_today']} · stop at 40 only {report['evals_stop_only']} · "
        f"list reading {report['evals_list_reading']} (+{report['triage_calls']} triage calls)"
    )
    if args.out:
        with open(args.out, "w") as fh:
            json.dump(report, fh, indent=2, default=str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
