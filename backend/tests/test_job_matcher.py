"""
test_job_matcher.py
Unit tests for job_matcher.get_top_matches.
No Supabase required — data is passed directly (no DB mock needed).

get_top_matches() now accepts:
  job_skill_rows  — [{job_id, is_primary, skills:{taxonomy_key}}]
  user_skill_map  — {taxonomy_key: matched_level}
  job_meta_fetcher — callable(job_ids) -> list[job_meta_dict]
"""

from app.services.job_matcher import get_top_matches


# ── Helpers ───────────────────────────────────────────────────────────────────

def _skill_rows(job_rows: list[dict]) -> list[dict]:
    """Build job_skill_rows from job dicts that have main_skills/side_skills."""
    rows = []
    for job in job_rows:
        for s in (job.get("main_skills") or []):
            rows.append({"job_id": job["job_id"], "is_primary": True, "skills": {"taxonomy_key": s}})
        for s in (job.get("side_skills") or []):
            rows.append({"job_id": job["job_id"], "is_primary": False, "skills": {"taxonomy_key": s}})
    return rows


def _meta_fetcher(job_rows: list[dict]):
    """Return a fetcher that looks up job metadata from a fixed list."""
    index = {j["job_id"]: j for j in job_rows}
    return lambda ids: [index[i] for i in ids if i in index]


def _job(
    job_id: str,
    title: str,
    company: str,
    main: list[str],
    side: list[str],
    location: str = "India",
) -> dict:
    return {
        "job_id": job_id,
        "job_title": title,
        "company_name": company,
        "industry": "Tech",
        "location": location,
        "apply_url": None,
        "job_description": "Description text",
        "main_skills": main,
        "side_skills": side,
    }


def _run(jobs: list[dict], user_skills: dict, **kwargs):
    return get_top_matches(
        _skill_rows(jobs),
        user_skills,
        job_meta_fetcher=_meta_fetcher(jobs),
        **kwargs,
    )


# ── Basic behaviour ───────────────────────────────────────────────────────────

class TestBasic:
    def test_empty_user_skill_map_returns_empty(self) -> None:
        jobs = [_job("j1", "DE Role", "Acme", ["Python"], [])]
        assert _run(jobs, {}) == []

    def test_jobs_with_no_skills_dropped(self) -> None:
        jobs = [_job("j1", "Mystery", "Acme", [], [])]
        assert _run(jobs, {"Python": 3}) == []

    def test_returns_at_most_top_n(self) -> None:
        jobs = [_job(f"j{i}", f"Job {i}", f"Co{i}", ["Python"], []) for i in range(10)]
        result = _run(jobs, {"Python": 3}, top_n=5)
        assert len(result) == 5

    def test_sorted_by_overlap_desc(self) -> None:
        jobs = [
            _job("j1", "Partial", "Acme", ["Python", "SQL"], []),
            _job("j2", "Full",    "Acme", ["Python"],        []),
        ]
        result = _run(jobs, {"Python": 3}, top_n=10)
        assert result[0]["title"] == "Full"

    def test_matched_skills_field_populated(self) -> None:
        jobs = [_job("j1", "Job", "Acme", ["Python", "SQL"], ["Docker"])]
        result = _run(jobs, {"Python": 3, "Docker": 2}, top_n=1)
        assert len(result) == 1
        matched = set(result[0]["matched_skills"])
        assert "Python" in matched
        assert "Docker" in matched
        assert "SQL" not in matched

    def test_returned_shape(self) -> None:
        jobs = [_job("abc123", "DE", "TechCorp", ["Python"], [])]
        result = _run(jobs, {"Python": 3}, top_n=1)
        keys = {
            "job_id", "title", "company", "location", "industry",
            "apply_url", "description", "overlap_score", "matched_skills",
        }
        assert keys.issubset(result[0].keys())
        assert result[0]["job_id"] == "abc123"

    def test_boosted_score_not_in_output(self) -> None:
        jobs = [_job("j1", "Job", "Acme", ["Python"], [])]
        result = _run(jobs, {"Python": 3})
        assert "boosted_score" not in result[0]

    def test_zero_overlap_jobs_excluded(self) -> None:
        jobs = [
            _job("j1", "Python Job", "Acme",  ["Python"], []),
            _job("j2", "Java Job",   "Other", ["Java"],   []),
        ]
        result = _run(jobs, {"Python": 3})
        assert all(r["job_id"] != "j2" for r in result)


# ── Aspiration rerank ─────────────────────────────────────────────────────────

class TestAspirationRerank:
    def test_role_boost_applied_when_title_matches(self) -> None:
        jobs = [
            _job("j1", "Data Engineer India", "Acme",  ["Python"], []),
            _job("j2", "Sales Executive",     "Other", ["Python"], []),
        ]
        result = _run(jobs, {"Python": 3}, target_roles=["Data Engineer"], top_n=2)
        assert result[0]["job_id"] == "j1"

    def test_location_boost_applied_for_exact_match(self) -> None:
        jobs = [
            _job("j1", "Analyst", "Acme",  ["Python"], [], location="Mumbai, India"),
            _job("j2", "Analyst", "Other", ["Python"], [], location="London, UK"),
        ]
        result = _run(jobs, {"Python": 3}, target_location="India", top_n=2)
        assert result[0]["job_id"] == "j1"

    def test_location_boost_applied_for_remote(self) -> None:
        jobs = [
            _job("j1", "Analyst", "Acme",  ["Python"], [], location="Remote - Worldwide"),
            _job("j2", "Analyst", "Other", ["Python"], [], location="London, UK"),
        ]
        result = _run(jobs, {"Python": 3}, target_location="India", top_n=2)
        assert result[0]["job_id"] == "j1"


# ── Anti-bias company cap ─────────────────────────────────────────────────────

class TestCompanyCap:
    def test_single_company_capped_at_30_percent(self) -> None:
        accenture_jobs = [_job(f"acc{i}", f"Role {i}", "Accenture", ["Python"], []) for i in range(8)]
        other_jobs = [
            _job("oth1", "DE Role", "Wipro",   ["Python"], []),
            _job("oth2", "PM Role", "Infosys", ["Python"], []),
        ]
        result = _run(accenture_jobs + other_jobs, {"Python": 3}, top_n=10)
        accenture_count = sum(1 for r in result if r["company"] == "Accenture")
        assert accenture_count <= 3

    def test_cap_does_not_reduce_variety_when_companies_diverse(self) -> None:
        jobs = [_job(f"j{i}", f"Job {i}", f"Co{i}", ["Python"], []) for i in range(10)]
        result = _run(jobs, {"Python": 3}, top_n=10)
        assert len(result) == 10
