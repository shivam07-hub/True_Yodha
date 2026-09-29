"""The columns the code names, checked against the database at boot.

`464f216c` shipped a read of `user_job_matches.eval_outcome` before the column
existed; `GET /jobs/applications` 500'd until someone applied the migration.
A repo test proves a migration exists (`test_notice_close_match_eval_columns`);
only the running database can say it was applied. `/health/ready` is what a
deploy gate asks.
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app import schema_contract


class _Db:
    def __init__(self, errors: dict[str, APIError | Exception]) -> None:
        self.errors = errors
        self.probed: list[tuple[str, str]] = []

    def table(self, name: str) -> "_Db":
        self._table = name
        return self

    def select(self, cols: str) -> "_Db":
        self.probed.append((self._table, cols))
        return self

    def limit(self, _n: int) -> "_Db":
        return self

    def execute(self) -> None:
        err = self.errors.get(self._table)
        if err:
            raise err


def _api(code: str, message: str) -> APIError:
    return APIError({"code": code, "details": None, "hint": None, "message": message})


def test_every_declared_table_is_probed_with_zero_rows() -> None:
    db = _Db({})
    assert schema_contract.missing(db) == []
    tables = {t for t, _ in db.probed}
    assert {"user_job_matches", "mirror_scores"} <= tables
    cols = dict(db.probed)["user_job_matches"]
    assert "eval_outcome" in cols and "eval_context_hash" in cols


def test_a_column_the_database_lacks_is_named() -> None:
    db = _Db({"user_job_matches": _api(
        "42703", "column user_job_matches.eval_outcome does not exist")})
    assert schema_contract.missing(db) == [
        "user_job_matches: column user_job_matches.eval_outcome does not exist"
    ]


def test_a_slow_or_absent_database_never_blocks_a_deploy() -> None:
    db = _Db({
        "user_job_matches": _api("57014", "canceling statement due to statement timeout"),
        "mirror_scores": ConnectionError("refused"),
    })
    assert schema_contract.missing(db) == []


def test_ready_says_what_is_missing(monkeypatch) -> None:
    from app.main import app

    # No `with`: startup hooks would re-run the probe over this state.
    client = TestClient(app)
    monkeypatch.setattr(schema_contract, "_missing_at_boot", ["user_job_matches: x"])
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["missing"] == ["user_job_matches: x"]

    monkeypatch.setattr(schema_contract, "_missing_at_boot", [])
    assert client.get("/health/ready").status_code == 200
