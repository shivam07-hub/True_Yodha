"""CandidatePool — the union seam that lets a role-right, overlap-poor job reach the brain."""
from __future__ import annotations

from typing import Any

from app.services.matching import candidate_pool


def _overlap(job_id: str, score: float) -> dict[str, Any]:
    return {"job_id": job_id, "title": f"Role {job_id}", "overlap_score": score, "matched_skills": ["python"]}


def _meta(job_id: str, title: str = "Software Engineer") -> dict[str, Any]:
    return {"job_id": job_id, "job_title": title, "company_name": "Co", "job_description": "x" * 2000}


# ── merge_triage_pool ───────────────────────────────────────────────────────────

def test_merge_reserves_pool_share_for_title_only_jobs() -> None:
    # A big overlap set must NOT starve title-only candidates — they get up to half.
    overlap = [_overlap(f"o{i}", 90 - i) for i in range(10)]
    titles = [_meta(f"t{i}") for i in range(10)]
    pool = candidate_pool.merge_triage_pool(overlap, titles, pool_size=10)
    ids = [j["job_id"] for j in pool]
    assert len(pool) == 10
    title_in = [j for j in ids if j.startswith("t")]
    assert len(title_in) == 5  # TITLE_RESERVE_RATIO = 0.5 of 10


def test_merge_title_only_jobs_enter_as_zero_overlap_rows() -> None:
    pool = candidate_pool.merge_triage_pool([_overlap("o1", 80)], [_meta("t1")], pool_size=10)
    t = next(j for j in pool if j["job_id"] == "t1")
    assert t["overlap_score"] == 0.0
    assert t["matched_skills"] == []
    assert t["title"] == "Software Engineer"
    assert len(t["description"]) == 800  # sliced to the get_top_matches contract


def test_merge_dedupes_a_job_selected_by_both() -> None:
    # A job in BOTH sets stays as its richer overlap row, never doubled.
    overlap = [_overlap("j1", 75)]
    pool = candidate_pool.merge_triage_pool(overlap, [_meta("j1")], pool_size=10)
    assert [j["job_id"] for j in pool] == ["j1"]
    assert pool[0]["overlap_score"] == 75  # kept the overlap row, not the zero-overlap one


def test_merge_no_title_candidates_returns_overlap_capped() -> None:
    overlap = [_overlap(f"o{i}", 90 - i) for i in range(20)]
    pool = candidate_pool.merge_triage_pool(overlap, [], pool_size=5)
    assert [j["job_id"] for j in pool] == ["o0", "o1", "o2", "o3", "o4"]


# ── assemble ────────────────────────────────────────────────────────────────────

class _FakeRepo:
    def __init__(self, title_ids: list[str], *, raise_on_roles: bool = False) -> None:
        self._title_ids = title_ids
        self._raise = raise_on_roles
        self.roles_called_with: Any = None

    def get_candidate_job_ids_for_roles(self, role_titles, *, target_location_countries=None):
        self.roles_called_with = (role_titles, target_location_countries)
        if self._raise:
            raise RuntimeError("selector down")
        return self._title_ids

    def get_jobs_by_ids(self, job_ids):
        return [_meta(jid) for jid in job_ids]


def test_assemble_unions_title_selector_onto_overlap() -> None:
    repo = _FakeRepo(["t1", "t2", "o1"])  # o1 already in overlap → deduped
    overlap = [_overlap("o1", 88)]
    pool = candidate_pool.assemble(
        repo, overlap, role_titles=["Software Engineer"],
        target_location_countries=["india"], pool_size=10,
    )
    ids = {j["job_id"] for j in pool}
    assert ids == {"o1", "t1", "t2"}
    assert repo.roles_called_with == (["Software Engineer"], ["india"])


def test_assemble_no_roles_returns_overlap_only() -> None:
    repo = _FakeRepo(["t1"])
    overlap = [_overlap("o1", 88)]
    pool = candidate_pool.assemble(
        repo, overlap, role_titles=[], target_location_countries=None, pool_size=10,
    )
    assert [j["job_id"] for j in pool] == ["o1"]
    assert repo.roles_called_with is None  # selector never queried


def test_assemble_fails_open_when_selector_errors() -> None:
    # A title-selector failure must never break a run — fall back to the overlap pool.
    repo = _FakeRepo([], raise_on_roles=True)
    overlap = [_overlap("o1", 88), _overlap("o2", 70)]
    pool = candidate_pool.assemble(
        repo, overlap, role_titles=["Software Engineer"],
        target_location_countries=None, pool_size=10,
    )
    assert [j["job_id"] for j in pool] == ["o1", "o2"]


def test_assemble_never_adds_cross_band_or_senior_title_candidates() -> None:
    class _EligibilityRepo(_FakeRepo):
        def get_jobs_by_ids(self, job_ids):
            return [
                {
                    "job_id": job_id,
                    "job_title": "Vice President, Corporate Strategy",
                    "role_domain": "Strategy & Consulting",
                    "seniority_level": "executive",
                }
                for job_id in job_ids
            ]

    repo = _EligibilityRepo(["vp1"])
    pool = candidate_pool.assemble(
        repo,
        [_overlap("policy1", 88)],
        role_titles=["Policy Researcher"],
        target_location_countries=None,
        pool_size=10,
        eligibility_profile={
            "target_career_band": "research_people_public_impact",
            "target_seniority": "entry",
        },
    )
    assert [job["job_id"] for job in pool] == ["policy1"]
