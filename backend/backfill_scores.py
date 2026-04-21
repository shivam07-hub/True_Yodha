"""
backfill_scores.py
Recomputes Mirror Score for every user who has skills in user_skills.
Run from backend/ directory:
  source ../.venv/bin/activate && python backfill_scores.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
os.chdir(os.path.dirname(__file__))

from app.database import get_supabase_admin
from app.services import scoring_engine
from app.services.scoring_engine import fetch_aspiration_skills


def main() -> None:
    db = get_supabase_admin()

    # All distinct users with at least one skill
    rows = db.table("user_skills").select("user_id").execute().data
    user_ids = list({r["user_id"] for r in (rows or [])})
    print(f"Found {len(user_ids)} user(s) to recompute.")

    for i, user_id in enumerate(user_ids, 1):
        try:
            skill_rows = (
                db.table("user_skills")
                .select("matched_level, evidence_text, skills(taxonomy_key)")
                .eq("user_id", user_id)
                .execute()
                .data
            )
            if not skill_rows:
                print(f"  [{i}] {user_id[:8]}… — no skills, skipping")
                continue

            signals = [
                {
                    "taxonomy_key": r["skills"]["taxonomy_key"],
                    "xp_awarded": r["matched_level"] * 150,
                    "signal_type": "project",
                    "evidence": r.get("evidence_text", ""),
                }
                for r in skill_rows
                if r.get("skills")
            ]

            profile = (
                db.table("user_profiles")
                .select("target_roles")
                .eq("id", user_id)
                .maybe_single()
                .execute()
            )
            target_roles: list[str] = ((profile.data or {}).get("target_roles") or [])
            aspiration_skills = fetch_aspiration_skills(db, target_roles)

            result = scoring_engine.compute_and_persist_score(
                db, user_id, signals, aspiration_skills or None
            )
            print(f"  [{i}] {user_id[:8]}… — score: {result['total_score']}")

        except Exception as exc:
            print(f"  [{i}] {user_id[:8]}… — ERROR: {exc}")

    print("Done.")


if __name__ == "__main__":
    main()
