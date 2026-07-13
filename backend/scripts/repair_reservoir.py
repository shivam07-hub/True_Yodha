"""repair_reservoir — one-time cleanup of a polluted Career Story Reservoir.

Retro-applies the 2026-07-13 inflow fixes to data ingested BEFORE them:
  1. roles    — merge cross-slot / same-period duplicate role containers
                (stories move to the kept role; the duplicate archives)
  2. stories  — fold same-achievement duplicates (cosine >= 0.90 auto; the
                0.80-0.90 band through the batched LLM judge). The duplicate's
                pointers move to the canonical story as variants; metrics/
                skills/inflow_ids union in; the duplicate archives.
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
from app.services import story_dedup
from app.services.career_reservoir import (
    _parse_vector,
    reconcile_role,
)
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


async def _plan_story_folds(
    stories: list[dict[str, Any]], provider: Any,
) -> list[tuple[str, str]]:
    """(dup_id, canonical_id) pairs, oldest story wins as canonical."""
    folds: list[tuple[str, str]] = []
    kept: list[tuple[str, list[float]]] = []
    rows_by_id: dict[str, dict[str, Any]] = {}
    deferred: list[tuple[dict[str, Any], str]] = []
    for story in sorted(stories, key=lambda s: str(s.get("created_at") or "")):
        vec = _parse_vector(story.get("embedding"))
        sid = str(story["id"])
        if vec is None:
            continue
        target_id, score = story_dedup.best_match(vec, kept)
        verdict = story_dedup.classify(score) if target_id else "new"
        if verdict == "new":
            twin = story_dedup.find_title_twin(str(story.get("title") or ""), rows_by_id)
            if twin:
                target_id, verdict = twin, "judge"
        if verdict == "fold":
            folds.append((sid, target_id))
            continue
        if verdict == "judge":
            deferred.append((story, target_id))
            continue
        kept.append((sid, vec))
        rows_by_id[sid] = story

    if deferred:
        pairs = [{"new": s, "existing": rows_by_id[tid]} for s, tid in deferred]
        flags = await story_dedup.judge_pairs(pairs, provider)
        for (story, target_id), same in zip(deferred, flags):
            if same:
                folds.append((str(story["id"]), target_id))
    return folds


def _apply_role_merge(repo: Any, db: Any, user_id: str, dup_id: str, keep_id: str) -> None:
    db.table("career_stories").update({"role_id": keep_id}).eq("user_id", user_id).eq(
        "role_id", dup_id
    ).execute()
    repo.update_role(user_id, dup_id, {"status": "archived"})


def _apply_story_fold(repo: Any, db: Any, user_id: str, dup_id: str, keep_id: str) -> None:
    dup = next(s for s in repo.list_stories(user_id, include_archived=True) if str(s["id"]) == dup_id)
    keep = next(s for s in repo.list_stories(user_id, include_archived=True) if str(s["id"]) == keep_id)

    keep_pointers = repo.story_pointers(user_id, [keep_id])
    keep_texts = [p.get("text") or "" for p in keep_pointers]
    for p in repo.story_pointers(user_id, [dup_id]):
        text = p.get("text") or ""
        if story_dedup.pointer_is_new(text, keep_texts):
            db.table("cv_points").update({
                "story_id": keep_id,
                "role_anchor": f"story:{keep_id}",
                "is_canonical": False,
            }).eq("user_id", user_id).eq("id", p["id"]).execute()
            keep_texts.append(text)
        else:
            db.table("cv_points").update({"status": "archived"}).eq(
                "user_id", user_id
            ).eq("id", p["id"]).execute()

    updates: dict[str, Any] = {
        "metrics": story_dedup.merged_metrics(keep.get("metrics") or [], dup.get("metrics") or []),
        "skills": story_dedup.merged_skills(keep.get("skills") or [], dup.get("skills") or []),
    }
    inflows = list(keep.get("inflow_ids") or [])
    for entry in dup.get("inflow_ids") or []:
        if entry not in inflows:
            inflows.append(entry)
    updates["inflow_ids"] = inflows
    repo.update_story(user_id, keep_id, updates)
    repo.update_story(user_id, dup_id, {"status": "archived"})


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
            print(f"  metrics {story.get('title', '')[:50]!r}: "
                  f"{[m.get('value') for m in story.get('metrics') or []]} -> {[m['value'] for m in out]}")
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
    print(f"[{mode}] reservoir repair for user {user_id}")

    # 1. roles
    roles = [r for r in repo.list_roles(user_id) if (r.get("status") or "active") == "active"]
    role_merges = _plan_role_merges(roles)
    by_id = {str(r["id"]): r for r in roles}
    print(f"\nroles: {len(roles)} active, {len(role_merges)} merges")
    for dup_id, keep_id in role_merges:
        d, k = by_id[dup_id], by_id[keep_id]
        print(f"  merge {d.get('company')!r} · {d.get('title')!r} -> {k.get('company')!r} · {k.get('title')!r}")
        if args.apply:
            _apply_role_merge(repo, db, user_id, dup_id, keep_id)

    # 2. stories (fold duplicates)
    from app.services.llm_provider import get_paid_jobs_provider

    stories = repo.list_stories(user_id)
    folds = await _plan_story_folds(stories, get_paid_jobs_provider())
    story_by_id = {str(s["id"]): s for s in stories}
    print(f"\nstories: {len(stories)} active, {len(folds)} folds")
    for dup_id, keep_id in folds:
        print(f"  fold {story_by_id[dup_id].get('title', '')[:60]!r} -> "
              f"{story_by_id[keep_id].get('title', '')[:60]!r}")
        if args.apply:
            _apply_story_fold(repo, db, user_id, dup_id, keep_id)

    # 3. metrics (re-anchor to verbatim tokens) — over the survivors
    survivors = [s for s in repo.list_stories(user_id)] if args.apply else [
        s for s in stories if str(s["id"]) not in {d for d, _ in folds}
    ]
    pointer_rows = repo.story_pointers(user_id, [str(s["id"]) for s in survivors])
    pointers_by_story: dict[str, list[str]] = {}
    for p in pointer_rows:
        pointers_by_story.setdefault(str(p.get("story_id")), []).append(p.get("text") or "")
    print("\nmetric repairs:")
    fixed = _repair_metrics(repo, user_id, survivors, pointers_by_story, args.apply)
    print(f"\n[{mode}] done: {len(role_merges)} role merges, {len(folds)} story folds, {fixed} metric fixes")


if __name__ == "__main__":
    asyncio.run(main())
