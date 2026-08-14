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
from app.db_safe import safe_count, safe_read
from app.deps import get_user_db
from app.services.new_inventory_projection import (
    NEW_INVENTORY_DEBOUNCE_HOURS as NEW_INVENTORY_DEBOUNCE_HOURS,
    reconcile_new_inventory,
    record_new_inventory,
    resolve_new_inventory,
)

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
        rows = safe_read(
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
        return reconcile_new_inventory(self._db, self._admin_db, user_id, list(rows))

    def unread_count(self, user_id: str) -> int:
        return safe_count(
            self._db.table("user_notifications")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .is_("read_at", "null")
            .limit(1),
            default=0,
            context="notifications_unread_count",
        )

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
            "finding_skills": "Extracting your skills",
            "structuring_cv": "Preparing your CV review",
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
    ) -> None:
        # A finished analysis has no score to announce — scoring waits for skill
        # confirmation (a6425b46), and this notification is what sends the user to
        # do it. The "Your Myro Score is ready" variant used to live here and had
        # been unreachable since that change.
        self._admin_db.table("user_notifications").update({
            "state": "ready",
            "title": "Review the skills Myro found",
            "body": f"{skills_detected} skills mapped · confirm them before scoring",
            "action_url": "/onboarding/result",
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

    # ── Collections attention projection (admin client) ─────────────────────

    def record_collection_attention(
        self,
        user_id: str,
        *,
        job_id: str,
        title: str,
        body: str,
    ) -> None:
        """Re-open the one durable saved-role attention notification.

        The corresponding ``job_applications`` fields decide *whether* this
        should be shown. The inbox row only projects that truth and supplies the
        action destination, so a bell row can never outlive a dismissed/applied
        saved intent as an actionable prompt.
        """
        self._admin_db.table("user_notifications").upsert({
            "user_id": user_id,
            "kind": "collection_attention",
            "source_id": job_id,
            "job_id": job_id,
            "title": title,
            "body": body,
            "action_url": f"/collections?jobId={job_id}",
            "state": None,
            "match_count": 1,
            "read_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id,kind,source_id").execute()

    def resolve_collection_attention(self, user_id: str, job_id: str) -> None:
        """Make a saved-role reminder non-actionable once its intent is resolved."""
        self._db.table("user_notifications").update({
            "read_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).eq("kind", "collection_attention").eq("source_id", job_id).execute()

    # ── New-inventory announcement (admin client) ───────────────────────────

    def record_new_inventory(self, user_id: str, *, count: int) -> bool:
        """Announce that jobs landed which this user has never been matched against.

        Deliberately SPECULATIVE — the opposite posture to `record_fresh_matches`.
        Fresh-matches says "we rated these for you" and so must follow a compute.
        This says "there is new inventory you haven't searched yet"; the user pulls
        the match themselves, which is what keeps compute proportional to intent.

        One live row per user: an unread announcement is updated in place as more
        lands (never stacked), and a read one is not re-raised inside the debounce
        window. Returns True when the inbox actually changed.
        """
        return record_new_inventory(self._admin_db, user_id, count=count)

    def resolve_new_inventory(self, user_id: str) -> None:
        """The user ran the search — the announcement is spent. Admin client: the
        caller is a background match run, not the owner's request."""
        resolve_new_inventory(self._admin_db, user_id)


def _fresh_title(count: int) -> str:
    return f"{count} fresh match{'es' if count != 1 else ''}"


def get_notifications_repository(db: Client = Depends(get_user_db)) -> NotificationsRepository:
    return NotificationsRepository(db, admin_db=get_supabase_admin())
