"""repair_reservoir — one-time cleanup of a polluted Career Story Reservoir.

Retro-applies the 2026-07-13 inflow fixes to data ingested BEFORE them:
  1. roles    — merge cross-slot / same-period duplicate role containers
                (stories move to the kept role; the duplicate archives)
  2. stories  — the story_identity sweep: the same rules ingest and the
                Stories tab use (one place, app/services/story_identity.py).
                It records verdicts, so it only runs with --apply.
  3. metrics  — re-anchor normalized metric values ('500000') to the verbatim
                token in the story's own text ('€500K+'); drop large pure-digit
                values that anchor to nothing (ADR-0016).

Everything is archive/update — nothing is deleted; a bad merge is reversible
by hand. Dry-run by default.

Usage (from backend/, venv active, .env loaded):
  python -m scripts.repair_reservoir --email someone@example.com [--apply]
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from typing import Any

from app.database import get_supabase_admin
from app.repositories.career_reservoir import CareerReservoirRepository
from app.services.career_reservoir import reconcile_role
from app.services.story_extractor import verbatim_metric_value


def _resolve_user(db: Any, email: str | None, user_id: str | None) -> str:
    if user_id:
        return user_id
    result = db.auth.admin.list_users()
    users = result if isinstance(result, list) else getattr(result, "users", [])
    for u in users:
        if (getattr(u, "email", "") or "").lower() == (email or "").lower():
            return str(u.id)
    sys.exit(f"no user found for email {email}")


def _plan_role_merges(roles: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """(dup_id, keep_id) pairs. Earlier-created role is kept; later ones that
    reconcile against it (incl. the cross-slot/date pass) merge in."""
    merges: list[tuple[str, str]] = []
    kept: list[dict[str, Any]] = []
    for role in sorted(roles, key=lambda r: str(r.get("created_at") or "")):
        target = reconcile_role(
            {"company": role.get("company"), "title": role.get("title"),
             "date_label": role.get("date_label")},
            kept,
        )
        if target and target != str(role["id"]):
            merges.append((str(role["id"]), target))
        else:
            kept.append(role)
    return merges


def _apply_role_merge(repo: Any, db: Any, user_id: str, dup_id: str, keep_id: str) -> None:
    db.table("career_stories").update({"role_id": keep_id}).eq("user_id", user_id).eq(
        "role_id", dup_id
    ).execute()
    repo.update_role(user_id, dup_id, {"status": "archived"})


def _repair_metrics(repo: Any, user_id: str, stories: list[dict[str, Any]],
                    pointers_by_story: dict[str, list[str]], apply: bool) -> int:
    fixed = 0
    for story in stories:
        narrative = story.get("narrative") or {}
        texts = [story.get("title") or "", *pointers_by_story.get(str(story["id"]), []),
                 *[str(v) for v in narrative.values()]]
        out: list[dict[str, str]] = []
        seen: set[tuple[str, str]] = set()
        for m in story.get("metrics") or []:
            anchored = verbatim_metric_value(str(m.get("value") or ""), texts)
            if not anchored:
                continue
            key = (anchored.lower(), str(m.get("what") or "").lower())
            if key in seen:
                continue
            seen.add(key)
            out.append({"value": anchored, "what": m.get("what") or ""})
        if out != (story.get("metrics") or []):
            fixed += 1
            print("  metrics [REDACTED]")
            if apply:
                repo.update_story(user_id, str(story["id"]), {"metrics": out})
    return fixed


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email")
    parser.add_argument("--user-id")
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    args = parser.parse_args()
    if not args.email and not args.user_id:
        sys.exit("pass --email or --user-id")

    db = get_supabase_admin()
    user_id = _resolve_user(db, args.email, args.user_id)
    repo = CareerReservoirRepository(db)
    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[{mode}] reservoir repair for user [REDACTED]")

    # 1. roles
    roles = [r for r in repo.list_roles(user_id) if (r.get("status") or "active") == "active"]
    role_merges = _plan_role_merges(roles)
    print(f"\nroles: {len(roles)} active, {len(role_merges)} merges")
    for dup_id, keep_id in role_merges:
        print("  merge [REDACTED] -> [REDACTED]")
        if args.apply:
            _apply_role_merge(repo, db, user_id, dup_id, keep_id)

    # 2. stories — the one identity sweep (it records verdicts → --apply only)
    folded = 0
    if args.apply:
        from app.repositories.story_identity import StoryIdentityRepository
        from app.services import story_identity

        counts = await story_identity.run(StoryIdentityRepository(db), user_id)
        folded = counts["folded"]
        print(f"\nstories: identity sweep {counts}")
    else:
        print("\nstories: the identity sweep runs with --apply only (it records verdicts)")

    # 3. metrics (re-anchor to verbatim tokens) — over the survivors
    survivors = repo.list_stories(user_id)
    pointer_rows = repo.story_pointers(user_id, [str(s["id"]) for s in survivors])
    pointers_by_story: dict[str, list[str]] = {}
    for p in pointer_rows:
        pointers_by_story.setdefault(str(p.get("story_id")), []).append(p.get("text") or "")
    print("\nmetric repairs:")
    fixed = _repair_metrics(repo, user_id, survivors, pointers_by_story, args.apply)
    print(f"\n[{mode}] done: {len(role_merges)} role merges, {folded} story folds, {fixed} metric fixes")


if __name__ == "__main__":
    asyncio.run(main())
