"""search_queries — best-effort intent logging. A logging failure must never
propagate (it would break the user's search); reads power the distiller."""
from __future__ import annotations

from app.repositories.search_queries import SearchQueriesRepository


class _RaisingTable:
    def insert(self, *_a, **_k):
        raise RuntimeError("table missing (pre-migration)")


class _RaisingDB:
    def table(self, _name):
        return _RaisingTable()


class _CapturingTable:
    def __init__(self, sink: list):
        self._sink = sink

    def insert(self, payload):
        self._sink.append(payload)
        return self

    def execute(self):
        return self


class _CapturingDB:
    def __init__(self):
        self.rows: list = []

    def table(self, _name):
        return _CapturingTable(self.rows)


def test_log_swallows_errors_never_raises() -> None:
    # Pre-migration / transient failure must degrade silently, not 500 the search.
    SearchQueriesRepository(_RaisingDB()).log(surface="landing", query="remote pm")


def test_log_records_payload() -> None:
    db = _CapturingDB()
    SearchQueriesRepository(db).log(
        surface="market", query="  data roles  ", user_id="u1",
        parsed={"role": "data"}, result_count=7,
    )
    assert db.rows[0]["surface"] == "market"
    assert db.rows[0]["user_id"] == "u1"
    assert db.rows[0]["result_count"] == 7
