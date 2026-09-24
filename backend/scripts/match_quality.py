#!/usr/bin/env python3
"""Match Quality — the gate that asks whether a person can reach their jobs.

    python backend/scripts/match_quality.py --user <uuid> --years 3.2
    python backend/scripts/match_quality.py --user <uuid> --years 3.2 --json
    python backend/scripts/match_quality.py --user <uuid> --years 3.2 \
        --keywords payment,reconciliation,backend
    python backend/scripts/match_quality.py --user <uuid> --years 3.2 --via rpc

`--via` picks WHICH retrieval is being judged. `feed` is what /market serves
today; `rpc` is `candidates_for_user`, which replaces it. Both are measured
against the same yardstick so the swap is a number, not an opinion. The flag
goes away with the feed it names.

`--years` is required and stated by you: nothing in an account holds
professional years in the craft, and the CV's date span is a fiction for anyone
with a career gap (see quality/profile.py).

Exits 1 only on a REGRESSION against `quality/thresholds.json`. A profile with
no earned threshold prints and exits 0 — the first run of a new persona is a
baseline, not a failure.

Reads the same env as the app (SUPABASE_URL + SUPABASE_SERVICE_KEY). One
database, so this measures real production behaviour.
"""
from __future__ import annotations

import argparse
import json
import sys

from quality import gate, profile as profile_mod
from quality.reference_matcher import fetch_corpus, shortlist


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user", required=True, help="user_profiles.id to audit")
    parser.add_argument("--years", required=True, type=float, help="professional years in the craft")
    parser.add_argument("--keywords", default="", help="comma-separated title words a human would recognise")
    parser.add_argument("--limit", type=int, default=40, help="shortlist size (the product's cap)")
    parser.add_argument("--via", choices=("feed", "rpc"), default="feed",
                       help="which retrieval to judge: today's /market feed, or candidates_for_user")
    parser.add_argument("--json", action="store_true", help="machine-readable result")
    args = parser.parse_args()

    # The BATCH client, not the web one: this reads the whole corpus in pages
    # and the 8s web timeout is sized for a request a user waits on. The same
    # confusion is what made a Direction-save Match Run look finished (1fead4de).
    from app.database import get_supabase_admin_batch
    from app.repositories.jobs import JobsRepository

    db = get_supabase_admin_batch()
    repo = JobsRepository(db, db)

    person = profile_mod.from_account(db, args.user, years_experience=args.years)
    if args.keywords:
        words = tuple(w.strip() for w in args.keywords.split(",") if w.strip())
        person = profile_mod.CandidateProfile(
            label=person.label,
            skill_names=person.skill_names,
            years_experience=person.years_experience,
            direction_families=person.direction_families,
            role_keywords=words,
            countries=person.countries,
            notes=person.notes,
        )

    corpus = fetch_corpus(db, countries=person.countries)
    reference = shortlist(person, corpus, limit=args.limit)

    admissible: set[str] | None = None
    if args.via == "rpc":
        production, admissible = gate.retrieval_candidates(db, args.user, args.limit)
    else:
        profile_row = (
            db.table("user_profiles")
            .select("target_role_titles, target_career_band, explored_career_bands, target_seniority")
            .eq("id", args.user)
            .limit(1)
            .execute()
        ).data or [{}]
        production = gate.production_visible(repo, args.user, profile_row[0])

    # Both sides judged from the same raw listings — the feed returns shaped
    # cards that carry neither role_family nor main_skills, and the RPC returns
    # only a job_id and a score.
    corpus_by_id = {str(job.get("job_id")): job for job in corpus if job.get("job_id")}
    result = gate.evaluate(person, reference, production, corpus_by_id, admissible, args.via)
    failures = gate.check(result, gate.load_thresholds())

    if args.json:
        print(json.dumps({**result.as_dict(), "via": args.via, "failures": failures}, indent=2))
    else:
        _print_report(person, corpus, result, failures)

    return 1 if failures else 0


def _print_report(person, corpus, result: gate.GateResult, failures: list[str]) -> None:
    print(f"\n  {result.label} — {person.years_experience:g} yrs, "
          f"{len(person.skill_names)} hard skills")
    print(f"  directions: {', '.join(sorted(person.direction_families)) or '(none)'}")
    print(f"  corpus: {len(corpus):,} live applyable listings\n")
    print(f"  the yardstick would shortlist   {result.reference_size}")
    print(f"  production shows                {result.production_size}")
    print(f"  of the yardstick, admissible    {result.admitted}  "
          f"({result.admissible_recall:.0%}) — reachable at all")
    print(f"  of the yardstick, shown         {result.reached}  "
          f"({result.recall:.0%}) — made the list")
    print(f"  of what production shows, wrong {len(result.violations)}  "
          f"({result.violation_rate:.0%})\n")

    for line in result.violations[:5]:
        print(f"    shown but wrong · {line}")
    for line in result.unreachable_examples[:5]:
        print(f"    unreachable     · {line}")
    if len(result.unreachable_examples) > 5:
        print(f"    … and {len(result.unreachable_examples) - 5} more unreachable")
    outranked = len(result.missed_examples) - len(result.unreachable_examples)
    if outranked > 0:
        print(f"    {outranked} more admissible but outranked — a ranking fault, not a reach one")

    print()
    for line in failures:
        print(f"  REGRESSION: {line}")
    if not failures:
        print("  no regression against the earned thresholds")


if __name__ == "__main__":
    sys.exit(main())
