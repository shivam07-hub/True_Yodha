from __future__ import annotations

import re
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin


class CompanyIntelligenceRepository:
    def __init__(self, db: Client) -> None:
        self.db = db

    def get(self, company_name: str, *, limit: int = 20) -> dict[str, Any] | None:
        company = self._resolve(company_name)
        if company is None:
            return None
        company_id = int(company["id"])
        rows = (
            self.db.table("company_skill_profiles")
            .select(
                "skill_id,first_seen_at,last_seen_at,latest_job_count,"
                "peak_job_count,observation_run_count,average_required_level,"
                "trend_direction,latest_source_run_id,"
                "skills(display_name,taxonomy_key,l1_domain)"
            )
            .eq("company_id", company_id)
            .order("latest_job_count", desc=True)
            .limit(max(1, min(limit, 100)))
            .execute()
        ).data or []
        latest_run_id = next(
            (str(row["latest_source_run_id"]) for row in rows if row.get("latest_source_run_id")),
            None,
        )
        as_of = self._source_run_completed_at(latest_run_id)
        skills = [self._shape_skill(row) for row in rows if row.get("skills")]
        names_by_trend: dict[str, list[str]] = {
            "emerging": [], "declining": [], "dormant": []
        }
        for skill in skills:
            trend = skill["trend_signal"]
            if trend in names_by_trend:
                names_by_trend[trend].append(skill["display_name"])
        return {
            "company_id": company_id,
            "company_name": company["canonical_name"],
            "slug": company["slug"],
            "as_of": as_of,
            "source_run_id": latest_run_id,
            "skills": skills,
            "newsletter_summary": {
                "top_skills": [skill["display_name"] for skill in skills[:5]],
                "emerging_skills": names_by_trend["emerging"][:5],
                "declining_skills": names_by_trend["declining"][:5],
                "dormant_skills": names_by_trend["dormant"][:5],
            },
        }

    def _resolve(self, company_name: str) -> dict[str, Any] | None:
        canonical_key = re.sub(r"[^a-z0-9]+", "", company_name.strip().lower())
        rows = self.db.table("companies").select(
            "id,canonical_name,slug"
        ).eq("canonical_key", canonical_key).limit(1).execute().data or []
        if rows:
            return rows[0]
        alias_key = re.sub(r"\s+", " ", company_name.strip().lower())
        aliases = self.db.table("company_aliases").select("company_id").eq(
            "alias_key", alias_key
        ).limit(1).execute().data or []
        if not aliases:
            return None
        companies = self.db.table("companies").select(
            "id,canonical_name,slug"
        ).eq("id", aliases[0]["company_id"]).limit(1).execute().data or []
        return companies[0] if companies else None

    def _source_run_completed_at(self, source_run_id: str | None) -> Any:
        if source_run_id is None:
            return None
        rows = self.db.table("job_source_runs").select("completed_at").eq(
            "id", source_run_id
        ).limit(1).execute().data or []
        return rows[0].get("completed_at") if rows else None

    @staticmethod
    def _shape_skill(row: dict[str, Any]) -> dict[str, Any]:
        skill = row["skills"]
        return {
            "skill_id": row["skill_id"],
            "display_name": skill["display_name"],
            "taxonomy_key": skill["taxonomy_key"],
            "domain": skill.get("l1_domain") or "Other",
            "current_job_count": row["latest_job_count"],
            "peak_job_count": row["peak_job_count"],
            "observation_run_count": row["observation_run_count"],
            "avg_required_level": row.get("average_required_level"),
            "trend_signal": row["trend_direction"],
            "first_seen_at": row["first_seen_at"],
            "last_seen_at": row["last_seen_at"],
        }


def get_company_intelligence_repository(
    db: Client = Depends(get_supabase_admin),
) -> CompanyIntelligenceRepository:
    return CompanyIntelligenceRepository(db)
