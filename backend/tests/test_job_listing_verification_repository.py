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


class TargetQuery:
    def __init__(self):
        self.filters = []

    def select(self, _columns):
        return self

    def in_(self, key, values):
        self.filters.append(("in", key, values))
        return self

    def like(self, key, pattern):
        self.filters.append(("like", key, pattern))
        return self

    def order(self, key, *, desc):
        self.filters.append(("order", key, desc))
        return self

    def limit(self, value):
        self.filters.append(("limit", value))
        return self

    def execute(self):
        return type("Response", (), {"data": []})()


class TargetDB:
    def __init__(self):
        self.query = TargetQuery()

    def table(self, name):
        assert name == "jobs"
        return self.query


class CountQuery:
    def select(self, _columns, count=None):
        self.count = count
        return self

    def in_(self, _key, _values):
        return self

    def like(self, _key, _pattern):
        return self

    def limit(self, _value):
        return self

    def execute(self):
        return type("Response", (), {"count": 42, "data": []})()


class CountDB:
    def table(self, name):
        assert name == "jobs"
        return CountQuery()


def test_pending_count_returns_exact_count() -> None:
    assert ListingVerificationRepository(CountDB()).pending_count() == 42


def test_targets_filter_invalid_or_missing_apply_urls_before_limit() -> None:
    db = TargetDB()

    targets = ListingVerificationRepository(db).targets(limit=20)

    assert targets == []
    assert ("like", "apply_url", "http%") in db.query.filters
    assert ("limit", 20) in db.query.filters


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
