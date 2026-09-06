"""Read models for verified, skill-derived job role families.

`list_role_families` reads the `role_family_labels` Tier-0 snapshot for the
label and open count, and computes only the per-caller skill overlap live. It
used to build the whole label taxonomy per call — four nested regexes over
32,374 live titles, three times — and measured 2,417ms authed against the
~6ms it measures now (migration 20260825100000).
"""

from __future__ import annotations

from typing import Any

from supabase import Client


class RoleFamiliesRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    def list_families(
        self,
        user_id: str,
        *,
        query: str | None = None,
        limit: int = 3,
        families: list[str] | None = None,
        skill_ids: list[int] | None = None,
    ) -> list[dict[str, Any]]:
        """Suggest families by skill overlap, search them by text, or resolve
        specific ones by key.

        `families` is the restore path: a direction the user already chose is
        returned whatever its skill overlap, and whether or not it was found
        through search. Without it, a family picked from the search box could
        not be shown back to them when they stepped backwards through the
        journey — the suggestion list is skill-ranked and would not contain it.
        """
        # `skill_ids` lets a caller that needs BOTH the suggestion list and the
        # user's chosen families read `user_skills` once instead of twice. The
        # two calls are the same method with different arguments, so each was
        # re-reading identical rows for the same user on the same request.
        if skill_ids is None:
            skill_ids = self.user_skill_ids(user_id)
        response = self._db.rpc(
            "list_role_families",
            {
                "p_skill_ids": skill_ids,
                "p_query": query,
                "p_limit": limit,
                "p_families": families,
            },
        ).execute()
        return response.data or []

    def user_skill_ids(self, user_id: str) -> list[int]:
        """The user's skill ids — the shared input to every family lookup."""
        rows = (
            self._db.table("user_skills")
            .select("skill_id")
            .eq("user_id", user_id)
            .execute()
            .data
            or []
        )
        return [int(row["skill_id"]) for row in rows if row.get("skill_id") is not None]

    def resolve_families(
        self, user_id: str, families: list[str], *, skill_ids: list[int] | None = None
    ) -> list[dict[str, Any]]:
        """The user's chosen families, in the order they chose them.

        The RPC orders by market signal; a restored selection has to come back
        in the user's own order, because the first title is the primary role.
        """
        if not families:
            return []
        rows = self.list_families(
            user_id, families=families, limit=len(families), skill_ids=skill_ids
        )
        by_key = {str(row.get("family")): row for row in rows}
        return [by_key[key] for key in families if key in by_key]

    def list_locations(self, family: str, *, query: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
        response = self._db.rpc(
            "list_role_family_locations",
            {"p_family": family, "p_query": query, "p_limit": limit},
        ).execute()
        return response.data or []

    def aspiration_skills(self, families: list[str]) -> dict[str, int]:
        if not families:
            return {}
        rows = self._db.rpc(
            "role_family_aspiration_skills", {"p_families": families}
        ).execute().data or []
        aspiration: dict[str, int] = {}
        for row in rows:
            key = str(row.get("taxonomy_key") or "").strip()
            total = int(row.get("job_count") or 0)
            primary_count = int(row.get("primary_job_count") or 0)
            if not key or not total:
                continue
            if primary_count:
                aspiration[key] = 4 if primary_count / total > 0.5 else 3
            elif row.get("has_side_skill"):
                aspiration[key] = 2
        return aspiration
