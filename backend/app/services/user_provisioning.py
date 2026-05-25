"""
user_provisioning.py
Single seed point for user_profiles rows.

Behavior:
  - First call for a user_id → INSERT with generated ninja_name + optional
    referred_by_user_id (from myro_ref cookie).
  - Subsequent calls → refresh email/full_name only. Never overwrite
    ninja_name or referred_by_user_id.
  - ADR-0006 LinkedIn fields (linkedin_url/headline/verified) flow through
    set_linkedin_identity(), which is idempotent on linkedin_xp_granted.

Called from:
  - routers/auth.py signup, login, post_signin
  - deps.py _ensure_profile_provisioned

Self-referral guard: myro_ref pointing at the same user_id is dropped.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.database import get_supabase_admin
from app.services import ninja_name as nn
from app.services import xp_service

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


def _vanity_to_url(vanity: str) -> str:
    return f"https://www.linkedin.com/in/{vanity.strip().strip('/')}"


def ensure_user_provisioned(
    user_id: str,
    email: str | None,
    full_name: str | None = None,
    myro_ref: str | None = None,
) -> bool:
    """Idempotent profile seed. Generates ninja_name on first insert only.

    Returns True when a referral was attributed on this call (callers can
    surface the SH7 lineage in their response).
    """
    if not email:
        return False

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
        return False

    # Fresh row — generate slug + resolve referrer.
    try:
        ninja = nn.generate_unique(admin=admin)
    except RuntimeError:  # pragma: no cover — slug space exhausted is operational alarm
        logger.exception("ninja_name generation exhausted on first-insert for %s", user_id)
        ninja = None

    referred_by = None
    if myro_ref:
        referred_by = _resolve_referrer(myro_ref.strip().lower(), user_id)

    # ADR-0004 + migration 20260523b — welcome XP grant is owned by the
    # user_profiles BEFORE INSERT trigger. App code intentionally does NOT
    # set xp_balance / welcome_xp_granted; the DB enforces the invariant so
    # no future code path (admin tool, future migration, race, deploy gap)
    # can skip it.
    payload = {
        "id": user_id,
        "email": email,
        "full_name": full_name,
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
        return False

    return bool(referred_by)


async def set_linkedin_identity(
    user_id: str,
    *,
    vanity: str | None = None,
    headline: str | None = None,
    verified: bool | None = None,
) -> tuple[bool, bool]:
    """ADR-0006 L4 — persist LinkedIn identity claims + one-time 50 XP grant.

    Returns (xp_granted, url_set). Both are idempotent: rerunning with the
    same identity will not double-grant or overwrite a previously-set URL.
    Failure-graceful — missing claims silently skip the relevant write.

    XP grant is delegated to xp_service.grant_linkedin_profile_xp, which
    already enforces the linkedin_xp_granted flag.
    """
    admin = get_supabase_admin()

    payload: dict[str, object] = {}
    if vanity:
        payload["linkedin_url"] = _vanity_to_url(vanity)
    if headline:
        payload["linkedin_headline"] = headline.strip()[:240]
    if verified is not None:
        payload["linkedin_verified"] = bool(verified)

    if not payload:
        return (False, False)

    try:
        existing = (
            admin.table("user_profiles")
            .select("linkedin_url, linkedin_xp_granted")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("LinkedIn read failed for %s: %s: %s", user_id, type(exc).__name__, exc)
        return (False, False)

    row = (existing.data or [{}])[0]
    already_set = bool(row.get("linkedin_url"))

    # Never overwrite a previously-set LinkedIn URL — the user controls
    # disclosure (PV1). Only fill if empty.
    if already_set:
        payload.pop("linkedin_url", None)

    try:
        admin.table("user_profiles").update(payload).eq("id", user_id).execute()
    except Exception as exc:  # pragma: no cover
        logger.warning("LinkedIn write failed for %s: %s: %s", user_id, type(exc).__name__, exc)
        return (False, False)

    url_set = bool(payload.get("linkedin_url"))

    xp_granted = False
    if url_set or vanity:
        try:
            earned, _ = await xp_service.grant_linkedin_profile_xp(user_id)
            xp_granted = earned > 0
        except Exception as exc:  # pragma: no cover
            logger.warning("LinkedIn XP grant failed for %s: %s: %s", user_id, type(exc).__name__, exc)

    return (xp_granted, url_set)
