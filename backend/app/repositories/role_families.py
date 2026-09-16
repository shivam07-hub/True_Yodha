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
        # Six, not three. Measured on 2026-09-07 against the 14 most recent
        # people who finished Direction: SEVEN of them chose a family that was
        # not in the three they were shown. Widening the list was never the fix
        # — six slots moved exactly one of the fourteen — because the RANKING
        # was a size proxy (migration 20260909100000). It ranks by fit now, and
        # six is the width that fit earns.
        limit: int = 6,
        families: list[str] | None = None,
        skill_ids: list[int] | None = None,
        bands: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Suggest families by skill FIT, search them by text, or resolve
        specific ones by key.

        Fit is prevalence x IDF cosine against the family's own skill profile,
        times log volume — not the count of skills that appear anywhere in it.
        The count made the answer a function of family size: Business Operations
        ranked first for 41.3% of all users, AI/ML for another 30.7%.

        `families` is the restore path: a direction the user already chose is
        returned whatever its skill overlap, and whether or not it was found
        through search. Without it, a family picked from the search box could
        not be shown back to them when they stepped backwards through the
        journey — the suggestion list is skill-ranked and would not contain it.

        `bands` narrows SUGGESTIONS to the Career Bands the caller chose, and is
        ignored by the search and restore branches — deliberately. Seven of the
        fourteen most recent people to finish Direction chose a family nobody had
        suggested to them, reached through the search box; scoping that box to
        the bands they had just picked would shut the door that rescued half of
        them. A family found outside your bands means the bands were wrong, and
        the caller adds the band rather than refusing the pick.
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
                "p_bands": bands or None,
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

    def known_families(self, families: list[str]) -> set[str]:
        """Which of these strings are real directions in the corpus snapshot.

        The scoping key the matcher runs on must name a family that exists. It
        did not: 41 stored keys across 36 users were raw typed titles — "seo",
        "hr", "any", "Teacher or a tele caller" — and 29 users had a scope made
        ENTIRELY of them, so `get_candidate_job_ids_for_roles` (an equality on
        `jobs.role_family`) returned nothing and `role_family_demand` returned
        no market. Silently: no error, just a quietly worse product.

        One indexed read against the 337-row snapshot, and only on a patch that
        actually touches the scope.
        """
        if not families:
            return set()
        rows = (
            self._db.table("role_family_labels")
            .select("family")
            .in_("family", families)
            .execute()
            .data
            or []
        )
        return {str(row["family"]) for row in rows if row.get("family")}

    def list_bands(self, user_id: str, *, skill_ids: list[int] | None = None) -> list[dict[str, Any]]:
        """The four Career Bands, with what each holds and how well it fits.

        Both numbers come from snapshots. Counting live jobs by band costs 7,080ms
        warm on this instance (12,497 blocks read); `career_band_scope` holds the
        four totals, refreshed from the scan `refresh_role_family_labels` already
        makes. Fit is index-only over `role_family_skill_weights` — 9.2ms measured.
        """
        if skill_ids is None:
            skill_ids = self.user_skill_ids(user_id)
        response = self._db.rpc("career_band_options", {"p_skill_ids": skill_ids}).execute()
        return response.data or []

    def list_locations(self, family: str, *, query: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
        response = self._db.rpc(
            "list_role_family_locations",
            {"p_family": family, "p_query": query, "p_limit": limit},
        ).execute()
        return response.data or []

    def core_skills(self, families: list[str]) -> dict[str, list[str]]:
        """The vocabulary each direction is graded against (`direction_fit`).

        One indexed read over the 337-row snapshot, returning the twelve most
        demanded skill names per family. It is a snapshot column rather than a
        live aggregate because the aggregate is the expensive half: ranking
        `role_family_profile` per request measured 15ms for three families and
        grows with the corpus, while this read is the same shape as every other
        label read on the page.

        A family missing from the snapshot is absent from the result — the
        caller grades against what exists and reads the rest as unknown, never
        as "nothing fits".
        """
        if not families:
            return {}
        rows = (
            self._db.table("role_family_labels")
            .select("family, core_skills")
            .in_("family", families)
            .execute()
            .data
            or []
        )
        return {
            str(row["family"]): [str(s) for s in (row.get("core_skills") or [])]
            for row in rows
            if row.get("family")
        }
