"""notifications — the in-app inbox.

Two access modes on the same table (RLS split, like jobs):
  - token client (owner): list own inbox + mark read.
  - admin client (service): write a notification — the scrape sweep, after a
    user's recompute produced genuinely-new matches.

`fresh_matches` debounces a burst into one digest. `cv_analysis` projects one
durable upload job into one inbox row and updates that row through its lifecycle.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin
from app.db_safe import safe_read
from app.deps import get_user_db

# One unread 'fresh_matches' digest per user within this window — a re-scrape
# inside it bumps the existing row instead of stacking a new ping.
FRESH_MATCHES_DEBOUNCE_HOURS = 12
_INBOX_LIMIT = 30


class NotificationsRepository:
    def __init__(self, db: Client, admin_db: Client | None = None) -> None:
        self._db = db
        self._admin_db = admin_db or db

    # ── owner reads (token client) ──────────────────────────────────────────

    def list_for_user(self, user_id: str, *, limit: int = _INBOX_LIMIT) -> list[dict[str, Any]]:
        # safe_read: the migration (20260710b) is manual-apply; until it lands
        # PostgREST returns PGRST205 — degrade to an empty inbox, never 500 the bell.
        return safe_read(
            self._db.table("user_notifications")
            .select(
                "id, kind, title, body, job_id, source_id, action_url, state, "
                "match_count, read_at, created_at"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit),
            default=[],
            context="notifications_list",
        )

    def unread_count(self, user_id: str) -> int:
        rows = safe_read(
            self._db.table("user_notifications")
            .select("id")
            .eq("user_id", user_id)
            .is_("read_at", "null"),
            default=[],
            context="notifications_unread_count",
        )
        return len(rows)

    # ── owner writes (token client — mark read only) ────────────────────────

    def mark_read(self, user_id: str, ids: list[int] | None = None) -> None:
        """Mark the given notifications read, or ALL of the user's unread when
        `ids` is None. RLS already scopes to the owner; the explicit user_id
        filter is defence-in-depth."""
        now = datetime.now(timezone.utc).isoformat()
        query = (
            self._db.table("user_notifications")
            .update({"read_at": now})
            .eq("user_id", user_id)
            .is_("read_at", "null")
        )
        if ids:
            query = query.in_("id", ids)
        query.execute()

    # ── service writes (admin client — the sweep) ───────────────────────────

    def record_fresh_matches(
        self,
        user_id: str,
        *,
        job_id: str | None,
        title: str,
        body: str | None,
        count: int,
        window_hours: int = FRESH_MATCHES_DEBOUNCE_HOURS,
    ) -> None:
        """Write (or merge into) the user's 'fresh_matches' digest.

        Debounce: if an UNREAD 'fresh_matches' row exists within `window_hours`,
        bump its count + refresh the carried top match + timestamp, instead of
        inserting a second ping. Idempotent-ish: a re-run of the same sweep just
        re-bumps the same row. Admin client — RLS write policies don't cover
        service inserts."""
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
        now = datetime.now(timezone.utc).isoformat()
        existing = (
            self._admin_db.table("user_notifications")
            .select("id, match_count")
            .eq("user_id", user_id)
            .eq("kind", "fresh_matches")
            .is_("read_at", "null")
            .gte("created_at", cutoff)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        ).data or []

        if existing:
            prev = existing[0]
            merged = int(prev.get("match_count") or 0) + count
            self._admin_db.table("user_notifications").update({
                "match_count": merged,
                "title": _fresh_title(merged),
                "body": body,
                "job_id": job_id,
                "created_at": now,  # bump so it sorts to the top of the inbox
            }).eq("id", prev["id"]).execute()
            return

        self._admin_db.table("user_notifications").insert({
            "user_id": user_id,
            "kind": "fresh_matches",
            "title": title,
            "body": body,
            "job_id": job_id,
            "match_count": count,
        }).execute()

    # ── CV-analysis lifecycle projection (admin client) ─────────────────────

    def record_cv_analysis_started(self, user_id: str, *, source_id: str) -> None:
        """Create the single inbox row for a durable CV upload job.

        Upsert makes the notification projection idempotent on the same key as
        the Background Job. A retry can update the row; it cannot stack pings.
        """
        self._admin_db.table("user_notifications").upsert({
            "user_id": user_id,
            "kind": "cv_analysis",
            "source_id": source_id,
            "state": "processing",
            "title": "Analyzing your CV",
            "body": "Reading your CV",
            "action_url": "/cv",
            "match_count": 1,
            # Processing is visible in the inbox, but completion is the ping.
            # The terminal transition resets this to NULL so the bell becomes unread.
            "read_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id,kind,source_id").execute()

    def update_cv_analysis_phase(self, source_id: str, phase: str) -> None:
        body = {
            "queued": "Waiting to start",
            "reading": "Reading your CV",
            "scoring": "Scoring your domains",
        }.get(phase, "Analyzing your CV")
        self._admin_db.table("user_notifications").update({
            "state": "processing",
            "title": "Analyzing your CV",
            "body": body,
        }).eq("kind", "cv_analysis").eq("source_id", source_id).execute()

    def record_cv_analysis_done(
        self,
        source_id: str,
        *,
        skills_detected: int,
        score: float,
    ) -> None:
        self._admin_db.table("user_notifications").update({
            "state": "ready",
            "title": "Your Myro Score is ready",
            "body": f"{skills_detected} skills mapped · Myro Score {round(score)}",
            "action_url": "/cv",
            "read_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).eq("kind", "cv_analysis").eq("source_id", source_id).execute()

    def record_cv_analysis_failed(self, source_id: str, *, refunded: bool) -> None:
        body = (
            "Analysis stopped. Your Myro Coins were refunded."
            if refunded
            else "Analysis stopped. Open your CV to try again."
        )
        self._admin_db.table("user_notifications").update({
            "state": "failed",
            "title": "CV analysis needs attention",
            "body": body,
            "action_url": "/cv",
            "read_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).eq("kind", "cv_analysis").eq("source_id", source_id).execute()


def _fresh_title(count: int) -> str:
    return f"{count} fresh match{'es' if count != 1 else ''}"


def get_notifications_repository(db: Client = Depends(get_user_db)) -> NotificationsRepository:
    return NotificationsRepository(db, admin_db=get_supabase_admin())
