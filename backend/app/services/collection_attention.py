"""Durable attention checkpoints for saved roles in Collections.

The application row is the source of truth. ``user_notifications`` is a single
actionable projection per saved role, refreshed only when it advances through a
new checkpoint. The listing verifier calls this sweep every 15 minutes, so it
uses the same live/closed trust signal that gates Apply.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

from app.repositories.notifications import NotificationsRepository
from app.repositories.users import UsersRepository
from app.services.xp_policy import FOLLOWED_COMPANY_LIMIT

_LEVELS: tuple[tuple[str, timedelta], ...] = (
    ("review", timedelta(days=1)),
    ("decide", timedelta(days=3)),
    ("urgent", timedelta(days=7)),
)
_RANK = {level: index for index, (level, _) in enumerate(_LEVELS)}


def _as_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _target_level(saved_at: datetime, now: datetime) -> str | None:
    age = now - saved_at
    due = [level for level, after in _LEVELS if age >= after]
    return due[-1] if due else None


def _copy(level: str, title: str, company: str | None) -> tuple[str, str]:
    role = " · ".join(part for part in (company, title) if part) or "A saved role"
    if level == "review":
        return "One saved role needs a decision", f"{role} is still in Collections. Tailor it or pass."
    if level == "decide":
        return "Your saved role is waiting", f"{role} has been saved for a few days. Add a note, tailor, or apply."
    return "Decide on this saved role today", f"{role} is still live. Open Collections to tailor, apply, or pass."


def _autofollow_company(users_repo: UsersRepository, user_id: str, company_name: str | None) -> None:
    """A saved role's company gets auto-followed the moment its listing dies —
    free, silent, skipped at the cap. This is the whole point of the closed
    lifecycle: the interest signal (the user liked THIS company enough to save
    a role there) survives the dead listing and feeds the existing pulse /
    gap-alert / heatmap machinery, so future roles at that company surface
    without the user lifting a finger. Never bumps a company the user chose by
    hitting the cap — silently does nothing instead."""
    if not company_name or not company_name.strip():
        return
    existing = users_repo.get_followed_companies(user_id)
    key = company_name.strip().casefold()
    if any(str(r.get("company_name") or "").strip().casefold() == key for r in existing):
        return
    if len(existing) >= FOLLOWED_COMPANY_LIMIT:
        return
    users_repo.follow_company(user_id, company_name)


def sweep_collection_attention(admin_db: Client, *, limit: int = 500, now: datetime | None = None) -> int:
    """Advance due, live saved applications into one inbox lifecycle row each.

    This is safe to run repeatedly: attention levels are monotonic until an
    explicit snooze resets them, and each projection upserts on the notification
    source key. Inactive listings resolve any existing reminder rather than
    nudging the user toward a dead application.
    """
    current = now or datetime.now(timezone.utc)
    rows = (
        admin_db.table("job_applications")
        .select(
            "id,user_id,job_id,created_at,collection_snoozed_until,"
            "collection_attention_level"
        )
        .eq("status", "saved")
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    ).data or []
    if not rows:
        return 0

    jobs = (
        admin_db.table("jobs")
        .select("job_id,job_title,company_name,is_active,listing_confidence")
        .in_("job_id", list({str(row["job_id"]) for row in rows}))
        .execute()
    ).data or []
    by_job = {str(job["job_id"]): job for job in jobs}
    inbox = NotificationsRepository(admin_db, admin_db)
    users_repo = UsersRepository(admin_db)
    advanced = 0

    for row in rows:
        job_id = str(row["job_id"])
        job = by_job.get(job_id)
        if not job or job.get("is_active") is False or job.get("listing_confidence") in {"closed", "likely_closed"}:
            user_id = str(row["user_id"])
            # `closed` is a terminal attention level (distinct from the
            # review/decide/urgent nudges above) — it doubles as the idempotency
            # guard so a role that dies isn't re-followed every 15-min sweep.
            if row.get("collection_attention_level") != "closed":
                _autofollow_company(users_repo, user_id, job.get("company_name") if job else None)
                admin_db.table("job_applications").update({
                    "collection_attention_level": "closed",
                }).eq("id", row["id"]).execute()
            inbox.resolve_collection_attention(user_id, job_id)
            continue
        snoozed_until = _as_datetime(row.get("collection_snoozed_until"))
        if snoozed_until and snoozed_until > current:
            continue
        saved_at = _as_datetime(row.get("created_at"))
        if not saved_at:
            continue
        target = _target_level(saved_at, current)
        if target is None:
            continue
        previous = row.get("collection_attention_level")
        if previous is not None and _RANK.get(str(previous), -1) >= _RANK[target]:
            continue
        title, body = _copy(target, str(job.get("job_title") or ""), job.get("company_name"))
        inbox.record_collection_attention(str(row["user_id"]), job_id=job_id, title=title, body=body)
        admin_db.table("job_applications").update({
            "collection_attention_level": target,
            "collection_last_reminded_at": current.isoformat(),
        }).eq("id", row["id"]).execute()
        advanced += 1
    return advanced
