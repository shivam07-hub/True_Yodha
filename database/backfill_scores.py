"""
backfill_scores.py
Recompute Mirror Scores for existing users from persisted user_skills.

This script is intentionally a thin wrapper around the canonical scoring entry
point: app.services.scoring.compute_and_persist_score.

Run from project root:
    source .venv/bin/activate
    python database/backfill_scores.py

Optional:
    python database/backfill_scores.py --user-id <uuid>
    python database/backfill_scores.py --limit 25
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
ENV_FILE = BACKEND_DIR / ".env"
PAGE_SIZE = 500

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.repositories.scores import ScoresRepository  # noqa: E402
from app.services.scoring import compute_and_persist_score, fetch_aspiration_skills  # noqa: E402


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Recompute Mirror Scores from user_skills.")
    parser.add_argument("--user-id", help="Process one user only.")
    parser.add_argument("--limit", type=int, default=0, help="Max users to process (0 = no limit).")
    return parser.parse_args()


def _get_admin_client() -> Client:
    load_dotenv(ENV_FILE)
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env")
    return create_client(url, key)


def _iter_profiles(db: Client, user_id: str | None) -> list[dict[str, Any]]:
    if user_id:
        result = (
            db.table("user_profiles")
            .select("id,target_roles")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if not result or not result.data:
            return []
        return [result.data]

    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        batch = (
            db.table("user_profiles")
            .select("id,target_roles")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def _normalise_roles(raw_roles: Any) -> list[str]:
    if not isinstance(raw_roles, list):
        return []
    return [str(role).strip() for role in raw_roles if str(role).strip()]


def main() -> None:
    args = _parse_args()
    db = _get_admin_client()
    repo = ScoresRepository(db)

    profiles = _iter_profiles(db, args.user_id)
    if not profiles:
        print("No matching users found.")
        return

    processed = 0
    skipped = 0
    failed = 0

    for profile in profiles:
        if args.limit and processed >= args.limit:
            break

        user_id = profile["id"]
        skill_level_map = repo.get_user_skill_level_map(user_id)
        if not skill_level_map:
            skipped += 1
            print(f"[skip] {user_id}: no user_skills rows")
            continue

        target_roles = _normalise_roles(profile.get("target_roles"))
        aspiration_skills = fetch_aspiration_skills(repo, target_roles)

        try:
            score_row = compute_and_persist_score(
                repo,
                user_id,
                aspiration_skills=aspiration_skills or None,
                skill_level_map=skill_level_map,
            )
            processed += 1
            print(
                f"[ok]   {user_id}: total_score={score_row.get('total_score')} "
                f"skills_assessed={score_row.get('skills_assessed')}"
            )
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"[err]  {user_id}: {exc}")

    print(
        "\nDone. "
        f"processed={processed} skipped={skipped} failed={failed} "
        f"scanned={len(profiles)}"
    )


if __name__ == "__main__":
    main()
