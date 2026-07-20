from typing import Any

from app.repositories import jobs as jobs_module
from app.repositories.jobs import JobsRepository


def _repo(monkeypatch, job_rows: list[dict], skill_rows: list[dict]) -> JobsRepository:
    # fetch_all_rows here returns the ALREADY week-filtered jobs (the fake ignores
    # the query_builder), i.e. it stands in for "jobs first seen in the last 7d".
    monkeypatch.setattr(jobs_module, "fetch_all_rows", lambda *a, **k: job_rows)
    monkeypatch.setattr(jobs_module, "fetch_job_skill_rows_for_ids", lambda *a, **k: skill_rows)
    jobs_module._gap_signal_cache.clear()
    return JobsRepository(db=object(), admin_db=object())  # type: ignore[arg-type]


def test_new_role_skill_counts_maps_matched_skills(monkeypatch) -> None:
    repo = _repo(
        monkeypatch,
        job_rows=[
            {"job_id": "j1", "company_name": "Acme"},
            {"job_id": "j2", "company_name": "Acme"},
        ],
        skill_rows=[
            {"job_id": "j1", "skills": {"display_name": "Artificial Intelligence"}},
            {"job_id": "j2", "skills": {"display_name": "Artificial Intelligence"}},
            {"job_id": "j1", "skills": {"display_name": "Python"}},  # not requested → ignored
        ],
    )
    matrix = repo.fetch_new_role_skill_counts(["Acme"], ["Artificial Intelligence"])
    assert matrix == {"Acme": {"Artificial Intelligence": 2}}


def test_new_role_skill_counts_zero_when_no_new_jobs(monkeypatch) -> None:
    repo = _repo(monkeypatch, job_rows=[], skill_rows=[])
    matrix = repo.fetch_new_role_skill_counts(["Acme", "Globex"], ["AI"])
    assert matrix == {"Acme": {"AI": 0}, "Globex": {"AI": 0}}


def test_new_role_skill_counts_empty_input_short_circuits() -> None:
    repo = JobsRepository(db=object(), admin_db=object())  # type: ignore[arg-type]
    assert repo.fetch_new_role_skill_counts([], ["AI"]) == {}
    assert repo.fetch_new_role_skill_counts(["Acme"], []) == {"Acme": {}}


def test_new_role_skill_counts_case_insensitive_skill_match(monkeypatch: Any) -> None:
    repo = _repo(
        monkeypatch,
        job_rows=[{"job_id": "j1", "company_name": "Acme"}],
        skill_rows=[{"job_id": "j1", "skills": {"display_name": "python"}}],
    )
    matrix = repo.fetch_new_role_skill_counts(["Acme"], ["Python"])
    assert matrix == {"Acme": {"Python": 1}}
