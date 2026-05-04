from __future__ import annotations

import time
from collections import Counter
from datetime import date
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin, get_supabase_for_token
from app.deps import get_current_user
from app.repositories.job_skills_read_model import fetch_all_rows, fetch_job_skill_rows, group_job_skill_rows
from app.services.industry_grouping import normalize_industry_group

SKILL_DRILL_DEFAULT_PAGE_SIZE = 50
_ANALYTICS_TTL = 3600  # 1h
_analytics_cache: dict[str | None, tuple[float, dict[str, Any]]] = {}
SKILL_DRILL_MAX_PAGE_SIZE = 100


def _sorted_counter_items(counter: Counter[str]) -> list[tuple[str, int]]:
    return sorted(counter.items(), key=lambda item: (-item[1], item[0].lower(), item[0]))


def _bounded_page(page: int) -> int:
    return max(page, 1)


def _bounded_page_size(page_size: int) -> int:
    return max(1, min(page_size, SKILL_DRILL_MAX_PAGE_SIZE))


class MarketAnalyticsCompiler:
    """Compiles raw market rows into deterministic analytics payloads."""

    def compile(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        company_counts: Counter[str] = Counter()
        industry_counts: Counter[str] = Counter()
        role_counts: Counter[str] = Counter()
        skill_counts: Counter[str] = Counter()
        company_skill_counters: dict[str, Counter[str]] = {}
        industry_skill_counters: dict[str, Counter[str]] = {}
        batch_dates: list[int] = []

        for row in rows:
            company = (row.get("company_name") or "").strip()
            industry = normalize_industry_group(row.get("industry_group"), row.get("industry"))
            role = (row.get("role_domain") or "").strip()
            skills = [skill.strip() for skill in (row.get("main_skills") or []) if skill]

            if company:
                company_counts[company] += 1
                company_skill_counters.setdefault(company, Counter()).update(skills)
            if industry:
                industry_counts[industry] += 1
                industry_skill_counters.setdefault(industry, Counter()).update(skills)
            if role:
                role_counts[role] += 1
            if row.get("batch_date"):
                batch_dates.append(row["batch_date"])
            skill_counts.update(skills)

        company_skills = {
            company: [skill for skill, _ in _sorted_counter_items(counter)[:12]]
            for company, counter in company_skill_counters.items()
        }
        industry_skills = {
            industry: [skill for skill, _ in _sorted_counter_items(counter)[:12]]
            for industry, counter in industry_skill_counters.items()
        }

        return {
            "total_jobs": len(rows),
            "total_companies": len(company_counts),
            "total_industries": len(industry_counts),
            "latest_batch": str(max(batch_dates)) if batch_dates else None,
            "by_company": _sorted_counter_items(company_counts),
            "by_industry": _sorted_counter_items(industry_counts),
            "by_role": _sorted_counter_items(role_counts),
            "top_skills": _sorted_counter_items(skill_counts)[:20],
            "company_skills": company_skills,
            "industry_skills": industry_skills,
        }



class JobsRepository:
    def __init__(self, db: Client) -> None:
        self._db = db
        self._analytics_compiler = MarketAnalyticsCompiler()

    @property
    def client(self) -> Client:
        return self._db

    # ── public / global data ───────────────────────────────────────────────────

    def fetch_analytics_rows(self, role_domain: str | None = None) -> list[dict[str, Any]]:
        query_builder = None
        if role_domain:
            query_builder = lambda query: query.eq("role_domain", role_domain)

        jobs = fetch_all_rows(
            self._db,
            table="jobs",
            columns="job_id, company_name, industry, industry_group, role_domain, batch_date",
            query_builder=query_builder,
        )
        job_ids = {job["job_id"] for job in jobs}

        # Build skill map from FK-enforced job_skills JOIN skills (primary only for analytics)
        primary_skill_rows = fetch_job_skill_rows(
            self._db,
            columns="job_id, skills(taxonomy_key)",
            only_primary=True,
            job_ids=list(job_ids),
        )

        skill_map: dict[str, list[str]] = {}
        for row in primary_skill_rows:
            key = ((row.get("skills") or {}).get("taxonomy_key") or "").strip()
            if key:
                skill_map.setdefault(row["job_id"], []).append(key)

        for job in jobs:
            job["main_skills"] = skill_map.get(job["job_id"], [])

        return jobs

    def compile_market_analytics(self, role_domain: str | None = None) -> dict[str, Any]:
        now = time.monotonic()
        cached = _analytics_cache.get(role_domain)
        if cached is not None and (now - cached[0]) < _ANALYTICS_TTL:
            return cached[1]
        rows = self.fetch_analytics_rows(role_domain=role_domain)
        payload = self._analytics_compiler.compile(rows)
        _analytics_cache[role_domain] = (now, payload)
        return payload

    def search_jobs_by_filters(
        self,
        company: str,
        skill: str,
        *,
        role_domain: str | None = None,
        page: int = 1,
        page_size: int = SKILL_DRILL_DEFAULT_PAGE_SIZE,
    ) -> dict[str, Any]:
        scoped_page = _bounded_page(page)
        scoped_page_size = _bounded_page_size(page_size)
        skill_lower = skill.strip().lower()

        def _query_builder(query: Any) -> Any:
            query = query.eq("company_name", company)
            if role_domain:
                query = query.eq("role_domain", role_domain)
            return query

        rows = fetch_all_rows(
            self._db,
            table="jobs",
            columns="job_id, job_title, company_name, job_description",
            query_builder=_query_builder,
        )

        if not rows:
            return {
                "rows": [],
                "available_total": 0,
                "returned_total": 0,
                "page": scoped_page,
                "page_size": scoped_page_size,
                "has_next_page": False,
            }

        filtered_rows = rows
        if skill_lower:
            candidate_ids = {row["job_id"] for row in rows}
            sk_rows = fetch_job_skill_rows(
                self._db,
                columns="job_id, skills(taxonomy_key)",
                job_ids=list(candidate_ids),
            )
            matching_ids = {
                row["job_id"]
                for row in sk_rows
                if skill_lower == ((row.get("skills") or {}).get("taxonomy_key") or "").strip().lower()
            }
            filtered_rows = [row for row in rows if row["job_id"] in matching_ids]

        filtered_rows = sorted(filtered_rows, key=lambda row: str(row.get("job_id") or ""))
        available_total = len(filtered_rows)
        start = (scoped_page - 1) * scoped_page_size
        end = start + scoped_page_size
        page_rows = filtered_rows[start:end] if start < available_total else []
        returned_total = len(page_rows)

        return {
            "rows": page_rows,
            "available_total": available_total,
            "returned_total": returned_total,
            "page": scoped_page,
            "page_size": scoped_page_size,
            "has_next_page": (start + returned_total) < available_total,
        }

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
        return group_job_skill_rows(fetch_job_skill_rows(self._db))

    def get_candidate_job_ids_for_skills(self, skill_keys: list[str]) -> list[str]:
        """Job_ids that have at least one skill in skill_keys. Used to scope matcher fetch."""
        if not skill_keys:
            return []
        lower_keys = [k.lower() for k in skill_keys]
        skill_id_rows = (
            self._db.table("skills")
            .select("id")
            .in_("taxonomy_key", lower_keys)
            .execute()
        ).data or []
        skill_ids = [r["id"] for r in skill_id_rows]
        if not skill_ids:
            return []
        js_rows = fetch_all_rows(
            self._db,
            table="job_skills",
            columns="job_id",
            query_builder=lambda q: q.in_("skill_id", skill_ids),
        )
        return list({r["job_id"] for r in js_rows})

    def get_all_job_skill_rows(self, *, job_ids: list[str] | None = None) -> list[dict[str, Any]]:
        """Raw job_skills JOIN skills rows for the matcher. No grouping."""
        return fetch_job_skill_rows(self._db, job_ids=job_ids)

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
