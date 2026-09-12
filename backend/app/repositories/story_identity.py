"""story_identity — persistence for the Story Identity module.

Reads the reservoir the way the identity rules need it, and applies their
plans: the verdict ledger (story_merge_verdicts), pairwise similarity
(story_identity_pairs) and the atomic fold / undo (story_identity_fold,
story_identity_unfold). Own-only end to end: RLS under the user client; the
worker's admin client is scoped by user_id on every call.

Every read of a whole reservoir PAGES. PostgREST caps a response at 1,000 rows
and truncates without saying so.
"""
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.db_safe import safe_read
from app.deps import get_user_db
from app.services.story_identity_rules import FoldPlan, Pair, UnfoldPlan, pair_key

_PAGE = 1000
_STORY_COLS = "id, role_id, title, narrative, metrics, skills, inflow_ids, status, created_at"
_POINTER_COLS = "id, story_id, text, is_canonical, ordering"


class StoryIdentityRepository:
    def __init__(self, db: Client):
        self._db = db

    def _paged(self, build: Callable[[], Any], context: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        while True:
            page = safe_read(
                build().range(len(rows), len(rows) + _PAGE - 1), default=[], context=context,
            ) or []
            rows.extend(page)
            if len(page) < _PAGE:
                return rows

    # ── the reservoir, as identity reads it ──────────────────────────────────

    def active_stories(self, user_id: str) -> list[dict[str, Any]]:
        return self._paged(
            lambda: self._db.table("career_stories").select(_STORY_COLS)
            .eq("user_id", user_id).eq("status", "active").order("id"),
            "story_identity_stories",
        )

    def stories(self, user_id: str, story_ids: list[str]) -> list[dict[str, Any]]:
        """A bounded handful — a pair — never the whole reservoir."""
        return safe_read(
            self._db.table("career_stories").select(_STORY_COLS)
            .eq("user_id", user_id).in_("id", story_ids),
            default=[], context="story_identity_pair_stories",
        ) or []

    def story(self, user_id: str, story_id: str) -> dict[str, Any] | None:
        rows = self.stories(user_id, [story_id])
        return rows[0] if rows else None

    def all_stories_brief(self, user_id: str) -> list[dict[str, Any]]:
        """Every story, archived included — a fold receipt names one that is no
        longer active, and a proposal must not be shown for one curated away."""
        return self._paged(
            lambda: self._db.table("career_stories").select("id, role_id, title, status")
            .eq("user_id", user_id).order("id"),
            "story_identity_all_stories",
        )

    def role_companies(self, user_id: str) -> dict[str, str]:
        rows = self._paged(
            lambda: self._db.table("career_roles").select("id, company")
            .eq("user_id", user_id).order("id"),
            "story_identity_roles",
        )
        return {str(r["id"]): str(r.get("company") or "") for r in rows}

    def all_story_pointers(self, user_id: str) -> list[dict[str, Any]]:
        return self._paged(
            lambda: self._db.table("cv_points").select(_POINTER_COLS)
            .eq("user_id", user_id).eq("status", "active")
            .not_.is_("story_id", "null").order("id"),
            "story_identity_pointers",
        )

    def story_pointers(self, user_id: str, story_ids: list[str]) -> list[dict[str, Any]]:
        """Pointers of a bounded handful of stories — a pair."""
        return safe_read(
            self._db.table("cv_points").select(_POINTER_COLS)
            .eq("user_id", user_id).eq("status", "active").in_("story_id", story_ids),
            default=[], context="story_identity_pair_pointers",
        ) or []

    def similar_pairs(self, user_id: str, floor: float) -> list[tuple[str, str, float]]:
        rows = self._paged(
            lambda: self._db.rpc("story_identity_pairs", {"p_user_id": user_id, "p_floor": floor}),
            "story_identity_pairs",
        )
        return [(str(r["story_a"]), str(r["story_b"]), float(r["similarity"])) for r in rows]

    # ── the ledger ───────────────────────────────────────────────────────────

    def decided_pairs(self, user_id: str) -> set[Pair]:
        """Every pair with a row — a pending proposal included, so a question
        waiting on the user is never re-judged underneath them."""
        rows = self._paged(
            lambda: self._db.table("story_merge_verdicts").select("story_a, story_b")
            .eq("user_id", user_id).order("id"),
            "story_identity_decided",
        )
        return {pair_key(str(r["story_a"]), str(r["story_b"])) for r in rows}

    def verdict(self, user_id: str, story_a: str, story_b: str) -> dict[str, Any] | None:
        a, b = pair_key(story_a, story_b)
        rows = safe_read(
            self._db.table("story_merge_verdicts").select("*")
            .eq("user_id", user_id).eq("story_a", a).eq("story_b", b),
            default=[], context="story_identity_verdict",
        ) or []
        return rows[0] if rows else None

    def proposals(self, user_id: str) -> list[dict[str, Any]]:
        return self._paged(
            lambda: self._db.table("story_merge_verdicts").select("story_a, story_b, created_at")
            .eq("user_id", user_id).eq("verdict", "proposed").order("id"),
            "story_identity_proposals",
        )

    def recent_folds(self, user_id: str, days: int = 30) -> list[dict[str, Any]]:
        """Folds Myro made on its own lately — the 'Merged for you' receipt."""
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        return self._paged(
            lambda: self._db.table("story_merge_verdicts")
            .select("story_a, story_b, keep_id, moved, updated_at")
            .eq("user_id", user_id).eq("verdict", "auto_folded")
            .gte("updated_at", since).order("id"),
            "story_identity_recent_folds",
        )

    def user_ruled_count(self, user_id: str) -> int:
        rows = self._paged(
            lambda: self._db.table("story_merge_verdicts").select("id")
            .eq("user_id", user_id).eq("decided_by", "user").order("id"),
            "story_identity_user_ruled",
        )
        return len(rows)

    def record_verdict(self, user_id: str, story_a: str, story_b: str, verdict: str, decided_by: str) -> None:
        """A user ruling overwrites. A judge ruling never does: a row that
        appeared after the sweep read the ledger is left exactly as it is."""
        a, b = pair_key(story_a, story_b)
        self._db.table("story_merge_verdicts").upsert(
            {
                "user_id": user_id, "story_a": a, "story_b": b,
                "verdict": verdict, "decided_by": decided_by, "keep_id": None, "moved": None,
            },
            on_conflict="user_id,story_a,story_b",
            ignore_duplicates=decided_by != "user",
        ).execute()

    # ── phrasing curation (SQL holds both invariants) ────────────────────────

    def promote_phrasing(self, user_id: str, point_id: str) -> None:
        self._db.rpc("story_pointer_promote", {"p_user_id": user_id, "p_point_id": point_id}).execute()

    def drop_phrasing(self, user_id: str, point_id: str) -> None:
        self._db.rpc("story_pointer_drop", {"p_user_id": user_id, "p_point_id": point_id}).execute()

    # ── atomic fold / undo (SQL applies the plan in one transaction) ─────────

    def fold(self, user_id: str, plan: FoldPlan, *, verdict: str, decided_by: str) -> None:
        self._db.rpc("story_identity_fold", {
            "p_user_id": user_id, "p_keep": plan.keep_id, "p_dup": plan.dup_id,
            "p_verdict": verdict, "p_decided_by": decided_by,
            "p_move_pointers": plan.move_pointers, "p_archive_pointers": plan.archive_pointers,
            "p_keep_metrics": plan.keep_metrics, "p_keep_skills": plan.keep_skills,
            "p_keep_inflows": plan.keep_inflows, "p_moved": plan.moved,
        }).execute()

    def unfold(self, user_id: str, plan: UnfoldPlan) -> None:
        self._db.rpc("story_identity_unfold", {
            "p_user_id": user_id, "p_keep": plan.keep_id, "p_dup": plan.dup_id,
            "p_back_canonical": plan.back_canonical, "p_back_variant": plan.back_variant,
            "p_reactivate": plan.reactivate, "p_keep_metrics": plan.keep_metrics,
            "p_keep_skills": plan.keep_skills, "p_keep_inflows": plan.keep_inflows,
        }).execute()


def get_story_identity_repository(db: Client = Depends(get_user_db)) -> StoryIdentityRepository:
    return StoryIdentityRepository(db)
