"""Durable inbox projection for the live trusted new-inventory count."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

NEW_INVENTORY_DEBOUNCE_HOURS = 24
_BODY = "Myro found these since your last search. Run a search to see which ones fit you."


def reconcile_new_inventory(
    db: Client,
    writer_db: Client,
    user_id: str,
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return no persisted new-role number without re-deriving it first."""
    index = next(
        (
            i
            for i, row in enumerate(rows)
            if row.get("kind") == "new_jobs" and row.get("read_at") is None
        ),
        None,
    )
    if index is None:
        return rows

    pending = rows[index]
    try:
        result = db.rpc(
            "count_new_jobs_for_user",
            {"p_user_id": user_id},
        ).execute()
        live_count = _scalar_int(result.data)
    except Exception as exc:  # noqa: BLE001 — stale projections fail closed
        logger.warning(
            "metric new_inventory.reconcile_failed user=%s error=%s",
            user_id,
            exc.__class__.__name__,
        )
        return _without(rows, index)

    if live_count <= 0:
        try:
            writer_db.table("user_notifications").update({
                "read_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", pending["id"]).eq("user_id", user_id).is_(
                "read_at", "null"
            ).execute()
        except Exception as exc:  # noqa: BLE001 — response still uses live truth
            logger.warning(
                "metric new_inventory.resolve_projection_failed user=%s error=%s",
                user_id,
                exc.__class__.__name__,
            )
        return _without(rows, index)

    patch = {"title": _title(live_count), "body": _BODY, "match_count": live_count}
    if any(pending.get(key) != value for key, value in patch.items()):
        try:
            writer_db.table("user_notifications").update(patch).eq(
                "id", pending["id"]
            ).eq("user_id", user_id).is_("read_at", "null").execute()
        except Exception as exc:  # noqa: BLE001 — derived response stays truthful
            logger.warning(
                "metric new_inventory.update_projection_failed user=%s error=%s",
                user_id,
                exc.__class__.__name__,
            )
    rows[index] = {**pending, **patch}
    return rows


def record_new_inventory(db: Client, user_id: str, *, count: int) -> bool:
    if count <= 0:
        return False

    now = datetime.now(timezone.utc)
    rows = (
        db.table("user_notifications")
        .select("id, read_at, match_count")
        .eq("user_id", user_id)
        .eq("kind", "new_jobs")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    latest = rows[0] if rows else None
    patch = {"title": _title(count), "body": _BODY, "match_count": count}

    if latest and latest.get("read_at") is None:
        if int(latest.get("match_count") or 0) == count:
            return False
        db.table("user_notifications").update(patch).eq("id", latest["id"]).execute()
        return True

    if latest is not None:
        seen_at = datetime.fromisoformat(str(latest["read_at"]).replace("Z", "+00:00"))
        if now - seen_at < timedelta(hours=NEW_INVENTORY_DEBOUNCE_HOURS):
            return False

    db.table("user_notifications").insert({
        "user_id": user_id,
        "kind": "new_jobs",
        **patch,
        "action_url": "/market?search=1",
    }).execute()
    return True


def resolve_new_inventory(db: Client, user_id: str) -> None:
    db.table("user_notifications").update({
        "read_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_id", user_id).eq("kind", "new_jobs").is_(
        "read_at", "null"
    ).execute()


def _title(count: int) -> str:
    return f"{count:,} new role{'s' if count != 1 else ''} to search"


def _scalar_int(value: Any) -> int:
    if isinstance(value, list):
        value = value[0] if value else 0
        if isinstance(value, dict):
            value = next(iter(value.values()), 0)
    return int(value or 0)


def _without(rows: list[dict[str, Any]], index: int) -> list[dict[str, Any]]:
    return [row for i, row in enumerate(rows) if i != index]
