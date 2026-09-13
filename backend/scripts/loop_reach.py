#!/usr/bin/env python3
"""Loop reach — how many real people went round each loop.

The companion to `npm run check:reach`. That gate answers "can a user get to
this?" from the code alone and fails the build when the answer is no. This one
answers "did anyone?" and never fails anything — it prints, because a new
feature legitimately has zero users on day one and a gate that punished that
would block every launch.

Use it when you touch a loop, and paste the output into
docs/FEATURE_LOOP_REGISTRY.md. v1.0 of that registry carried no numbers, which
is exactly why it could drift for four months describing a product we no longer
ran.

    python backend/scripts/loop_reach.py            # the table
    python backend/scripts/loop_reach.py --markdown # paste-ready for the registry

Reads the same env as the app (SUPABASE_URL + SUPABASE_SERVICE_KEY). Counts come
from ONE database — dev and prod share it (INFRA.md), so these are real people.
"""
from __future__ import annotations

import sys
from typing import Any

# (label, table, distinct-user column or None for row count, filter)
STEPS: list[tuple[str, str, str | None, dict[str, Any]]] = [
    ("signed up", "user_profiles", None, {}),
    ("uploaded a CV", "cv_versions", "user_id", {}),
    ("confirmed skills", "user_skills", "user_id", {}),
    ("got a Myro Score", "mirror_scores", "user_id", {}),
    ("has a career target", "career_target_snapshots", "user_id", {}),
    ("has job matches", "user_job_matches", "user_id", {}),
    ("collected a role", "job_applications", "user_id", {}),
    ("answered a JD gap", "cv_dump_entries", "user_id", {"source": "jd_gap_answer"}),
    ("has a career story", "career_stories", "user_id", {}),
    ("passed a skill quiz", "quiz_attempts", "user_id", {"passed": True}),
    ("issued a skill certificate", "skill_certificates", "user_id", {}),
    ("certificate on a CV", "skill_certificates", "user_id", {"cv_promoted_at": "__not_null__"}),
    ("followed a company", "followed_companies", "user_id", {}),
    ("arrived via partner SSO", "partner_users", "user_id", {}),
]

# The spine, in order — the four-step goal made countable.
SPINE = [
    "signed up", "uploaded a CV", "got a Myro Score",
    "has job matches", "collected a role",
]


_PAGE = 1000  # PostgREST's default ceiling — see feedback_postgrest_batch_ceilings


def _count(db: Any, table: str, user_col: str | None, filters: dict[str, Any]) -> int:
    """Distinct users (or rows) — PAGED.

    A plain `.select(...).execute()` stops at PostgREST's 1000-row ceiling and
    returns silently. Counting distinct users over that truncated page gave
    "confirmed skills: 71" against a true 389 (user_skills holds 5,568 rows) —
    an instrument built to report truth, quietly reporting a third of it. Page
    until a short page proves the end.
    """
    seen: set[str] = set()
    rows_total = 0
    start = 0
    while True:
        query = db.table(table).select(user_col or "id")
        for column, value in filters.items():
            if value == "__not_null__":
                query = query.not_.is_(column, "null")
            else:
                query = query.eq(column, value)
        page = query.range(start, start + _PAGE - 1).execute().data or []
        rows_total += len(page)
        if user_col is not None:
            seen.update(str(r[user_col]) for r in page if r.get(user_col))
        if len(page) < _PAGE:
            break
        start += _PAGE
    return rows_total if user_col is None else len(seen)


def main() -> int:
    from app.database import get_supabase_admin

    db = get_supabase_admin()
    results: list[tuple[str, int]] = []
    for label, table, user_col, filters in STEPS:
        try:
            results.append((label, _count(db, table, user_col, filters)))
        except Exception as exc:  # noqa: BLE001 — a missing table must not hide the rest
            print(f"  ! {label}: could not read {table} ({exc.__class__.__name__})", file=sys.stderr)

    by_label = dict(results)
    markdown = "--markdown" in sys.argv

    if markdown:
        print("| step | users |\n|---|---|")
        for label, n in results:
            print(f"| {label} | {n} |")
    else:
        width = max(len(label) for label, _ in results)
        print("\nLOOP REACH — how many people actually got here\n")
        for label, n in results:
            print(f"  {label:<{width}}  {n:>6}")

    # The spine's drop is the number that matters most; show it either way.
    print("\nTHE SPINE (drop at each step):")
    prev = None
    for label in SPINE:
        n = by_label.get(label)
        if n is None:
            continue
        pct = "" if prev in (None, 0) else f"   {round(100 * n / prev)}%"
        print(f"  {label:<22} {n:>6}{pct}")
        prev = n

    print(
        "\nReach is not usage-as-a-target: a new feature has zero on day one, and "
        "that is fine.\nA number that does not MOVE after a release is the signal — "
        "the release did not work.\nPaste into docs/FEATURE_LOOP_REGISTRY.md.\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
