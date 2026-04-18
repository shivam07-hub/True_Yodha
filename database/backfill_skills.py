"""
backfill_skills.py
Bulk-loads all 35,108 Lightcast skills into the Supabase `skills` table.

Run from the project root (not backend/):
    source .venv/bin/activate
    python database/backfill_skills.py

Reads backend/.env for SUPABASE_URL + SUPABASE_SERVICE_KEY.
Uses the service key (bypasses RLS).
Safe to re-run — uses upsert on taxonomy_key.
"""

import json
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_FILE = ROOT / "lightcast_skills_taxonomy.json"
ENV_FILE = ROOT / "backend" / ".env"

BATCH_SIZE = 500   # Supabase REST handles 500-row upserts comfortably


def load_env() -> tuple[str, str]:
    load_dotenv(ENV_FILE)
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY missing in backend/.env")
        sys.exit(1)
    return url, key


def walk_taxonomy(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    rows: list[dict] = []

    def _walk(node: dict, category: str | None = None, subcategory: str | None = None) -> None:
        if node.get("id"):
            rows.append({
                "taxonomy_key": node["name"],
                "display_name": node["name"],
                "lightcast_id": node["id"],
                "category":     category or "General",
                "subcategory":  subcategory or "General",
                "is_active":    True,
            })
        for child in node.get("children", []):
            if category is None:
                _walk(child, child["name"])
            elif subcategory is None:
                _walk(child, category, child["name"])
            else:
                _walk(child, category, subcategory)

    _walk(data)
    return rows


def upsert_batches(db, rows: list[dict]) -> None:
    total = len(rows)
    inserted = 0
    errors = 0

    for i in range(0, total, BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        try:
            db.table("skills").upsert(
                batch,
                on_conflict="taxonomy_key",
            ).execute()
            inserted += len(batch)
            print(f"  {inserted}/{total} upserted…", end="\r")
        except Exception as exc:
            errors += 1
            print(f"\nBatch {i//BATCH_SIZE} failed: {exc}")
        time.sleep(0.05)   # gentle rate-limit

    print(f"\nDone. {inserted} upserted, {errors} batch errors.")


def main() -> None:
    print("Loading taxonomy…")
    rows = walk_taxonomy(TAXONOMY_FILE)
    print(f"  {len(rows)} skills found in taxonomy JSON")

    print("Connecting to Supabase…")
    url, key = load_env()
    db = create_client(url, key)

    print(f"Upserting in batches of {BATCH_SIZE}…")
    upsert_batches(db, rows)


if __name__ == "__main__":
    main()
