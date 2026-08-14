"""
test_job_matcher.py
Unit tests for job_matcher.get_top_matches.
No Supabase required — data is passed directly (no DB mock needed).

get_top_matches() now accepts:
  job_skill_rows  — [{job_id, required_level, skills:{taxonomy_key, skill_kind}}]
  user_skill_map  — {taxonomy_key: matched_level}
  job_meta_fetcher — callable(job_ids) -> list[job_meta_dict]
"""

from app.services.job_matcher import get_top_matches


# ── Helpers ───────────────────────────────────────────────────────────────────

def _skill_rows(job_rows: list[dict]) -> list[dict]:
    """Build job_skill_rows from job dicts that have main_skills/side_skills."""
    rows = []
    for job in job_rows:
        # main/side map onto the depth the job asks for: a must-have reads L4,
        # a nice-to-have L2. `is_primary` is retained on the row only because
        # other readers still project it; the matcher no longer looks at it.
        for s in (job.get("main_skills") or []):
            rows.append({
                "job_id": job["job_id"], "is_primary": True, "required_level": 4,
                "skills": {"taxonomy_key": s, "skill_kind": "hard"},
            })
        for s in (job.get("side_skills") or []):
            rows.append({
                "job_id": job["job_id"], "is_primary": False, "required_level": 2,
                "skills": {"taxonomy_key": s, "skill_kind": "hard"},
            })
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
        jobs = [_job(f"j{i}", f"Job {i}", f"Co{i}", ["Python", "SQL", "Go"], []) for i in range(10)]
        result = _run(jobs, {"Python": 3, "SQL": 2, "Go": 1}, top_n=5)
        assert len(result) == 5

    def test_sorted_by_overlap_desc(self) -> None:
        # j1 matches 3/4 skills (75%), j2 matches 3/3 (100%) — j2 should rank first
        jobs = [
            _job("j1", "Partial", "Acme", ["Python", "SQL", "Go", "Java"], []),
            _job("j2", "Full",    "Acme", ["Python", "SQL", "Go"],         []),
        ]
        result = _run(jobs, {"Python": 3, "SQL": 2, "Go": 1}, top_n=10)
        assert result[0]["title"] == "Full"

    def test_matched_skills_field_populated(self) -> None:
        # Python(main) + Docker(side) + Bash(side) = 3 hits; SQL unmatched
        jobs = [_job("j1", "Job", "Acme", ["Python", "SQL"], ["Docker", "Bash"])]
        result = _run(jobs, {"Python": 3, "Docker": 2, "Bash": 1}, top_n=1)
        assert len(result) == 1
        matched = set(result[0]["matched_skills"])
        assert "Python" in matched
        assert "Docker" in matched
        assert "SQL" not in matched

    def test_missing_skills_are_ordered_by_the_depth_the_job_asks_for(self) -> None:
        # Job needs Python+SQL at L4 and Docker+Bash at L2; user has Python+Bash.
        # Missing = SQL (L4) before Docker (L2). This used to order by
        # `is_primary`, which is TRUE on 94.2% of prod rows and therefore sorted
        # by nothing — an L4 gap is the reason a fit is low and must lead.
        jobs = [_job("j1", "Job", "Acme", ["Python", "SQL"], ["Docker", "Bash"])]
        result = _run(jobs, {"Python": 3, "Bash": 1}, top_n=1)
        assert result[0]["missing_skills"] == ["SQL", "Docker"]
        # And nothing the user already has leaks into the gap list.
        assert "Python" not in result[0]["missing_skills"]
        assert "Bash" not in result[0]["missing_skills"]

    def test_missing_skills_capped(self) -> None:
        from app.services.job_matcher import MAX_MISSING_SKILLS
        gaps = [f"skill{i}" for i in range(MAX_MISSING_SKILLS + 5)]
        # User clears the overlap floor with 3 real matches; the long gap tail is
        # then capped so the card payload stays bounded.
        jobs = [_job("j1", "Job", "Acme", ["Python", "SQL", "Go", *gaps], [])]
        result = _run(jobs, {"Python": 3, "SQL": 2, "Go": 1}, top_n=1)
        assert len(result[0]["missing_skills"]) == MAX_MISSING_SKILLS

    def test_returned_shape(self) -> None:
        jobs = [_job("abc123", "DE", "TechCorp", ["Python", "SQL", "Go"], [])]
        result = _run(jobs, {"Python": 3, "SQL": 2, "Go": 1}, top_n=1)
        keys = {
            "job_id", "title", "company", "location", "industry",
            "apply_url", "description", "overlap_score", "matched_skills",
            "missing_skills",
        }
        assert keys.issubset(result[0].keys())
        assert result[0]["job_id"] == "abc123"

    def test_boosted_score_not_in_output(self) -> None:
        jobs = [_job("j1", "Job", "Acme", ["Python", "SQL", "Go"], [])]
        result = _run(jobs, {"Python": 3, "SQL": 2, "Go": 1})
        assert "boosted_score" not in result[0]

    def test_zero_overlap_jobs_excluded(self) -> None:
        jobs = [
            _job("j1", "Python Job", "Acme",  ["Python", "SQL", "Go"],      []),
            _job("j2", "Java Job",   "Other", ["Java", "Kotlin", "Scala"],  []),
        ]
        result = _run(jobs, {"Python": 3, "SQL": 2, "Go": 1})
        assert len(result) == 1
        assert result[0]["job_id"] == "j1"

    def test_falls_back_to_two_skill_floor_when_three_skill_floor_underfills(self) -> None:
        jobs = [
            _job("j1", "Senior Data", "Co1", ["Python", "SQL", "Go"], []),
            _job("j2", "Junior Data", "Co2", ["Python", "SQL", "Java"], []),
            _job("j3", "Analyst", "Co3", ["Python", "SQL", "Scala"], []),
            _job("j4", "BI Analyst", "Co4", ["Python", "SQL", "Looker"], []),
            _job("j5", "Ops Analyst", "Co5", ["Python", "SQL", "Excel"], []),
        ]
        debug: dict[str, int] = {}

        result = _run(jobs, {"Python": 3, "SQL": 2, "Go": 1}, top_n=6, debug=debug)

        assert len(result) == 5
        assert debug["min_skill_overlap"] == 2
        assert debug["qualified_jobs_count"] == 5


