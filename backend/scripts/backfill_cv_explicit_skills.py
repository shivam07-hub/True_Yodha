"""Reconcile literal CV skills that older model-only extraction missed.

The operation is additive: it never removes a user skill and never overwrites a
stronger existing signal. Dry-run is the default because Myro shares one
Supabase database across dev and production.

Usage:
    PYTHONPATH=backend python -m scripts.backfill_cv_explicit_skills
    PYTHONPATH=backend python -m scripts.backfill_cv_explicit_skills --apply
    PYTHONPATH=backend python -m scripts.backfill_cv_explicit_skills --user-id UUID
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from app.database import get_supabase_admin
from app.services.cv_explicit_skills import extract_explicit_skills
from app.services.scoring.formulas import _PROFICIENCY_TITLES
from app.services.taxonomy_loader import ensure_skill_in_db

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


def _existing_keys(db: Any, user_ids: list[str]) -> dict[str, set[str]]:
    found: dict[str, set[str]] = {user_id: set() for user_id in user_ids}
    for start in range(0, len(user_ids), 100):
        chunk = user_ids[start : start + 100]
        rows = (
            db.table("user_skills")
            .select("user_id,skills(taxonomy_key)")
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
                found.setdefault(owner, set()).add(key)
    return found


def _plan(db: Any, baselines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    existing = _existing_keys(db, [str(row["user_id"]) for row in baselines])
    planned: list[dict[str, Any]] = []
    for baseline in baselines:
        user_id = str(baseline["user_id"])
        known = existing.get(user_id, set())
        for signal in extract_explicit_skills(str(baseline.get("body_text") or "")):
            if signal["taxonomy_key"] in known:
                continue
            planned.append({"user_id": user_id, "signal": signal})
    return planned


def _apply(db: Any, planned: list[dict[str, Any]]) -> int:
    now = datetime.now(timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []
    for item in planned:
        signal = item["signal"]
        skill_id = ensure_skill_in_db(db, signal["taxonomy_key"])
        if skill_id is None:
            continue
        rows.append(
            {
                "user_id": item["user_id"],
                "skill_id": skill_id,
                "matched_level": 1,
                "proficiency_title": _PROFICIENCY_TITLES[1],
                "source": "cv",
                "evidence_text": signal["evidence"],
                "last_updated": now,
            }
        )
    for start in range(0, len(rows), 500):
        db.table("user_skills").upsert(
            rows[start : start + 500], on_conflict="user_id,skill_id"
        ).execute()
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write additive rows")
    parser.add_argument("--user-id", help="limit audit/backfill to one user")
    args = parser.parse_args()

    db = get_supabase_admin()
    baselines = _latest_baselines(db, args.user_id)
    planned = _plan(db, baselines)
    histogram = Counter(item["signal"]["taxonomy_key"] for item in planned)

    print(
        f"mode={'APPLY' if args.apply else 'DRY-RUN'} "
        f"latest_baselines={len(baselines)} missing_skill_rows={len(planned)}"
    )
    for skill, count in histogram.most_common(20):
        print(f"  {skill}: {count}")

    if args.apply:
        written = _apply(db, planned)
        print(f"APPLIED additive_rows={written}; removals=0")
    else:
        print("DRY-RUN; no rows written")


if __name__ == "__main__":
    main()
