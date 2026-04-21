"""
restore_skills_from_cv_text.py
Re-parses stored cv_raw_text for all users and restores correct proficiency levels.
Run from project root:
  source .venv/bin/activate && python backend/restore_skills_from_cv_text.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
os.chdir(os.path.join(os.path.dirname(__file__)))

from app.database import get_supabase_admin
from app.services import scoring_engine
from app.services.scoring_engine import fetch_aspiration_skills
from app.services.cv_parser import _llm_extract, _validate_and_normalize


async def restore_user(db, user_id: str, cv_raw_text: str, label: str) -> None:
    raw_skills = await _llm_extract(cv_raw_text)
    skills_detected = _validate_and_normalize(raw_skills)

    if not skills_detected:
        print(f"  {label} — LLM returned no skills")
        return

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
        db, user_id, skills_detected=skills_detected, aspiration_skills=aspiration_skills or None
    )
    print(f"  {label} — {len(skills_detected)} skills → score: {result['total_score']}")


async def main() -> None:
    db = get_supabase_admin()

    rows = (
        db.table("user_profiles")
        .select("id, cv_raw_text")
        .not_.is_("cv_raw_text", "null")
        .execute()
        .data
    )
    rows = [r for r in (rows or []) if r.get("cv_raw_text", "").strip()]
    print(f"Found {len(rows)} user(s) with stored CV text.")

    for i, row in enumerate(rows, 1):
        try:
            await restore_user(db, row["id"], row["cv_raw_text"], f"[{i}] {row['id'][:8]}…")
        except Exception as exc:
            print(f"  [{i}] {row['id'][:8]}… — ERROR: {exc}")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