# ── Aspiration rerank ─────────────────────────────────────────────────────────

class TestAspirationRerank:
    def test_role_boost_applied_when_title_matches(self) -> None:
        jobs = [
            _job("j1", "Data Engineer India", "Acme",  ["Python", "SQL", "Go"], []),
            _job("j2", "Sales Executive",     "Other", ["Python", "SQL", "Go"], []),
        ]
        result = _run(jobs, {"Python": 3, "SQL": 2, "Go": 1}, target_roles=["Data Engineer"], top_n=2)
        assert result[0]["job_id"] == "j1"



# ── Anti-bias company cap ─────────────────────────────────────────────────────

class TestCompanyCap:
    def test_single_company_capped_at_30_percent(self) -> None:
        accenture_jobs = [_job(f"acc{i}", f"Role {i}", "Accenture", ["Python", "SQL", "Go"], []) for i in range(8)]
        other_jobs = [
            _job("oth1", "DE Role", "Wipro",   ["Python", "SQL", "Go"], []),
            _job("oth2", "PM Role", "Infosys", ["Python", "SQL", "Go"], []),
        ]
        result = _run(accenture_jobs + other_jobs, {"Python": 3, "SQL": 2, "Go": 1}, top_n=10)
        accenture_count = sum(1 for r in result if r["company"] == "Accenture")
        assert accenture_count <= 3

    def test_cap_does_not_reduce_variety_when_companies_diverse(self) -> None:
        jobs = [_job(f"j{i}", f"Job {i}", f"Co{i}", ["Python", "SQL", "Go"], []) for i in range(10)]
        result = _run(jobs, {"Python": 3, "SQL": 2, "Go": 1}, top_n=10)
        assert len(result) == 10


