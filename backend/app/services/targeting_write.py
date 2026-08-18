"""The ONE way a targeting patch reaches storage.

Two callers now write the user's direction — `PUT /users/me/profile` (the
settings/profile edit) and `POST /preflight/run` (the signed-off order). They
must derive the same things from the same input, because what they write is read
back by `targeting.for_ranking` and cached forever per (user, job): a second
derivation that rounds a career band differently would produce two users' worth
of verdicts for one user.

Three derivations live here, none of them optional:

- **Role titles are the source of record; `target_roles` (the matcher's taxonomy
  cluster union) is always derived from them.** A raw `target_roles` sent
  alongside titles is dropped rather than merged — that is the split-brain this
  rule exists to prevent.
- Career band + explored bands follow from the titles.
- **A lean has no column** — it IS an authored `preference` fact — so it is
  routed to the memory writer instead of being handed to `update_profile`,
  which would try to set a field that does not exist.
"""
from __future__ import annotations

from typing import Any

from app.database import get_supabase_admin
from app.repositories.users import UsersRepository
from app.services import onboarding_service
from app.services.job_eligibility import (
    career_band_for_profile,
    explored_bands_for_profile,
    target_seniority_for_profile,
)


def derive(updates: dict[str, Any], before: dict[str, Any]) -> dict[str, Any]:
    """Expand a caller's patch into the columns storage actually holds.

    `target_roles` (the matcher's taxonomy cluster union — CONTEXT.md calls it
    the matcher and aspiration ILIKE keys) is derived from the selected role
    FAMILY, not the human titles. When the caller does not supply a family — the
    pre-flight `POST /preflight/run` path never does; the payload projector emits
    titles only — a naive `role_title_updates(titles)` returns an EMPTY
    `target_roles`, and writing that empty list is the "market has nothing" bug
    (invariant 5): the feed scopes on this column, and an empty scoping key
    tells the user no roles exist.

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
        updates.update(derived)
        updates["target_career_band"] = career_band_for_profile(updates) or None
        updates["explored_career_bands"] = explored_bands_for_profile(
            {**before, **updates},
            primary=updates["target_career_band"] or "",
        )
    if "target_seniority" in updates:
        updates["target_seniority"] = target_seniority_for_profile(updates)
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
    """Derive, route the lean, write, and return the stored profile.

    Reaching here means the user pressed Save or Run — this is a commit point,
    never a draft write.
    """
    before = users_repo.get_profile(user_id) or {}
    updates, lean = split_lean(patch)
    updates = derive(updates, before)

    if lean is not None:
        onboarding_service.replace_authored_leans(get_supabase_admin(), user_id, lean)
    if updates:
        users_repo.update_profile(user_id, updates)
    return users_repo.get_profile(user_id)
