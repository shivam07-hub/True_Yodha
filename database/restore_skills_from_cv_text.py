"""
restore_skills_from_cv_text.py
Rebuild user_skills + Mirror Score from stored user_profiles.cv_raw_text.

This script is intentionally a thin wrapper around the canonical scoring entry
point: app.services.scoring.compute_and_persist_score.

Run from project root:
    source .venv/bin/activate
    python database/restore_skills_from_cv_text.py

Optional:
    python database/restore_skills_from_cv_text.py --user-id <uuid>
    python database/restore_skills_from_cv_text.py --limit 10
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
ENV_FILE = BACKEND_DIR / ".env"
PAGE_SIZE = 200

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.repositories.scores import ScoresRepository  # noqa: E402
from app.services import cv_parser  # noqa: E402
from app.services.scoring import compute_and_persist_score, fetch_aspiration_skills  # noqa: E402


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Restore user skills from cv_raw_text and recompute score.")
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
            .select("id,target_roles,cv_raw_text")
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
            .select("id,target_roles,cv_raw_text")
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
    return [row for row in rows if (row.get("cv_raw_text") or "").strip()]


def _normalise_roles(raw_roles: Any) -> list[str]:
    if not isinstance(raw_roles, list):
        return []
    return [str(role).strip() for role in raw_roles if str(role).strip()]


async def _process_profile(repo: ScoresRepository, profile: dict[str, Any]) -> tuple[str, str]:
    user_id = profile["id"]
    cv_raw_text = (profile.get("cv_raw_text") or "").strip()
    if len(cv_raw_text) < 80:
        return "skip", f"{user_id}: cv_raw_text too short"

    parsed = await cv_parser.parse_cv_text(cv_raw_text)
    skills_detected = parsed.get("skills_detected") or []
    if not skills_detected:
        return "skip", f"{user_id}: no skills extracted from cv_raw_text"

    target_roles = _normalise_roles(profile.get("target_roles"))
    aspiration_skills = fetch_aspiration_skills(repo, target_roles)

    score_row = compute_and_persist_score(
        repo,
        user_id,
        skills_detected=skills_detected,
        aspiration_skills=aspiration_skills or None,
        include_market_signals=False,
        require_skills_assessed=True,
    )
    return (
        "ok",
        f"{user_id}: total_score={score_row.get('total_score')} "
        f"skills_assessed={score_row.get('skills_assessed')}",
    )


async def _run() -> None:
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
        try:
            status, message = await _process_profile(repo, profile)
            if status == "ok":
                processed += 1
                print(f"[ok]   {message}")
            else:
                skipped += 1
                print(f"[skip] {message}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"[err]  {profile.get('id')}: {exc}")

    print(
        "\nDone. "
        f"processed={processed} skipped={skipped} failed={failed} "
        f"scanned={len(profiles)}"
    )


if __name__ == "__main__":
    asyncio.run(_run())