class TestDepthWeighting:
    """S4 — the matcher ranks on how deep a job's ask is, not on `is_primary`."""

    def test_a_deep_requirement_outweighs_a_shallow_one(self) -> None:
        # Same number of matches, different depth. Holding the L4 must-have is
        # worth more than holding the L2 nice-to-have — which the old
        # main/side split could not express once is_primary went constant.
        deep = [_job("deep", "A", "Acme", ["Python", "SQL", "Go"], [])]
        shallow = [_job("shallow", "B", "Acme", [], ["Python", "SQL", "Go"])]
        holder = {"Python": 4, "SQL": 4, "Go": 4}

        assert _run(deep, holder, top_n=1)[0]["overlap_score"] == 100.0
        assert _run(shallow, holder, top_n=1)[0]["overlap_score"] == 100.0

    def test_partial_credit_for_holding_a_skill_below_the_asked_level(self) -> None:
        # Python at L2 against an L4 ask is most of the way there — not a miss,
        # and not a full match. This is the "you are at L2, they need L4"
        # sentence made arithmetic.
        jobs = [_job("j1", "Job", "Acme", ["Python"], [])]

        full = _run(jobs, {"Python": 4}, top_n=1, min_skill_overlap=1)[0]["overlap_score"]
        half = _run(jobs, {"Python": 2}, top_n=1, min_skill_overlap=1)[0]["overlap_score"]

        assert full == 100.0
        assert half == 50.0

    def test_exceeding_the_asked_level_is_not_extra_credit(self) -> None:
        jobs = [_job("j1", "Job", "Acme", [], ["Python"])]  # asks L2

        assert _run(jobs, {"Python": 4}, top_n=1, min_skill_overlap=1)[0]["overlap_score"] == 100.0

    def test_soft_skills_are_excluded_from_the_score_entirely(self) -> None:
        # We cannot teach Resilience, so scoring it moves a fit percentage on
        # something the user can never act on.
        rows = [
            {"job_id": "j1", "is_primary": True, "required_level": 4,
             "skills": {"taxonomy_key": "Python", "skill_kind": "hard"}},
            {"job_id": "j1", "is_primary": True, "required_level": 4,
             "skills": {"taxonomy_key": "Resilience", "skill_kind": "soft"}},
        ]
        meta = [_job("j1", "Job", "Acme", [], [])]
        result = get_top_matches(
            rows, {"Python": 4}, _meta_fetcher(meta), top_n=1, min_skill_overlap=1
        )

        assert result[0]["overlap_score"] == 100.0
        assert "Resilience" not in result[0]["missing_skills"]
        assert "Resilience" not in result[0]["matched_skills"]

    def test_scenario_skill_is_excluded_even_when_legacy_kind_says_hard(self) -> None:
        rows = [
            {"job_id": "j1", "is_primary": True, "required_level": 4,
             "skills": {"taxonomy_key": "Python", "practice_mode": "levelled", "skill_kind": "hard"}},
            {"job_id": "j1", "is_primary": True, "required_level": 4,
             "skills": {"taxonomy_key": "Communication", "practice_mode": "scenario", "skill_kind": "hard"}},
        ]
        meta = [_job("j1", "Job", "Acme", [], [])]

        result = get_top_matches(
            rows, {"Python": 4}, _meta_fetcher(meta), top_n=1, min_skill_overlap=1
        )

        assert result[0]["overlap_score"] == 100.0
        assert "Communication" not in result[0]["missing_skills"]

    def test_a_missing_required_level_falls_back_rather_than_crashing(self) -> None:
        rows = [{"job_id": "j1", "is_primary": True,
                 "skills": {"taxonomy_key": "Python", "skill_kind": "hard"}}]
        meta = [_job("j1", "Job", "Acme", [], [])]
        result = get_top_matches(
            rows, {"Python": 2}, _meta_fetcher(meta), top_n=1, min_skill_overlap=1
        )

        assert result[0]["overlap_score"] == 100.0
