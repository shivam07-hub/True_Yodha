from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin, get_supabase_for_token
from app.deps import get_current_user


def _group_job_skills(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse job_skills JOIN skills rows into [{main_skills:[...], side_skills:[...]}] per job."""
    job_map: dict[str, dict[str, list[str]]] = {}
    for row in rows:
        key = ((row.get("skills") or {}).get("taxonomy_key") or "").strip()
        if not key:
            continue
        jid = row["job_id"]
        if jid not in job_map:
            job_map[jid] = {"main_skills": [], "side_skills": []}
        if row.get("is_primary"):
            job_map[jid]["main_skills"].append(key)
        else:
            job_map[jid]["side_skills"].append(key)
    return list(job_map.values())


class JobsRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    @property
    def client(self) -> Client:
        return self._db

    # ── public / global data ───────────────────────────────────────────────────

    def fetch_analytics_rows(self) -> list[dict[str, Any]]:
        cols = "job_id, company_name, industry, batch_date"
        page1 = self._db.table("jobs").select(cols).range(0, 999).execute().data or []
        page2 = self._db.table("jobs").select(cols).range(1000, 9999).execute().data or []
        jobs = page1 + page2

        # Build skill map from FK-enforced job_skills JOIN skills (primary only for analytics)
        sk1 = self._db.table("job_skills").select(
            "job_id, skills(taxonomy_key)"
        ).eq("is_primary", True).range(0, 9999).execute().data or []
        sk2 = self._db.table("job_skills").select(
            "job_id, skills(taxonomy_key)"
        ).eq("is_primary", True).range(10000, 29999).execute().data or []

        skill_map: dict[str, list[str]] = {}
        for row in sk1 + sk2:
            key = ((row.get("skills") or {}).get("taxonomy_key") or "").strip()
            if key:
                skill_map.setdefault(row["job_id"], []).append(key)

        for job in jobs:
            job["main_skills"] = skill_map.get(job["job_id"], [])

        return jobs

    def search_jobs_by_filters(
        self, company: str | None, skill: str | None
    ) -> list[dict[str, Any]]:
        query = self._db.table("jobs").select(
            "job_id, job_title, company_name, job_description"
        )
        if company:
            query = query.eq("company_name", company)
        rows: list[dict[str, Any]] = query.limit(200).execute().data or []

        if skill:
            skill_lower = skill.lower()
            # Resolve matching job_ids via job_skills JOIN skills (FK-enforced taxonomy)
            sk_rows = self._db.table("job_skills").select(
                "job_id, skills(taxonomy_key)"
            ).execute().data or []
            matching_ids = {
                r["job_id"] for r in sk_rows
                if skill_lower in ((r.get("skills") or {}).get("taxonomy_key") or "").lower()
            }
            rows = [r for r in rows if r["job_id"] in matching_ids]

        return rows[:50]

    # ── user skills / demand ───────────────────────────────────────────────────

    def get_user_skills_with_taxonomy(self, user_id: str) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, proficiency_title, skills(taxonomy_key, display_name)")
            .eq("user_id", user_id)
            .execute()
        )
        return result.data or []

    def get_all_jobs_skills(self) -> list[dict[str, Any]]:
        """Returns job skills from the FK-enforced job_skills join table."""
        page1 = self._db.table("job_skills").select(
            "job_id, is_primary, skills(taxonomy_key)"
        ).range(0, 9999).execute().data or []
        page2 = self._db.table("job_skills").select(
            "job_id, is_primary, skills(taxonomy_key)"
        ).range(10000, 29999).execute().data or []
        return _group_job_skills(page1 + page2)

    def get_all_job_skill_rows(self) -> list[dict[str, Any]]:
        """Raw job_skills JOIN skills rows for the matcher. No grouping."""
        page1 = self._db.table("job_skills").select(
            "job_id, is_primary, skills(taxonomy_key)"
        ).range(0, 9999).execute().data or []
        page2 = self._db.table("job_skills").select(
            "job_id, is_primary, skills(taxonomy_key)"
        ).range(10000, 29999).execute().data or []
        return page1 + page2

    def get_jobs_by_ids(self, job_ids: list[str]) -> list[dict[str, Any]]:
        """Fetch job metadata for a specific list of job_ids."""
        if not job_ids:
            return []
        return (
            self._db.table("jobs")
            .select("job_id, job_title, job_description, company_name, industry, location, apply_url")
            .in_("job_id", job_ids)
            .execute()
        ).data or []

    def get_user_target_roles(self, user_id: str) -> list[str]:
        result = (
            self._db.table("user_profiles")
            .select("target_roles")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        return ((result.data if result else {}) or {}).get("target_roles") or []

    # ── job matches ────────────────────────────────────────────────────────────

    def get_user_matches_for_week(
        self, user_id: str, batch_week: date
    ) -> list[dict[str, Any]]:
        # NOTE: join on `jobs` requires RLS to allow `authenticated` reads on public.jobs.
        result = (
            self._db.table("user_job_matches")
            .select(
                "id, job_id, overlap_score, llm_rank, llm_explanation, is_recommended, "
                "action_plan, batch_week, computed_at, matched_skills,"
                "jobs(job_title, company_name, industry, location, apply_url, job_description)"
            )
            .eq("user_id", user_id)
            .eq("batch_week", str(batch_week))
            .order("llm_rank")
            .execute()
        )
        return result.data or []

    def get_user_skill_rows(self, user_id: str) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, skills(taxonomy_key)")
            .eq("user_id", user_id)
            .execute()
        )
        return result.data or []

    def get_user_profile_targeting(self, user_id: str) -> dict[str, Any]:
        result = (
            self._db.table("user_profiles")
            .select("target_roles, target_location")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        return (result.data if result else None) or {}

    # ── applications ───────────────────────────────────────────────────────────

    def get_user_applications(self, user_id: str) -> list[dict[str, Any]]:
        # NOTE: join on `jobs` requires RLS to allow `authenticated` reads on public.jobs.
        result = (
            self._db.table("job_applications")
            .select("*, jobs(job_title, company_name, job_description)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []

    def upsert_application(
        self, user_id: str, job_id: str, updates: dict[str, Any]
    ) -> None:
        self._db.table("job_applications").upsert(
            {"user_id": user_id, "job_id": job_id, **updates},
            on_conflict="user_id,job_id",
        ).execute()

    def get_application_with_job(
        self, user_id: str, job_id: str
    ) -> dict[str, Any] | None:
        # NOTE: join on `jobs` requires RLS to allow `authenticated` reads on public.jobs.
        result = (
            self._db.table("job_applications")
            .select("*, jobs(job_title, company_name, job_description)")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .maybe_single()
            .execute()
        )
        return (result.data if result else None) or None

    def delete_tracker_rows(self, user_id: str, job_id: str) -> None:
        for table_name in ("job_applications", "user_job_matches"):
            (
                self._db.table(table_name)
                .delete()
                .eq("user_id", user_id)
                .eq("job_id", job_id)
                .execute()
            )

    # ── skill gap ──────────────────────────────────────────────────────────────

    def get_job_skills(self, job_id: str) -> dict[str, Any] | None:
        meta = (
            self._db.table("jobs")
            .select("job_id, job_title, company_name")
            .eq("job_id", job_id)
            .maybe_single()
            .execute()
        )
        if not meta or not meta.data:
            return None

        rows = (
            self._db.table("job_skills")
            .select("is_primary, skills(taxonomy_key)")
            .eq("job_id", job_id)
            .execute()
        ).data or []

        main_skills, side_skills = [], []
        for row in rows:
            key = ((row.get("skills") or {}).get("taxonomy_key") or "").strip()
            if not key:
                continue
            (main_skills if row.get("is_primary") else side_skills).append(key)

        return {**meta.data, "main_skills": main_skills, "side_skills": side_skills}

    def get_user_skill_map(self, user_id: str) -> dict[str, int]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, skills(taxonomy_key)")
            .eq("user_id", user_id)
            .execute()
        )
        return {
            row["skills"]["taxonomy_key"].lower(): row["matched_level"]
            for row in (result.data or [])
            if row.get("skills") and row["skills"].get("taxonomy_key")
        }

def get_public_jobs_repository() -> JobsRepository:
    # Public endpoints have no JWT — admin client reads global reference data.
    return JobsRepository(get_supabase_admin())


def get_token_jobs_repository(
    current_user: dict = Depends(get_current_user),
) -> JobsRepository:
    # NOTE: methods joining `jobs` (matches, applications, skill-gap) require
    # RLS to allow `authenticated` reads on public.jobs. Verify in Supabase dashboard.
    return JobsRepository(get_supabase_for_token(current_user["token"]))


def get_admin_jobs_repository() -> JobsRepository:
    """Admin factory — internal/ops scripts only. Not for user-facing routes."""
    return JobsRepository(get_supabase_admin())
