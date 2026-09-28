"""Close proof for four read 500s from one capacity storm.

`baseline_state` (GET /users/me), `snapshot_refresh`, `safe_read` (GET
/comments) and `fetch_all_rows` (GET /companies/Okta/jobs) each fired once or
twice on 2026-09-12/13, while the capacity-queue count rose 2,594 → 3,144 and
read timeouts 38 → 47. Railway had rotated their logs by 2026-09-28; the public
routes answered 200 when re-run (0.6–3.2s). A Postgres statement timeout reaches
the app as a plain APIError (57014), so each landed as its own "bug" at
whichever call site the slow query ran from.

A statement timeout is now a 503 under `capacity_503:db.statement_timeout`
(blocked, Overload Policy). If one of these call sites fails for any OTHER
reason it is still an unhandled 500 and reopens its own Notice.
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.security.error_handling import install_error_handling

NOTICE_CAUSE_KEY = "unhandled_500:APIError:app/repositories/users.py:baseline_state"
NOTICE_CAUSE_KEY = "unhandled_500:APIError:app/services/snapshot_refresh.py:request"
NOTICE_CAUSE_KEY = "unhandled_500:APIError:app/db_safe.py:safe_read"
NOTICE_CAUSE_KEY = "unhandled_500:APIError:app/repositories/job_skills_read_model.py:fetch_all_rows"


def test_a_read_cancelled_at_the_statement_timeout_is_not_a_500() -> None:
    app = FastAPI()
    install_error_handling(app)

    @app.get("/users/me")
    def me() -> None:
        raise APIError({"code": "57014", "details": None, "hint": None,
                        "message": "canceling statement due to statement timeout"})

    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.get("/users/me").status_code == 503
