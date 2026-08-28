"""Stored job tracks — a user's SECOND and third job searches.

Track 1 is never here. It is the profile (`user_profiles.target_role_titles`),
and a match belonging to it carries `track_id IS NULL`. This repository only
ever sees rows a user deliberately opened; see `app/services/job_tracks.py` for
the rule and why 88 of 106 targeted users must never acquire a row.
"""
from __future__ import annotations

from typing import Any

from supabase import Client

from app.db_safe import safe_read

_COLUMNS = "id, user_id, label, role_titles, position, created_at, updated_at, archived_at"


class JobTracksRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        """Live stored tracks, in render order. Archived rows never surface."""
        rows = safe_read(
            self._db.table("job_tracks")
            .select(_COLUMNS)
            .eq("user_id", user_id)
            .is_("archived_at", "null")
            .order("position"),
            default=[],
            context="job_tracks.list_for_user",
        )
        return list(rows or [])

    def get(self, user_id: str, track_id: int) -> dict[str, Any] | None:
        """One live track the user owns, or None. Ownership is in the filter,
        never assumed from the id — an id is not a capability."""
        row = safe_read(
            self._db.table("job_tracks")
            .select(_COLUMNS)
            .eq("user_id", user_id)
            .eq("id", track_id)
            .is_("archived_at", "null")
            .maybe_single(),
            default=None,
            context="job_tracks.get",
        )
        return row or None

    def create(
        self, user_id: str, *, label: str, role_titles: list[str], position: int
    ) -> dict[str, Any] | None:
        """Open a track at `position`.

        The unique index on (user_id, position) where not archived is what makes
        two concurrent opens resolve to one row rather than two tracks numbered
        the same — the check that picks the position cannot see a commit made
        after it read, so the invariant lives in the statement.
        """
        result = (
            self._db.table("job_tracks")
            .insert(
                {
                    "user_id": user_id,
                    "label": label,
                    "role_titles": role_titles,
                    "position": position,
                }
            )
            .execute()
        )
        return (result.data or [None])[0]

    def update(
        self, user_id: str, track_id: int, patch: dict[str, Any]
    ) -> dict[str, Any] | None:
        result = (
            self._db.table("job_tracks")
            .update({**patch, "updated_at": "now()"})
            .eq("user_id", user_id)
            .eq("id", track_id)
            .is_("archived_at", "null")
            .execute()
        )
        return (result.data or [None])[0]

    def archive(self, user_id: str, track_id: int) -> bool:
        """Close a track. Its matches keep pointing at it; nothing is deleted.

        Archiving rather than deleting is what lets the position free up for a
        new track without orphaning the run that produced those matches.
        """
        result = (
            self._db.table("job_tracks")
            .update({"archived_at": "now()", "updated_at": "now()"})
            .eq("user_id", user_id)
            .eq("id", track_id)
            .is_("archived_at", "null")
            .execute()
        )
        return bool(result.data)


def get_job_tracks_repository(db: Client) -> JobTracksRepository:
    return JobTracksRepository(db)
