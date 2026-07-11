from app.services.job_history import hydrate_job_snapshot


def test_live_job_wins_over_snapshot() -> None:
    row = {
        "jobs": {"job_title": "Current title"},
        "job_snapshot": {"job_title": "Old title"},
    }

    hydrate_job_snapshot(row)

    assert row["jobs"]["job_title"] == "Current title"


def test_snapshot_restores_retired_job_shape() -> None:
    row = {
        "jobs": None,
        "job_snapshot": {
            "job_title": "Data Analyst",
            "company_name": "Acme",
            "location": "Bengaluru",
        },
    }

    hydrate_job_snapshot(row)

    assert row["jobs"] == row["job_snapshot"]
    assert row["jobs"] is not row["job_snapshot"]


def test_empty_snapshot_does_not_invent_job() -> None:
    row = {"jobs": None, "job_snapshot": {}}

    hydrate_job_snapshot(row)

    assert row["jobs"] is None
