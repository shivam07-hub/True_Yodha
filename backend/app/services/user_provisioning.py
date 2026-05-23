"""
user_provisioning.py
Single seed point for user_profiles rows.

Behavior:
  - First call for a user_id → INSERT with generated ninja_name + optional
    referred_by_user_id (from myro_ref cookie).
  - Subsequent calls → refresh email/full_name only. Never overwrite
    ninja_name or referred_by_user_id.

Called from:
  - routers/auth.py signup, login
  - deps.py _ensure_profile_provisioned

Self-referral guard: myro_ref pointing at the same user_id is dropped.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.database import get_supabase_admin
from app.services import ninja_name as nn
from app.services.xp_policy import WELCOME_XP

logger = logging.getLogger(__name__)


def _row_exists(user_id: str) -> bool:
    admin = get_supabase_admin()
    result = (
        admin.table("user_profiles")
        .select("id")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    return bool(result.data)


def _resolve_referrer(myro_ref: str, viewer_user_id: str) -> Optional[str]:
    admin = get_supabase_admin()
    candidate = nn.resolve_user_id_by_name(myro_ref, admin=admin)
    if not candidate or candidate == viewer_user_id:
        return None
    return candidate


def ensure_user_provisioned(
    user_id: str,
    email: str | None,
    full_name: str | None = None,
    myro_ref: str | None = None,
) -> None:
    """Idempotent profile seed. Generates ninja_name on first insert only."""
    if not email:
        return

    admin = get_supabase_admin()

    if _row_exists(user_id):
        # Refresh non-identity fields only. Never touch ninja_name.
        payload: dict[str, object] = {"email": email}
        if full_name:
            payload["full_name"] = full_name
        try:
            admin.table("user_profiles").update(payload).eq("id", user_id).execute()
        except Exception as exc:  # pragma: no cover — log + continue
            logger.warning("Profile refresh failed for %s: %s: %s", user_id, type(exc).__name__, exc)
        return

    # Fresh row — generate slug + resolve referrer.
    try:
        ninja = nn.generate_unique(admin=admin)
    except RuntimeError:  # pragma: no cover — slug space exhausted is operational alarm
        logger.exception("ninja_name generation exhausted on first-insert for %s", user_id)
        ninja = None

    referred_by = None
    if myro_ref:
        referred_by = _resolve_referrer(myro_ref.strip().lower(), user_id)

    # ADR-0004 — welcome XP pre-grants at signup so the first LLM-bearing
    # action (CV upload) charges uniformly. welcome_xp_granted=TRUE on insert
    # is idempotent w.r.t. later code paths that still call grant_welcome_xp.
    payload = {
        "id": user_id,
        "email": email,
        "full_name": full_name,
        "xp_balance": WELCOME_XP,
        "welcome_xp_granted": True,
    }
    if ninja:
        payload["ninja_name"] = ninja
    if referred_by:
        payload["referred_by_user_id"] = referred_by

    try:
        admin.table("user_profiles").upsert(
            payload,
            on_conflict="id",
            ignore_duplicates=True,
        ).execute()
    except Exception as exc:  # pragma: no cover
        logger.warning("Profile provisioning failed for %s: %s: %s", user_id, type(exc).__name__, exc)
