"""The ONE way a targeting patch reaches storage.

Callers: `PUT /users/me/profile`, `POST /preflight/run`, and `save_target`
(onboarding, intent chat, point-of-use role edit). They must derive the same
columns, because what they write is read back by `targeting.for_ranking` and
cached forever per (user, job).

`CareerTargetSnapshot` is the unit of truth for a direction change. Profile
columns stay the compatibility projection until every consumer reads the
snapshot. `target_roles` is derived from the selected role family, never from
title ILIKE.
"""
from __future__ import annotations

import logging
from typing import Any

from app.database import get_supabase_admin
from app.repositories.users import UsersRepository
from app.services import onboarding_service
from app.services.career_target import MAX_TARGET_LOCATIONS, record_from_profile
from app.services.job_eligibility import (
    career_band_for_profile,
    explored_bands_for_profile,
    canonical_source_seniority,
)


logger = logging.getLogger("uvicorn.error")


def derive(updates: dict[str, Any], before: dict[str, Any]) -> dict[str, Any]:
    """Expand a caller's patch into the columns storage actually holds.

    `target_roles` (the matcher's taxonomy cluster union) is derived from the
    selected role FAMILY, not the human titles. When the caller does not supply
    a family — the pre-flight `POST /preflight/run` path never does; the payload
    projector emits titles only — a naive `role_title_updates(titles)` returns
    an EMPTY `target_roles`, and writing that empty list is the "market has
    nothing" bug (invariant 5): the feed scopes on this column, and an empty
    scoping key tells the user no roles exist.

    So when the caller stays silent on family, we KEEP the stored families
    rather than overwrite them. Only a caller that actually resolved a family
    (settings/profile edit via the corpus-backed role picker) may change it, and
    it does so by supplying `role_family`/`role_families` explicitly — not
    implicitly by omission.
    """
    updates = dict(updates)
    if "target_role_titles" in updates:
        titles = updates.pop("target_role_titles")
        family = updates.pop("role_family", None)
        families = updates.pop("role_families", None)
        supplied = family is not None or families is not None
        updates.pop("target_roles", None)
        updates.pop("target_role_title", None)
        derived = onboarding_service.role_title_updates(
            titles, role_family=family, role_families=families
        )
        if not supplied:
            # Preserve the stored family — see docstring. `save_target` follows
            # the same rule for point-of-use edits that predate corpus families.
            stored = [
                str(value).strip()
                for value in (before.get("target_roles") or [])
                if str(value).strip()
            ]
            derived["target_roles"] = stored
        # An empty scoping key is not a narrower search, it is no search.
        # Only on the IMPLICIT path: an explicit `role_families=[]` is a
        # deliberate clear and the caller owns it (asserted in
        # `test_derive_writes_empty_family_when_caller_explicitly_says_none`).
        # `target_roles` is what the feed and the matcher scope on, so writing
        # [] beside a non-empty title list produces the state 3 users are in
        # today: a stated direction that matches nothing, reported to them as
        # "the market has nothing" (invariant 5). The key is dropped rather
        # than written, so whatever is stored survives until a caller that
        # actually resolved a family replaces it.
        if (
            not supplied
            and derived.get("target_roles") == []
            and derived.get("target_role_titles")
        ):
            derived.pop("target_roles")
            logger.warning(
                "metric targeting.roles_would_have_emptied titles=%d",
                len(derived["target_role_titles"]),
            )
        updates.update(derived)
        updates["target_career_band"] = career_band_for_profile(updates) or None
        updates["explored_career_bands"] = explored_bands_for_profile(
            {**before, **updates},
            primary=updates["target_career_band"] or "",
        )
    if "target_seniority" in updates:
        raw = updates.get("target_seniority")
        if str(raw or "").strip().lower() == "any":
            updates["target_seniority"] = "any"
        else:
            updates["target_seniority"] = canonical_source_seniority(raw) or None
    if "target_locations" in updates:
        seen: list[str] = []
        for value in updates.get("target_locations") or []:
            text = str(value or "").strip()
            if text and text not in seen:
                seen.append(text)
            if len(seen) >= MAX_TARGET_LOCATIONS:
                break
        updates["target_locations"] = seen
    return updates


def split_lean(updates: dict[str, Any]) -> tuple[dict[str, Any], list[str] | None]:
    """Pull `lean` out of a patch. Returns the rest, and the leans (or None when
    the caller never mentioned them — which must not clear the stored ones)."""
    updates = dict(updates)
    lean = updates.pop("lean", None)
    if lean is None:
        return updates, None
    return updates, [str(v).strip() for v in lean if str(v).strip()]


def apply(users_repo: UsersRepository, user_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    """Derive, route the lean, write the snapshot + projection, return the profile."""
    return commit(users_repo, user_id, patch).profile


class TargetCommit:
    __slots__ = ("profile", "direction_changed", "leans_changed")

    def __init__(
        self,
        profile: dict[str, Any] | None,
        direction_changed: bool,
        leans_changed: bool,
    ) -> None:
        self.profile = profile
        self.direction_changed = direction_changed
        self.leans_changed = leans_changed


def commit(users_repo: UsersRepository, user_id: str, patch: dict[str, Any]) -> TargetCommit:
    """The only direction write. Snapshot first-class; profile is the projection."""
    before = users_repo.get_profile(user_id) or {}
    updates, lean = split_lean(patch)
    updates = derive(updates, before)

    leans_changed = False
    if lean is not None:
        leans_changed = onboarding_service.replace_authored_leans(
            get_supabase_admin(), user_id, lean
        )
    direction_changed = False
    if updates:
        direction_changed = bool(users_repo.update_profile(user_id, updates))
    profile = users_repo.get_profile(user_id)
    db = getattr(users_repo, "_db", None)
    if db is not None:
        record_from_profile(db, user_id, before, profile or {})
    return TargetCommit(profile, direction_changed, leans_changed)
