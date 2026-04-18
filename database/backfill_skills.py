"""
backfill_skills.py
Populates the skills table from the Lightcast taxonomy JSON.

Single-table structure (post-flatten migration):
  skills: one row per L3 skill with l1_domain + l2_cluster denormalized on each row

Run from project root:
    source .venv/bin/activate
    python database/backfill_skills.py

Safe to re-run — all operations are upserts.
"""

import json
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

ROOT          = Path(__file__).resolve().parents[1]
TAXONOMY_FILE = ROOT / "lightcast_skills_taxonomy.json"
ENV_FILE      = ROOT / "backend" / ".env"
BATCH_SIZE    = 500


def load_env() -> tuple[str, str]:
    load_dotenv(ENV_FILE)
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY missing in backend/.env")
        sys.exit(1)
    return url, key


def walk_taxonomy(path: Path) -> list[dict]:
    """
    Flattens the Lightcast JSON tree into a list of L3 skill dicts.
    Each dict: {taxonomy_key, lightcast_id, l1_domain, l2_cluster}
    """
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    skills: list[dict] = []

    def _walk(node: dict, l1_domain: str | None = None, l2_cluster: str | None = None) -> None:
        if node.get("id") and l1_domain and l2_cluster:
            skills.append({
                "taxonomy_key": node["name"],
                "lightcast_id": node["id"],
                "l1_domain":    l1_domain,
                "l2_cluster":   l2_cluster,
            })
        for child in node.get("children", []):
            if l1_domain is None:
                _walk(child, child["name"])
            elif l2_cluster is None:
                _walk(child, l1_domain, child["name"])
            else:
                _walk(child, l1_domain, l2_cluster)

    _walk(data)
    return skills


def upsert_skills(db, skills: list[dict]) -> int:
    rows = [
        {
            "taxonomy_key": s["taxonomy_key"],
            "display_name": s["taxonomy_key"],
            "lightcast_id": s["lightcast_id"],
            "l1_domain":    s["l1_domain"],
            "l2_cluster":   s["l2_cluster"],
            "is_active":    True,
        }
        for s in skills
    ]
    upserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        db.table("skills").upsert(rows[i:i+BATCH_SIZE], on_conflict="taxonomy_key").execute()
        upserted += len(rows[i:i+BATCH_SIZE])
        print(f"  {upserted}/{len(rows)} skills upserted…", end="\r")
        time.sleep(0.05)
    print()
    return upserted


def main() -> None:
    print("Loading taxonomy JSON…")
    skills = walk_taxonomy(TAXONOMY_FILE)
    print(f"  {len(skills)} L3 skills found")

    print("Connecting to Supabase…")
    url, key = load_env()
    db = create_client(url, key)

    print("\nUpserting skills…")
    count = upsert_skills(db, skills)
    print(f"\nDone. {count} skills upserted.")


if __name__ == "__main__":
    main()
