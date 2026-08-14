"""Router seam contracts for levelled job gaps."""

from app.routers.upskilling import _required_skills


class _Repo:
    def get_job_skills(self, _job_id: str) -> dict:
        return {
            "job_id": "j1",
            "skills": [
                {
                    "taxonomy_key": "SQL",
                    "required_level": 3,
                    "is_primary": True,
                    "practice_mode": "levelled",
                },
                {
                    "taxonomy_key": "Communication",
                    "required_level": 4,
                    "is_primary": True,
                    "practice_mode": "scenario",
                },
            ],
        }

    def get_user_skill_map(self, _user_id: str) -> dict[str, int]:
        return {"sql": 2, "communication": 4}


def test_required_skills_exposes_only_objective_levelled_gaps() -> None:
    _, required = _required_skills(_Repo(), "j1", "u1")

    assert required == [{
        "skill_key": "SQL",
        "target_level": 3,
        "user_level": 2,
        "is_primary": True,
    }]
