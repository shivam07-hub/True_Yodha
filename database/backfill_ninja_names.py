"""
backfill_ninja_names.py
One-off: assign a ninja_name to every user_profiles row that doesn't have one.

Run AFTER migration 20260519_shareability_v1.sql.
Run BEFORE the tail block of that migration (ALTER COLUMN ninja_name SET NOT NULL).

Usage:
    source .venv/bin/activate
    PYTHONPATH=backend python database/backfill_ninja_names.py

Safe to re-run — only touches rows where ninja_name IS NULL.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "backend" / ".env"

# Make backend imports work.
sys.path.insert(0, str(ROOT / "backend"))
from app.services import ninja_name as nn  # noqa: E402


def _load_admin():
    load_dotenv(ENV_FILE)
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY missing in backend/.env")
        sys.exit(1)
    return create_client(url, key)


def main() -> None:
    admin = _load_admin()

    result = (
        admin.table("user_profiles")
        .select("id")
        .is_("ninja_name", "null")
        .execute()
    )
    targets = [r["id"] for r in (result.data or [])]
    print(f"{len(targets)} profiles need a ninja_name.")

    written = 0
    for user_id in targets:
        attempts = 0
        while attempts < 25:
            name = nn.generate()
            try:
                if not nn.is_available(name, admin=admin):
                    attempts += 1
                    continue
                admin.table("user_profiles").update({"ninja_name": name}).eq("id", user_id).execute()
                written += 1
                print(f"  {written}/{len(targets)} → {user_id[:8]} = {name}")
                break
            except Exception as exc:  # noqa: BLE001
                msg = str(exc).lower()
                if "duplicate" in msg or "unique" in msg:
                    attempts += 1
                    continue
                print(f"  ! failed for {user_id}: {type(exc).__name__}: {exc}")
                break
        time.sleep(0.02)

    print(f"\nDone — {written} ninja_name rows written.")


if __name__ == "__main__":
    main()
