from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.services import job_liveness
from app.services.job_liveness import check_liveness


def _iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat()


class FakeRepo:
    def __init__(self, row):
        self.row = row
        self.attempted = []
        self.recorded = []

    def snapshot(self, job_id):
        return self.row

    def mark_attempted(self, job_id):
        self.attempted.append(job_id)

    def record(self, result):
        self.recorded.append(result)


@pytest.fixture
def patch_repo(monkeypatch):
    def _apply(row):
        repo = FakeRepo(row)
        monkeypatch.setattr(job_liveness, "ListingVerificationRepository", lambda _db: repo)
        return repo

    return _apply


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_missing_job_returns_none(patch_repo):
    patch_repo(None)
    assert await check_liveness(object(), "nope") is None


@pytest.mark.asyncio
async def test_fresh_verdict_is_served_from_cache(patch_repo):
    repo = patch_repo({
        "job_id": "j1",
        "apply_url": "https://boards.greenhouse.io/x/jobs/1",
        "job_title": "Data Engineer",
        "listing_confidence": "active",
        "last_verification_attempt_at": _iso(timedelta(hours=-1)),
        "last_verified_live_at": _iso(timedelta(hours=-1)),
        "last_conclusive_verification_at": _iso(timedelta(hours=-1)),
    })

    verdict = await check_liveness(object(), "j1")

    assert verdict.state == "live"
    assert verdict.from_cache is True
    # No fetch, no write — a repeated open inside the window is free.
    assert repo.attempted == []


@pytest.mark.asyncio
async def test_a_failed_check_does_not_renew_the_previous_verdict(patch_repo):
    """The 509906 bug, at the gate.

    The row was attempted minutes ago and still reads `active` — but the attempt
    never concluded, so the `active` is left over from a check 45 days old.
    Serving it from cache is what let five consecutive blocked fetches keep a
    dead listing looking verified. Freshness must require a verdict, not an
    attempt.
    """
    repo = patch_repo({
        "job_id": "j1",
        "apply_url": "https://boards.greenhouse.io/x/jobs/1",
        "job_title": "Data Engineer",
        "listing_confidence": "active",
        "last_verification_attempt_at": _iso(timedelta(minutes=-5)),
        "last_verified_live_at": _iso(timedelta(days=-45)),
        "last_conclusive_verification_at": _iso(timedelta(days=-45)),
    })

    await check_liveness(object(), "j1")

    assert repo.attempted == ["j1"]


@pytest.mark.asyncio
async def test_claimed_but_unresolved_row_is_not_treated_as_fresh(patch_repo):
    """The sweep stamps attempt-time on claim. A row claimed then crashed still
    reads `uncertain`, and must NOT be served as a recent check."""
    repo = patch_repo({
        "job_id": "j1",
        "apply_url": "https://boards.greenhouse.io/x/jobs/1",
        "job_title": "Data Engineer",
        "listing_confidence": "uncertain",
        "last_verification_attempt_at": _iso(timedelta(minutes=-5)),
        "last_verified_live_at": None,
    })

    def handler(request):
        return httpx.Response(404, text="not found")

    async with _client(handler) as client:
        verdict = await check_liveness(object(), "j1", client=client)

    assert verdict.from_cache is False
    assert verdict.state == "closed"
    assert repo.attempted == ["j1"]


@pytest.mark.asyncio
async def test_stale_row_is_verified_live_and_recorded(patch_repo):
    repo = patch_repo({
        "job_id": "j1",
        "apply_url": "https://boards.greenhouse.io/x/jobs/1",
        "job_title": "Data Engineer",
        "listing_confidence": "active",
        "last_verification_attempt_at": _iso(timedelta(days=-9)),
        "last_verified_live_at": _iso(timedelta(days=-9)),
    })

    def handler(request):
        return httpx.Response(200, text="Data Engineer — apply now")

    async with _client(handler) as client:
        verdict = await check_liveness(object(), "j1", client=client)

    assert verdict.state == "live"
    assert verdict.from_cache is False
    assert [r.result for r in repo.recorded] == ["seen_live"]


@pytest.mark.asyncio
async def test_blocked_ats_reports_unknown_not_closed(patch_repo):
    """A 429 from an ATS is not evidence the role is gone. Claiming `closed`
    here would be its own trust bug."""
    patch_repo({
        "job_id": "j1",
        "apply_url": "https://boards.greenhouse.io/x/jobs/1",
        "job_title": "Data Engineer",
        "listing_confidence": "active",
        "last_verification_attempt_at": None,
        "last_verified_live_at": None,
    })

    def handler(request):
        return httpx.Response(429, text="rate limited")

    async with _client(handler) as client:
        verdict = await check_liveness(object(), "j1", client=client)

    assert verdict.state == "unknown"


@pytest.mark.asyncio
async def test_row_without_apply_url_is_unverified_not_fetched(patch_repo):
    repo = patch_repo({
        "job_id": "ext_1",
        "apply_url": None,
        "job_title": "Imported role",
        "listing_confidence": "uncertain",
        "last_verification_attempt_at": None,
        "last_verified_live_at": None,
    })

    verdict = await check_liveness(object(), "ext_1")

    assert verdict.state == "unverified"
    assert repo.attempted == []


@pytest.mark.asyncio
async def test_retired_row_is_closed_without_a_fetch(patch_repo):
    repo = patch_repo({
        "job_id": "j1",
        "apply_url": "https://boards.greenhouse.io/x/jobs/1",
        "job_title": "Data Engineer",
        "listing_confidence": "closed",
        "last_verification_attempt_at": _iso(timedelta(days=-30)),
        "last_verified_live_at": None,
        "retired_at": _iso(timedelta(days=-20)),
    })

    verdict = await check_liveness(object(), "j1")

    assert verdict.state == "closed"
    assert repo.attempted == []
