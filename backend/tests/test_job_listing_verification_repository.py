from datetime import datetime, timezone

from app.repositories.job_listing_verification import ListingVerificationRepository
from app.services.job_listing_verifier import VerificationResult


class Query:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.payload = None

    def insert(self, payload):
        self.payload = payload
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def eq(self, _key, _value):
        return self

    def execute(self):
        self.db.calls.append((self.table, self.payload))
        return type("Response", (), {"data": []})()


class DB:
    def __init__(self):
        self.calls = []

    def table(self, name):
        return Query(self, name)


class RpcCall:
    def __init__(self, db, name, params, data):
        self.db = db
        self.name = name
        self.params = params
        self._data = data

    def execute(self):
        self.db.calls.append((self.name, self.params))
        return type("Response", (), {"data": self._data})()


class RpcDB:
    """Stands in for the claim/count RPCs. No .table() — reaching for PostgREST
    filters here would reintroduce the bare-`%` query string that 500s."""

    def __init__(self, data):
        self.calls = []
        self._data = data

    def rpc(self, name, params):
        return RpcCall(self, name, params, self._data)

    def table(self, name):  # pragma: no cover — guards against a regression
        raise AssertionError("verification queue must go through the RPC, not PostgREST filters")


def test_pending_count_reads_the_due_rpc() -> None:
    db = RpcDB(42)

    assert ListingVerificationRepository(db).pending_count(stale_days=7) == 42
    assert db.calls == [("count_verify_due", {"p_stale": "7 days"})]


def test_claim_targets_caps_limit_and_passes_staleness() -> None:
    db = RpcDB([])

    targets = ListingVerificationRepository(db).claim_targets(limit=5000, stale_days=3)

    assert targets == []
    assert db.calls == [("claim_verify_targets", {"p_limit": 1000, "p_stale": "3 days"})]


def test_claim_targets_skips_rows_without_a_usable_apply_url() -> None:
    db = RpcDB([
        {"job_id": "a", "job_title": "Engineer", "apply_url": "https://x/1", "listing_confidence": "active"},
        {"job_id": "b", "job_title": "Analyst", "apply_url": None, "listing_confidence": "uncertain"},
        {"job_id": None, "job_title": "Ghost", "apply_url": "https://x/2", "listing_confidence": "uncertain"},
    ])

    targets = ListingVerificationRepository(db).claim_targets(limit=10)

    assert [t.job_id for t in targets] == ["a"]
    # Confidence-agnostic: an already-`active` row is a legitimate re-check target.
    assert targets[0].current_confidence == "active"


def test_strong_closed_verification_starts_quarantine() -> None:
    db = DB()
    now = datetime(2026, 7, 11, tzinfo=timezone.utc)
    repo = ListingVerificationRepository(db, now=lambda: now)

    repo.record(
        VerificationResult(
            "job-1", "closed", "strong", "lever", 404,
            "https://jobs.lever.co/acme/123", {"status_code": 404},
        )
    )

    update = next(payload for table, payload in db.calls if table == "jobs")
    assert update["listing_confidence"] == "closed"
    assert update["is_active"] is False
    assert update["quarantine_until"] == "2026-08-10T00:00:00+00:00"
    assert update["deletion_eligible_at"] == update["quarantine_until"]


def test_live_verification_reactivates_and_resets_misses() -> None:
    db = DB()
    now = datetime(2026, 7, 11, tzinfo=timezone.utc)
    repo = ListingVerificationRepository(db, now=lambda: now)

    repo.record(
        VerificationResult(
            "job-1", "seen_live", "strong", "greenhouse", 200,
            "https://boards.greenhouse.io/acme/jobs/123", {},
        )
    )

    update = next(payload for table, payload in db.calls if table == "jobs")
    assert update["listing_confidence"] == "active"
    assert update["is_active"] is True
    assert update["consecutive_complete_misses"] == 0
    assert update["deletion_eligible_at"] is None


def test_blocked_verification_only_updates_attempt_clock() -> None:
    db = DB()
    repo = ListingVerificationRepository(
        db, now=lambda: datetime(2026, 7, 11, tzinfo=timezone.utc)
    )

    repo.record(VerificationResult("job-1", "blocked", "weak", "workday", 403))

    update = next(payload for table, payload in db.calls if table == "jobs")
    assert set(update) == {"last_verification_attempt_at", "lifecycle_updated_at"}


def test_with_retry_recovers_from_transient_edge_500(monkeypatch) -> None:
    from app.repositories import job_listing_verification as mod
    from postgrest.exceptions import APIError

    monkeypatch.setattr(mod.time, "sleep", lambda _s: None)
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise APIError({"message": "JSON could not be generated", "code": 500})
        return "ok"

    assert mod._with_retry(flaky, attempts=3, base_delay=0) == "ok"
    assert calls["n"] == 3


def test_with_retry_reraises_client_error(monkeypatch) -> None:
    from app.repositories import job_listing_verification as mod
    from postgrest.exceptions import APIError

    monkeypatch.setattr(mod.time, "sleep", lambda _s: None)
    calls = {"n": 0}

    def bad_column():
        calls["n"] += 1
        raise APIError({"message": "column does not exist", "code": "42703"})

    try:
        mod._with_retry(bad_column, attempts=3, base_delay=0)
        raise AssertionError("should have re-raised")
    except APIError:
        pass
    assert calls["n"] == 1  # no retries on a genuine 4xx-class bug
