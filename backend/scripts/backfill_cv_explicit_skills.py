"""Reconcile literal CV skills that older model-only extraction missed.

The operation is additive: it writes baseline-scoped review candidates and
never changes canonical ``user_skills``. Affected baselines become pending so
the owner must confirm before scoring or matching can use the repaired set.
Dry-run is the default because Myro shares one Supabase database across dev and
production.

Usage:
    PYTHONPATH=backend python -m scripts.backfill_cv_explicit_skills
    PYTHONPATH=backend python -m scripts.backfill_cv_explicit_skills --apply
    PYTHONPATH=backend python -m scripts.backfill_cv_explicit_skills --user-id UUID
"""

from __future__ import annotations

import argparse
from collections import Counter
from typing import Any

from app.database import get_supabase_admin
from app.services.cv_explicit_skills import extract_explicit_skills

_PAGE_SIZE = 1000


def _latest_baselines(db: Any, user_id: str | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        query = (
            db.table("cv_versions")
            .select("id,user_id,body_text,created_at")
            .eq("kind", "baseline_upload")
            .order("created_at", desc=True)
        )
        if user_id:
            query = query.eq("user_id", user_id)
        page = query.range(offset, offset + _PAGE_SIZE - 1).execute().data or []
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE

    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        owner = str(row.get("user_id") or "")
        if owner and owner not in latest:
            latest[owner] = row
    return list(latest.values())


def _existing_signals(
    db: Any, user_ids: list[str]
) -> tuple[dict[str, set[str]], dict[str, list[dict[str, Any]]]]:
    known: dict[str, set[str]] = {user_id: set() for user_id in user_ids}
    cv_signals: dict[str, list[dict[str, Any]]] = {user_id: [] for user_id in user_ids}
    signal_by_level = {1: "mention", 2: "project", 3: "impact", 4: "leadership", 5: "leadership"}
    for start in range(0, len(user_ids), 100):
        chunk = user_ids[start : start + 100]
        rows = (
            db.table("user_skills")
            .select("user_id,source,matched_level,evidence_text,skills(taxonomy_key)")
            .in_("user_id", chunk)
            .execute()
            .data
            or []
        )
        for row in rows:
            skill = row.get("skills") or {}
            key = str(skill.get("taxonomy_key") or "")
            owner = str(row.get("user_id") or "")
            if owner and key:
                known.setdefault(owner, set()).add(key)
                if row.get("source") in {"cv", "user_override"}:
                    level = int(row.get("matched_level") or 1)
                    cv_signals.setdefault(owner, []).append(
                        {
                            "taxonomy_key": key,
                            "xp_awarded": {1: 50, 2: 150, 3: 350, 4: 500, 5: 500}.get(level, 50),
                            "signal_type": signal_by_level.get(level, "mention"),
                            "evidence": str(row.get("evidence_text") or ""),
                            "origin": "legacy_confirmed",
                        }
                    )
    return known, cv_signals


def _plan(
    db: Any, baselines: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    known, cv_signals = _existing_signals(
        db, [str(row["user_id"]) for row in baselines]
    )
    planned: list[dict[str, Any]] = []
    for baseline in baselines:
        user_id = str(baseline["user_id"])
        existing_keys = known.get(user_id, set())
        for signal in extract_explicit_skills(str(baseline.get("body_text") or "")):
            if signal["taxonomy_key"] in existing_keys:
                continue
            planned.append(
                {"user_id": user_id, "baseline_id": int(baseline["id"]), "signal": signal}
            )
    return planned, cv_signals


def _apply(
    db: Any,
    planned: list[dict[str, Any]],
    cv_signals: dict[str, list[dict[str, Any]]],
) -> int:
    by_baseline: dict[int, dict[str, Any]] = {}
    for item in planned:
        baseline_id = int(item["baseline_id"])
        group = by_baseline.setdefault(
            baseline_id,
            {
                "user_id": item["user_id"],
                "signals": {
                    signal["taxonomy_key"]: signal
                    for signal in cv_signals.get(item["user_id"], [])
                },
            },
        )
        group["signals"][item["signal"]["taxonomy_key"]] = item["signal"]

    for baseline_id, group in by_baseline.items():
        signal_map = group["signals"]
        candidates = sorted(
            signal_map.values(),
            key=lambda signal: (-int(signal.get("xp_awarded") or 0), signal["taxonomy_key"]),
        )
        (
            db.table("cv_versions")
            .update({"skills_detected": candidates, "skills_confirmed_at": None})
            .eq("id", baseline_id)
            .eq("kind", "baseline_upload")
            .execute()
        )
        db.table("user_notifications").upsert(
            {
                "user_id": group["user_id"],
                "kind": "skill_review",
                "source_id": str(baseline_id),
                "state": "ready",
                "title": "Review the skills Myro found",
                "body": "We repaired your CV skill scan. Confirm it before Myro refreshes your score and matches.",
                "action_url": "/onboarding/result",
                "match_count": 1,
                "read_at": None,
            },
            on_conflict="user_id,kind,source_id",
        ).execute()
    return len(by_baseline)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="queue repaired baselines for review")
    parser.add_argument("--user-id", help="limit audit/backfill to one user")
    args = parser.parse_args()

    db = get_supabase_admin()
    baselines = _latest_baselines(db, args.user_id)
    planned, cv_signals = _plan(db, baselines)
    histogram = Counter(item["signal"]["taxonomy_key"] for item in planned)

    print(
        f"mode={'APPLY' if args.apply else 'DRY-RUN'} "
        f"latest_baselines={len(baselines)} missing_skill_rows={len(planned)}"
    )
    for skill, count in histogram.most_common(20):
        print(f"  {skill}: {count}")

    if args.apply:
        queued = _apply(db, planned, cv_signals)
        print(
            f"APPLIED candidate_rows={len(planned)} "
            f"baselines_queued_for_review={queued}; published_user_skill_rows=0"
        )
    else:
        print("DRY-RUN; no rows written")


if __name__ == "__main__":
    main()
