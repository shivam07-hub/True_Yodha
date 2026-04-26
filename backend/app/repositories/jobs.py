from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin, get_supabase_for_token
from app.deps import get_current_user


class JobsRepository:
    def __init__(self, db: Client) -> None:
        self._db = db

    @property
    def client(self) -> Client:
        return self._db

    # ── public / global data ───────────────────────────────────────────────────

    def fetch_analytics_rows(self) -> list[dict[str, Any]]:
        cols = "company_name, industry, main_skills, batch_date"
        page1 = self._db.table("jobs").select(cols).range(0, 999).execute().data
        page2 = self._db.table("jobs").select(cols).range(1000, 9999).execute().data
        return (page1 or []) + (page2 or [])

    def search_jobs_by_filters(
        self, company: str | None, skill: str | None
    ) -> list[dict[str, Any]]:
        query = self._db.table("jobs").select(
            "job_id, job_title, company_name, job_description, main_skills"
        )
        if company:
            query = query.eq("company_name", company)
        rows: list[dict[str, Any]] = query.limit(200).execute().data or []
        if skill:
            skill_lower = skill.lower()
            rows = [
                r for r in rows
                if any(skill_lower in (s or "").lower() for s in (r.get("main_skills") or []))
            ]
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
        page1 = self._db.table("jobs").select("main_skills, side_skills").range(0, 999).execute().data
        page2 = self._db.table("jobs").select("main_skills, side_skills").range(1000, 9999).execute().data
        return (page1 or []) + (page2 or [])

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
            .single()
            .execute()
        )
        return result.data or {}

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
            .single()
            .execute()
        )
        return result.data or None

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
        result = (
            self._db.table("jobs")
            .select("job_id, job_title, company_name, main_skills, side_skills")
            .eq("job_id", job_id)
            .single()
            .execute()
        )
        return result.data or None

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
