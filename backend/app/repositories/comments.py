from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin
from app.db_safe import safe_read
from app.deps import get_user_db

# Public-notes moderation/abuse knobs (mirror job_reports).
DAILY_NOTE_LIMIT = 3
FLAG_HIDE_THRESHOLD = 5  # also enforced by the DB trigger comments_autohide


class CommentsRepository:
    """Token-scoped CRUD for the caller's OWN notes. RLS enforces own-only write
    (see migration 20260531_comments) — every query also filters by user_id for
    defence-in-depth. Public reads/flagging go through PublicCommentsRepository
    (service role), since they cross the own-only boundary by design."""

    def __init__(self, db: Client):
        self._db = db

    def list_for_entity(self, user_id: str, entity_type: str, entity_id: str) -> list[dict[str, Any]]:
        # The comments table migration (20260531_comments) is manual-apply; until
        # it lands, PostgREST returns PGRST205 ("table not in schema cache").
        # safe_read degrades that to an empty thread instead of 500ing the card.
        return safe_read(
            self._db.table("comments")
            .select("*")
            .eq("user_id", user_id)
            .eq("entity_type", entity_type)
            .eq("entity_id", entity_id)
            .order("created_at", desc=True),
            default=[],
            context="comments_list_for_entity",
        )

    def create(self, user_id: str, entity_type: str, entity_id: str, body: str) -> dict[str, Any]:
        result = (
            self._db.table("comments")
            .insert(
                {
                    "user_id": user_id,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "body": body,
                }
            )
            .execute()
        )
        return (result.data or [{}])[0]

    def update(self, user_id: str, comment_id: str, body: str) -> dict[str, Any] | None:
        result = (
            self._db.table("comments")
            .update({"body": body, "updated_at": "now()"})
            .eq("id", comment_id)
            .eq("user_id", user_id)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def delete(self, user_id: str, comment_id: str) -> bool:
        result = (
            self._db.table("comments")
            .delete()
            .eq("id", comment_id)
            .eq("user_id", user_id)
            .execute()
        )
        return bool(result.data)


def get_token_comments_repository(db: Client = Depends(get_user_db)) -> CommentsRepository:
    return CommentsRepository(db)


_PUBLIC_FIELDS = "id,user_id,entity_type,entity_id,body,status,created_at,updated_at"


class PublicCommentsRepository:
    """Service-role reads/flagging for the public notes feed. Crosses the
    own-only RLS boundary intentionally: anyone reads every visible note, and a
    user flags a note they do not own. Never returns user_id to callers — the
    router maps it to ninja_name and drops it."""

    def __init__(self, admin: Client):
        self._db = admin

    def list_visible(self, entity_type: str, entity_id: str) -> list[dict[str, Any]]:
        return safe_read(
            self._db.table("comments")
            .select(_PUBLIC_FIELDS)
            .eq("entity_type", entity_type)
            .eq("entity_id", entity_id)
            .eq("status", "visible")
            .order("created_at", desc=True),
            default=[],
            context="public_comments_list_visible",
        )

    def ninja_names_for(self, user_ids: list[str]) -> dict[str, str | None]:
        """Map user_id -> ninja_name. Users without a profile row are absent
        (caller falls back to an anonymous label)."""
        if not user_ids:
            return {}
        rows = safe_read(
            self._db.table("user_profiles")
            .select("id,ninja_name")
            .in_("id", list(set(user_ids))),
            default=[],
            context="public_comments_ninja_names",
        )
        return {r["id"]: r.get("ninja_name") for r in rows}

    def count_notes_since(self, user_id: str, since_iso: str) -> int:
        result = (
            self._db.table("comments")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", since_iso)
            .execute()
        )
        return result.count or 0

    def over_daily_limit(self, user_id: str) -> bool:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        return self.count_notes_since(user_id, cutoff) >= DAILY_NOTE_LIMIT

    def get_visible(self, comment_id: str) -> dict[str, Any] | None:
        row = (
            self._db.table("comments")
            .select("id,status,report_count")
            .eq("id", comment_id)
            .eq("status", "visible")
            .maybe_single()
            .execute()
        )
        return (row.data if row else None) or None

    def record_flag(self, comment_id: str, flagger_id: str) -> dict[str, Any]:
        """Idempotent flag: dedup via UNIQUE(comment_id,user_id), recount, write
        report_count back (DB trigger auto-hides at the threshold). Returns the
        updated {report_count, status}."""
        try:
            self._db.table("comment_flags").insert(
                {"comment_id": comment_id, "user_id": flagger_id}
            ).execute()
        except Exception:
            # Unique-violation (already flagged) or transient — fall through to a
            # recount so the call stays idempotent.
            pass
        count_res = (
            self._db.table("comment_flags")
            .select("id", count="exact")
            .eq("comment_id", comment_id)
            .execute()
        )
        count = count_res.count or 0
        upd = (
            self._db.table("comments")
            .update({"report_count": count})
            .eq("id", comment_id)
            .execute()
        )
        row = (upd.data or [{}])[0]
        return {"report_count": count, "status": row.get("status", "visible")}


def get_public_comments_repository() -> PublicCommentsRepository:
    return PublicCommentsRepository(get_supabase_admin())
