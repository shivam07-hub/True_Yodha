from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel

_SOURCE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,79}$")


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    return value if isinstance(value, dict) else {}


def _touch_payload(user_id: str, kind: str, value: Any) -> dict[str, Any] | None:
    touch = _as_dict(value)
    source = str(touch.get("source") or "").strip().lower()
    landing_path = str(touch.get("landing_path") or "").strip()
    captured_at = touch.get("captured_at")
    if not _SOURCE_RE.fullmatch(source) or not landing_path.startswith("/") or not captured_at:
        return None
    return {
        "user_id": user_id,
        "touch_kind": kind,
        "source": source,
        "medium": touch.get("medium"),
        "campaign": touch.get("campaign"),
        "content": touch.get("content"),
        "term": touch.get("term"),
        "landing_path": landing_path,
        "captured_at": captured_at,
    }


def record_signup_attribution(db: Any, *, user_id: str, attribution: Any) -> bool:
    data = _as_dict(attribution)
    first = _touch_payload(user_id, "first", data.get("first"))
    latest = _touch_payload(user_id, "latest", data.get("latest"))
    if not first or not latest:
        return False

    db.table("growth_attribution_touchpoints").upsert(
        first,
        on_conflict="user_id,touch_kind",
        ignore_duplicates=True,
    ).execute()
    db.table("growth_attribution_touchpoints").upsert(
        latest,
        on_conflict="user_id,touch_kind",
        ignore_duplicates=False,
    ).execute()
    return True


def record_if_new_signup(
    db: Any,
    *,
    user_id: str,
    is_new_signup: bool,
    attribution: Any,
) -> bool:
    if not is_new_signup or not attribution:
        return False
    return record_signup_attribution(db, user_id=user_id, attribution=attribution)
