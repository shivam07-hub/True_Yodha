"""Idempotent delivery primitives for durable feedback outboxes."""

from __future__ import annotations

from hashlib import sha256
import json
from typing import Any


class FeedbackIdempotencyConflict(Exception):
    """The same delivery key was used for different feedback content."""


def feedback_fingerprint(
    feedback_type: str,
    payload: dict[str, Any],
) -> str:
    canonical = json.dumps(
        {"type": feedback_type, "payload": payload},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return sha256(canonical.encode("utf-8")).hexdigest()


def find_feedback_receipt(
    db: Any,
    *,
    idempotency_key: str,
    user_id: str | None,
) -> dict[str, Any] | None:
    query = (
        db.table("user_feedback")
        .select("id, idempotency_fingerprint")
        .eq("idempotency_key", idempotency_key)
    )
    if user_id:
        query = query.eq("user_id", user_id)
    else:
        query = query.is_("user_id", "null")
    rows = query.limit(1).execute().data or []
    return rows[0] if rows else None


def ensure_matching_fingerprint(
    receipt: dict[str, Any],
    expected_fingerprint: str,
) -> None:
    if receipt.get("idempotency_fingerprint") != expected_fingerprint:
        raise FeedbackIdempotencyConflict
