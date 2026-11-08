from app.services.internship_reach import reach


class _Rpc:
    def __init__(self, data: list[dict]) -> None:
        self.data = data
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name: str, params: dict) -> "_Rpc":
        self.calls.append((name, params))
        return self

    def execute(self) -> "_Rpc":
        return self


def test_reach_is_two_counts_and_never_people() -> None:
    db = _Rpc([{"matched": 9, "active_30d": 2}])
    assert reach(db, city=" Bengaluru ", remote=False, skills=["SQL", " ", "Python"]) == {
        "matched": 9,
        "active_30d": 2,
    }
    name, params = db.calls[0]
    assert name == "hosted_match_count"
    assert params == {"p_city": "Bengaluru", "p_remote": False, "p_skills": ["SQL", "Python"]}


def test_reach_with_no_row_is_zero_not_an_error() -> None:
    assert reach(_Rpc([]), city=None, remote=True, skills=[]) == {"matched": 0, "active_30d": 0}


def test_reach_caps_the_skill_list() -> None:
    db = _Rpc([{"matched": 1, "active_30d": 0}])
    reach(db, city="Pune", remote=False, skills=[f"s{i}" for i in range(40)])
    assert len(db.calls[0][1]["p_skills"]) == 12


def test_reach_route_is_not_read_as_a_job_id() -> None:
    """/internships/reach sits beside /internships/{job_id}; order decides it."""
    from fastapi.testclient import TestClient

    from app.database import get_supabase_admin
    from app.main import app

    db = _Rpc([{"matched": 4, "active_30d": 1}])
    app.dependency_overrides[get_supabase_admin] = lambda: db
    try:
        with TestClient(app) as client:
            res = client.get("/jobs/internships/reach", params={"city": "Bengaluru", "skills": "SQL, Python"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    assert res.json() == {"matched": 4, "active_30d": 1}
    assert db.calls[0][1]["p_skills"] == ["SQL", "Python"]
