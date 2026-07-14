"""career_reservoir — CRUD for the Career Story Reservoir (roles + stories).

The relational spine of the CV knowledge layer (migration 20260711h):
`career_roles` (stable role containers) → `career_stories` (STAR narratives with
metrics/skills/provenance) → `cv_points` phrasings (story_id-linked pointers).
Own-only end to end: RLS enforces `auth.uid() = user_id`; every query also
filters user_id for defence-in-depth. `safe_read` degrades pre-migration reads
to empty so nothing 500s before 20260711h lands.

The background ingest handler constructs this over the admin client (RLS bypass,
same trust model as memory_distiller) — user_id is always an explicit filter.
"""
from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.db_safe import safe_read
from app.deps import get_user_db


class CareerReservoirRepository:
    def __init__(self, db: Client):
        self._db = db

    # ── roles ────────────────────────────────────────────────────────────────

    def list_roles(self, user_id: str) -> list[dict[str, Any]]:
        return safe_read(
            self._db.table("career_roles")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=False),
            default=[],
            context="career_roles_list",
        )

    def add_role(self, user_id: str, role: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "user_id": user_id,
            "company": role.get("company") or "",
            "title": role.get("title") or "",
            "location": role.get("location") or "",
            "date_label": role.get("date_label") or "",
            "kind": role.get("kind") or "work",
            "source": role.get("source") or "ingest",
        }
        result = self._db.table("career_roles").insert(payload).execute()
        return (result.data or [{}])[0]

    def update_role(self, user_id: str, role_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        result = (
            self._db.table("career_roles")
            .update(updates)
            .eq("user_id", user_id)
            .eq("id", role_id)
            .execute()
        )
        return (result.data or [None])[0]

    # ── stories ──────────────────────────────────────────────────────────────

    def list_stories(self, user_id: str, *, include_archived: bool = False) -> list[dict[str, Any]]:
        query = self._db.table("career_stories").select("*").eq("user_id", user_id)
        if not include_archived:
            query = query.eq("status", "active")
        return safe_read(
            query.order("created_at", desc=False),
            default=[],
            context="career_stories_list",
        )

    def add_story(self, user_id: str, story: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "user_id": user_id,
            "role_id": story.get("role_id"),
            "kind": story.get("kind") or "project",
            "title": story.get("title") or "",
            "narrative": story.get("narrative") or {},
            "metrics": story.get("metrics") or [],
            "skills": story.get("skills") or [],
            "audience_tags": story.get("audience_tags") or [],
            "source": story.get("source") or "ingest",
            "inflow_ids": story.get("inflow_ids") or [],
        }
        result = self._db.table("career_stories").insert(payload).execute()
        return (result.data or [{}])[0]

    def update_story(self, user_id: str, story_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        result = (
            self._db.table("career_stories")
            .update(updates)
            .eq("user_id", user_id)
            .eq("id", story_id)
            .execute()
        )
        return (result.data or [None])[0]

    def set_story_embedding(self, user_id: str, story_id: str, vector_literal: str) -> None:
        self._db.table("career_stories").update({"embedding": vector_literal}).eq(
            "user_id", user_id
        ).eq("id", story_id).execute()

    def story_embeddings(self, user_id: str) -> list[dict[str, Any]]:
        """(id, embedding) of active stories that HAVE an embedding — the in-Python
        dedup candidate set (user story counts are small; no ANN RPC needed)."""
        rows = safe_read(
            self._db.table("career_stories")
            .select("id, embedding")
            .eq("user_id", user_id)
            .eq("status", "active")
            .not_.is_("embedding", "null"),
            default=[],
            context="career_stories_embeddings",
        )
        return rows

    def story_dedup_rows(self, user_id: str) -> list[dict[str, Any]]:
        """Active embedded stories with the fields the fold path needs: identity
        text for the judge (title/narrative) + merge targets (metrics/skills/
        inflow_ids)."""
        return safe_read(
            self._db.table("career_stories")
            .select("id, title, narrative, metrics, skills, inflow_ids, embedding")
            .eq("user_id", user_id)
            .eq("status", "active")
            .not_.is_("embedding", "null"),
            default=[],
            context="career_stories_dedup_rows",
        )

    # ── story-linked pointers (cv_points) ────────────────────────────────────

    def add_story_pointer(
        self, user_id: str, story_id: str, *, point_key: str, section: str, text: str,
        ordering: float, is_canonical: bool = True,
    ) -> dict[str, Any]:
        result = (
            self._db.table("cv_points")
            .insert({
                "user_id": user_id,
                "point_key": point_key,
                "story_id": story_id,
                "role_anchor": f"story:{story_id}",
                "section": section,
                "text": text,
                "source": "manual",
                "is_canonical": is_canonical,
                "ordering": ordering,
            })
            .execute()
        )
        return (result.data or [{}])[0]

    def story_pointers(self, user_id: str, story_ids: list[str]) -> list[dict[str, Any]]:
        if not story_ids:
            return []
        return safe_read(
            self._db.table("cv_points")
            .select("id, story_id, point_key, text, is_canonical, status, ordering")
            .eq("user_id", user_id)
            .in_("story_id", story_ids)
            .eq("status", "active"),
            default=[],
            context="career_story_pointers",
        )

    # ── inflow ledger (cv_dump_entries processing state) ─────────────────────

    def pending_entries(self, user_id: str, limit: int = 20) -> list[dict[str, Any]]:
        return safe_read(
            self._db.table("cv_dump_entries")
            .select("id, text, kind, payload, source, created_at")
            .eq("user_id", user_id)
            .in_("kind", ["file", "linkedin"])
            .is_("processed_at", "null")
            .order("created_at", desc=False)
            .limit(limit),
            default=[],
            context="career_pending_entries",
        )

    def get_entry(self, user_id: str, entry_id: str) -> dict[str, Any] | None:
        return safe_read(
            self._db.table("cv_dump_entries")
            .select("id, text, kind, payload, source, processed_at, created_at")
            .eq("user_id", user_id)
            .eq("id", entry_id)
            .maybe_single(),
            default=None,
            context="career_get_entry",
        )

    def mark_processed(self, user_id: str, entry_id: str, story_ids: list[str]) -> None:
        self._db.table("cv_dump_entries").update(
            {"processed_at": "now()", "derived_story_ids": story_ids}
        ).eq("user_id", user_id).eq("id", entry_id).execute()

    def mark_skipped(self, user_id: str, entry_id: str, payload: dict[str, Any] | None, reason: str) -> None:
        """Close an entry WITHOUT extraction, recording why in its payload —
        a guarded skip must stay queryable, never silent."""
        self._db.table("cv_dump_entries").update(
            {
                "processed_at": "now()",
                "derived_story_ids": [],
                "payload": {**(payload or {}), "skip_reason": reason},
            }
        ).eq("user_id", user_id).eq("id", entry_id).execute()

    def ingest_status(self, user_id: str) -> dict[str, int]:
        """Pending vs processed FILE-class inflow counts (the toggle's progress line)."""
        rows = safe_read(
            self._db.table("cv_dump_entries")
            .select("id, processed_at")
            .eq("user_id", user_id)
            .in_("kind", ["file", "linkedin"]),
            default=[],
            context="career_ingest_status",
        )
        pending = sum(1 for r in rows if not r.get("processed_at"))
        return {"pending": pending, "processed": len(rows) - pending}


def get_career_reservoir_repository(db: Client = Depends(get_user_db)) -> CareerReservoirRepository:
    return CareerReservoirRepository(db)
