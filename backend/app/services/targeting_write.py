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
from app.repositories.role_families import RoleFamiliesRepository
from app.repositories.users import UsersRepository
from app.services import onboarding_service
from app.services.career_target import MAX_TARGET_LOCATIONS, record_from_profile
from app.services.job_eligibility import (
    CAREER_BANDS,
    career_band_for_profile,
    chosen_bands_for_profile,
    canonical_source_seniority,
)


logger = logging.getLogger("uvicorn.error")


def demote_catch_all_primary(names: list[str], catch_alls: set[str]) -> list[str]:
    """A residual bucket is never the main role when a real family is in the list.

    titles[0] / target_roles[0] is the primary — score label, snapshot, first
    chip. Catch-alls stay on the list; they just cannot sit first.
    """
    if not names or names[0] not in catch_alls:
        return list(names)
    for index, name in enumerate(names):
        if name not in catch_alls:
            return [name, *names[:index], *names[index + 1 :]]
    return list(names)


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

    # THE BAND, in one place, whether or not titles moved in this same patch.
    #
    # It used to sit inside the `target_role_titles` branch and recompute both
    # columns from the titles, so a band the person had just chosen was erased by
    # the very call that saved their direction — onboarding writes the band and
    # the roles in ONE `save_target`, and the roles won.
    #
    # The rule now: a chosen band wins, and a title only fills a silence.
    #   caller states bands -> they are the answer; the first is primary and the
    #                          whole set is stored, so one pick is distinguishable
    #                          from no pick (see `chosen_bands_for_profile`)
    #   caller says nothing -> an existing answer is left alone. Only while nobody
    #                          has answered does a title derive the primary, which
    #                          is the same "never guesses over an answer" rule
    #                          seniority has always followed.
    if "explored_career_bands" in updates:
        chosen: list[str] = []
        for value in updates.get("explored_career_bands") or []:
            if isinstance(value, str) and value in CAREER_BANDS and value not in chosen:
                chosen.append(value)
        if chosen:
            updates["target_career_band"] = chosen[0]
            updates["explored_career_bands"] = chosen
        else:
            # An explicit empty list clears the answer — it does not clear the
            # feed. Storage falls back to the derived primary, because an empty
            # eligible set is a market that matches nothing (invariant 5).
            updates["target_career_band"] = career_band_for_profile({**before, **updates}) or None
            updates["explored_career_bands"] = []
    elif "target_role_titles" in updates and not chosen_bands_for_profile(before):
        updates["target_career_band"] = career_band_for_profile(updates) or None

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


def _scope_direction(users_repo: UsersRepository, updates: dict[str, Any]) -> None:
    """One corpus read: drop phantom families, and a bucket is never primary.

    The scoping key must name a family that exists. It did not: 41 stored keys
    across 36 users were raw typed titles, and 29 had a scope made entirely of
    them, so the matcher returned nothing. Titles stay; only the scope is
    cleaned. ILIKE-resolving a dropped title is not the repair — it maps "sales"
    to Customer Service.

    The same read carries `is_catch_all`. A catch-all may be on the list; it
    may not sit first when a real family is there. Direct API calls hit this
    too — the picker is not the only door.
    """
    db = getattr(users_repo, "_db", None)
    if db is None:
        return
    families = list(updates.get("target_roles") or [])
    titles = list(updates.get("target_role_titles") or [])
    lookup = list(dict.fromkeys([*families, *titles]))
    flags = RoleFamiliesRepository(db).family_flags(lookup) if lookup else {}

    if families:
        kept = [family for family in families if family in flags]
        if not kept:
            updates.pop("target_roles", None)
            logger.warning("metric targeting.scope_all_unknown dropped=%d", len(families))
        elif kept != families:
            logger.warning(
                "metric targeting.scope_partly_unknown kept=%d dropped=%d",
                len(kept), len(families) - len(kept),
            )
            updates["target_roles"] = kept

    catch_alls = {name for name, bucket in flags.items() if bucket}
    if not catch_alls:
        return
    if updates.get("target_roles"):
        updates["target_roles"] = demote_catch_all_primary(updates["target_roles"], catch_alls)
    if updates.get("target_role_titles"):
        promoted = demote_catch_all_primary(updates["target_role_titles"], catch_alls)
        updates["target_role_titles"] = promoted
        updates["target_role_title"] = promoted[0]


def commit(users_repo: UsersRepository, user_id: str, patch: dict[str, Any]) -> TargetCommit:
    """The only direction write. Snapshot first-class; profile is the projection."""
    before = users_repo.get_profile(user_id) or {}
    updates, lean = split_lean(patch)
    updates = derive(updates, before)
    _scope_direction(users_repo, updates)

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
