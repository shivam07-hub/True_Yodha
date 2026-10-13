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
from datetime import datetime, timedelta, timezone
from typing import Any, NamedTuple


class Within(NamedTuple):
    """A rolling window on a timestamp column: inside the last `days` days, or —
    with `before=True` — older than that. Resolved when the count runs, never at
    import, so a long-lived process cannot freeze yesterday's window."""

    days: int
    before: bool = False


# (label, table, distinct-user column or None for row count, filter)
STEPS: list[tuple[str, str, str | None, dict[str, Any]]] = [
    # Myro's own accounts count for nothing — see services/test_accounts.py.
    # This step counts ROWS, so it filters on the column; every step below
    # counts distinct users and subtracts the marked ids instead.
    ("signed up", "user_profiles", None, {"is_test_account": False}),
    ("uploaded a CV", "cv_versions", "user_id", {}),
    ("confirmed skills", "user_skills", "user_id", {}),
    ("got a Myro Score", "mirror_scores", "user_id", {}),
    ("has a career target", "career_target_snapshots", "user_id", {}),
    ("has job matches", "user_job_matches", "user_id", {}),
    ("collected a role", "job_applications", "user_id", {}),
    ("tailored a CV for a job", "cv_versions", "user_id", {"job_id": "__not_null__"}),
    ("applied", "job_applications", "user_id", {"status": "applied"}),
    # The Apply step, by fact (2026-10-13 grill). Click → asked → answered →
    # applied-with-a-door. `apply_asked` and `applied` are core_loop_events
    # steps (migration 20261013120000); before that the 0 answers from 21
    # clicks could not say whether anyone ever saw the question.
    ("clicked Apply", "job_apply_intents", "user_id", {}),
    ("was asked 'did you apply?'", "core_loop_events", "user_id", {"step": "apply_asked"}),
    ("answered 'did you apply?'", "job_apply_intents", "user_id", {"answered_at": "__not_null__"}),
    ("applied, door recorded", "core_loop_events", "user_id", {"step": "applied"}),
    # Retention. `last_active_at` is copied from Supabase's session refreshes
    # once a day (migration 20261003100000) — before that it only ever held the
    # signup time. Rows, like "signed up", so the test-account filter applies.
    ("active in the last 7 days", "user_profiles", None,
     {"is_test_account": False, "last_active_at": Within(7)}),
    ("returning in the last 7 days", "user_profiles", None,
     {"is_test_account": False, "last_active_at": Within(7), "created_at": Within(7, before=True)}),
    ("answered a JD gap", "cv_dump_entries", "user_id", {"source": "jd_gap_answer"}),
    ("has a career story", "career_stories", "user_id", {}),
    ("passed a skill quiz", "quiz_attempts", "user_id", {"passed": True}),
    ("issued a skill certificate", "skill_certificates", "user_id", {}),
    ("certificate on a CV", "skill_certificates", "user_id", {"cv_promoted_at": "__not_null__"}),
    ("followed a company", "followed_companies", "user_id", {}),
    ("arrived via partner SSO", "partner_users", "user_id", {}),
]

# The spine, in order — the loop made countable, ending at the north star.
SPINE = [
    "signed up", "uploaded a CV", "got a Myro Score",
    "has job matches", "collected a role", "tailored a CV for a job", "applied",
]


_PAGE = 1000  # PostgREST's default ceiling — see feedback_postgrest_batch_ceilings


def _count(
    db: Any,
    table: str,
    user_col: str | None,
    filters: dict[str, Any],
    excluded: frozenset[str] = frozenset(),
) -> int:
    """Distinct users (or rows) — PAGED, and never Myro's own accounts.

    `excluded` is the Match Quality personas (`services/test_accounts.py`).
    They walk the real journey, so they appear in every table this counts —
    a persona would otherwise read as a model user with perfect funnel
    behaviour, in the one instrument built to tell us the opposite.

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
            elif isinstance(value, Within):
                cutoff = (datetime.now(timezone.utc) - timedelta(days=value.days)).isoformat()
                query = query.lt(column, cutoff) if value.before else query.gte(column, cutoff)
            else:
                query = query.eq(column, value)
        page = query.range(start, start + _PAGE - 1).execute().data or []
        rows_total += len(page)
        if user_col is not None:
            seen.update(str(r[user_col]) for r in page if r.get(user_col))
        if len(page) < _PAGE:
            break
        start += _PAGE
    if user_col is None:
        return rows_total
    return len(seen - excluded)


#: The judge's bar for a QUALIFIED application (CLAUDE.md north star).
QUALIFIED_SCORE = 3.5


def _tailored_qualified_applyouts(db: Any, excluded: frozenset[str]) -> tuple[int, int]:
    """The leading number beside the north star: (people, clicks) where an
    Apply click went out with a tailored CV for THAT job, on a job the judge
    rated >= 3.5. Needs nothing from the user — the north star itself stays
    their own Yes (2026-10-13). Small tables; joined here, not in SQL, so the
    instrument reads the same rows the product writes.
    """
    intents = [
        r for r in (db.table("job_apply_intents").select("user_id, job_id").execute().data or [])
        if str(r.get("user_id")) not in excluded
    ]
    job_ids = sorted({str(r["job_id"]) for r in intents})
    if not job_ids:
        return 0, 0
    tailored = {
        (str(r["user_id"]), str(r["job_id"]))
        for r in (db.table("cv_versions").select("user_id, job_id").in_("job_id", job_ids).execute().data or [])
    }
    qualified = {
        (str(r["user_id"]), str(r["job_id"]))
        for r in (
            db.table("user_job_matches").select("user_id, job_id")
            .in_("job_id", job_ids).gte("overall_score", QUALIFIED_SCORE).execute().data or []
        )
    }
    hits = [(str(r["user_id"]), str(r["job_id"])) for r in intents]
    hits = [h for h in hits if h in tailored and h in qualified]
    return len({u for u, _ in hits}), len(hits)


def main() -> int:
    from app.database import get_supabase_admin
    from app.services import test_accounts

    db = get_supabase_admin()
    excluded = test_accounts.excluded_user_ids(db)
    results: list[tuple[str, int]] = []
    for label, table, user_col, filters in STEPS:
        try:
            results.append((label, _count(db, table, user_col, filters, excluded)))
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

    people, clicks = _tailored_qualified_applyouts(db, excluded)
    print(
        f"\nLEADING NUMBER — Apply clicks with a tailored CV on a job rated >= {QUALIFIED_SCORE}:"
        f"\n  {people} people, {clicks} clicks"
        f"\n  (north star = their own Yes: 'applied' above)"
    )

    print(
        "\nReach is not usage-as-a-target: a new feature has zero on day one, and "
        "that is fine.\nA number that does not MOVE after a release is the signal — "
        "the release did not work.\nPaste into docs/FEATURE_LOOP_REGISTRY.md.\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
