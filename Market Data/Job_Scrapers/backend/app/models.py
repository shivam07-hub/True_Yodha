"""
SQLAlchemy ORM models.
Job table mirrors the 24-column normalized CSV schema.
Candidate + MatchResult tables support the matching pipeline.
"""

from datetime import datetime, date

from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, Date, DateTime,
    ForeignKey, Index,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Job(Base):
    """One row per scraped job listing."""
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ── Identity ───────────────────────────────────────────────────
    job_id = Column(String(100), index=True)           # external id from career site
    title = Column(String(300), index=True)
    company_name = Column(String(200), index=True)
    business_unit = Column(String(300))
    job_url = Column(Text)
    source_platform = Column(String(100))

    # ── Description & Skills ───────────────────────────────────────
    raw_jd_text = Column(Text)                         # full job description
    skills_required = Column(Text)                     # comma-separated
    skills_preferred = Column(Text)                    # comma-separated

    # ── Experience & Seniority ─────────────────────────────────────
    min_years_experience = Column(Float)
    max_years_experience = Column(Float)
    seniority_level = Column(String(50), index=True)   # junior/mid/senior/lead

    # ── Location ───────────────────────────────────────────────────
    location_city = Column(String(200), index=True)
    location_country = Column(String(100))
    work_mode = Column(String(50), index=True)         # onsite/hybrid/remote

    # ── Employment Details ─────────────────────────────────────────
    employment_type = Column(String(50))               # full-time/part-time/contract
    degree_required = Column(String(200))
    degree_preferred_field = Column(String(300))
    industry = Column(String(200))

    # ── Salary (mostly empty for now) ──────────────────────────────
    salary_min = Column(Float)
    salary_max = Column(Float)
    salary_currency = Column(String(10))

    # ── Metadata ───────────────────────────────────────────────────
    date_posted = Column(String(50))
    is_active = Column(Boolean, default=True, index=True)

    # ── Internal timestamps ────────────────────────────────────────
    ingested_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_jobs_company_city", "company_name", "location_city"),
        Index("ix_jobs_active_seniority", "is_active", "seniority_level"),
    )

    def skills_required_list(self) -> list[str]:
        """Return skills_required as a cleaned list."""
        if not self.skills_required:
            return []
        return [s.strip().lower() for s in self.skills_required.split(",") if s.strip()]

    def skills_preferred_list(self) -> list[str]:
        if not self.skills_preferred:
            return []
        return [s.strip().lower() for s in self.skills_preferred.split(",") if s.strip()]

    def all_skills(self) -> set[str]:
        """Union of required + preferred skills."""
        return set(self.skills_required_list() + self.skills_preferred_list())


class Candidate(Base):
    """One row per CV submission from the Google Form."""
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200))
    email = Column(String(200), index=True)
    phone = Column(String(50))

    # ── From Google Form ───────────────────────────────────────────
    years_experience = Column(String(20))              # "0-2", "3-5", "6-10", "10+"
    preferred_roles = Column(Text)                     # comma-separated
    preferred_cities = Column(Text)                    # comma-separated
    work_mode = Column(String(50))                     # onsite/hybrid/remote/any

    # ── Parsed from CV ─────────────────────────────────────────────
    cv_file_url = Column(Text)
    cv_raw_text = Column(Text)                         # extracted PDF text
    cv_parsed_skills = Column(Text)                    # comma-separated, from Claude
    cv_parsed_titles = Column(Text)                    # past job titles
    cv_parsed_summary = Column(Text)                   # Claude-generated summary

    # ── Metadata ───────────────────────────────────────────────────
    submitted_at = Column(DateTime, default=datetime.utcnow)
    matched_at = Column(DateTime)
    status = Column(String(30), default="pending")     # pending / matching / done / error

    matches = relationship("MatchResult", back_populates="candidate")


class MatchResult(Base):
    """One row per candidate↔job match (Top N stored)."""
    __tablename__ = "match_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), index=True)

    rank = Column(Integer)                             # 1–5
    score = Column(Float)                              # 0–100
    matching_skills = Column(Text)                     # comma-separated
    missing_skills = Column(Text)                      # comma-separated
    reasoning = Column(Text)                           # 2-3 sentence explanation

    created_at = Column(DateTime, default=datetime.utcnow)

    candidate = relationship("Candidate", back_populates="matches")
    job = relationship("Job")
