"""CI guard for the read contract (ARCHITECTURE_READ_PATH.md §2).

    Any user-facing request may issue at most 3 concurrent DB reads and must
    answer in under 500ms at p95.

Latency cannot be asserted in CI — but the thing that actually regresses is
STRUCTURAL and can be. Every latency incident this codebase has had came from
reads accumulating quietly:

  * `/jobs/matches` read the dismissed-card set TWICE per request, and nothing
    failed — the second read was invisible because the wave's wall time is
    max(section), and it wasn't the max.
  * `_evidence_stats` grew to six SEQUENTIAL reads, ~208ms each.
  * `/home/bootstrap` grew to eight concurrent sections, spending most of the
    process-wide read budget on one request.

None of those broke a test. They were each found by hand, months later, from
production alert emails. These tests are the cheap version of that discovery.

When one fails: do not raise the number to make it pass. A new read is a
design decision — fold it into an existing wave, precompute it (Tier 0), or
move it off the request path.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.services.concurrent_reads import (
    FANOUT_BUDGET_EXCEPTIONS,
    READ_CONTRACT_MAX_SECTIONS,
    section_budget,
)


class _CountingJobsRepo:
    """Fake jobs repo that tallies every read the router performs.

    Deliberately counts CALLS, not queries. The repository contract makes each
    method one round trip; this guard is about the router's read *shape*, which
    is what a code change alters.
    """

    def __init__(self) -> None:
        self.calls: list[str] = []

    def _record(self, name: str) -> None:
        self.calls.append(name)

    def get_user_match_stack(self, user_id: str, *, dismissed: set[str] | None = None) -> list[dict]:
        self._record("get_user_match_stack")
        return [{"id": 1, "job_id": "j1", "overall_score": 80}]

    def get_dismissed_job_card_ids(self, user_id: str) -> list[str]:
        self._record("get_dismissed_job_card_ids")
        return []

    def get_feed_updated_at(self) -> str | None:
        self._record("get_feed_updated_at")
        return None

    def count_new_jobs_for_user(self, user_id: str) -> int:
        self._record("count_new_jobs_for_user")
        return 0

    def record_recommendation_exposures(self, user_id: str, rows: list[dict], *, surface: str) -> int:
        self._record("record_recommendation_exposures")
        return len(rows)

    def has_computed_matches(self, user_id: str) -> bool:
        self._record("has_computed_matches")
        return False

    def get_user_skill_rows(self, user_id: str) -> list[dict]:
        self._record("get_user_skill_rows")
        return []

    def __getattr__(self, name: str) -> Any:
        # Anything the router reaches for that this fake does not model is
        # itself a read worth counting — surface it rather than silently
        # returning a Mock that hides a new round trip.
        raise AssertionError(
            f"/jobs/matches called an unmodelled repo method: {name!r}. "
            "If this is a new read, it must fit the read contract "
            "(ARCHITECTURE_READ_PATH.md §2) — not just be added to this fake."
        )


# What /jobs/matches reads today, after the S7 fixes. Reads on the RESPONSE
# path only — record_recommendation_exposures is deferred to background_tasks
# and TestClient runs those before returning, so it is excluded by name below.
_MATCHES_EXPECTED_READS = {
    "get_dismissed_job_card_ids",   # once — it used to run twice
    "get_user_match_stack",
    "get_feed_updated_at",
    "count_new_jobs_for_user",
}


def test_jobs_matches_read_shape_has_not_grown() -> None:
    repo = _CountingJobsRepo()
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/matches")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    reads = [c for c in repo.calls if c != "record_recommendation_exposures"]

    assert set(reads) == _MATCHES_EXPECTED_READS, (
        f"/jobs/matches read set changed: {sorted(set(reads))}. "
        "A new read here costs a round trip (~165ms on this path) and a slot "
        "of the process-wide read budget. Fold it into the existing "
        "run_concurrently wave, precompute it, or move it off the request path."
    )
    # The duplicate-read regression, named explicitly: this was read twice for
    # months and cost a whole round trip for a set already in memory.
    assert reads.count("get_dismissed_job_card_ids") == 1, (
        "get_dismissed_job_card_ids ran more than once — the exact regression "
        "S7 fixed. Read it once and pass it where it is needed."
    )


def test_jobs_matches_fanout_is_within_its_budget(monkeypatch) -> None:
    """The read set above counts reads; this counts CONCURRENT ones.

    They are different failures. /jobs/matches fanned out 4 sections against a
    budget of 3 and logged `fanout.over_budget` on every single load for weeks —
    the read set was unchanged the whole time, because the fourth member
    (`get_feed_updated_at`) was a corpus-wide cached value that never needed a
    slot of the process-wide read budget. Width is what silently grows.
    """
    from app.routers.jobs import match as match_router

    widths: list[int] = []
    real = match_router.run_concurrently

    def _spy(sections, *, label=""):
        if label == "jobs.matches":
            widths.append(len(sections))
        return real(sections, label=label)

    monkeypatch.setattr(match_router, "run_concurrently", _spy)

    repo = _CountingJobsRepo()
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            assert client.get("/jobs/matches").status_code == 200
    finally:
        app.dependency_overrides.clear()

    assert widths, "/jobs/matches no longer fans out under the label 'jobs.matches'"
    assert max(widths) <= section_budget("jobs.matches"), (
        f"/jobs/matches fans out {max(widths)} concurrent sections against a "
        f"budget of {section_budget('jobs.matches')}. Do not add an exception — "
        "a section that answers a question about the corpus rather than the "
        "user belongs in the shared cache, not in a per-user wave."
    )


def test_every_fanout_budget_exception_is_deliberate() -> None:
    # The exceptions map is a debt register. An entry that drifts upward, or a
    # new one added silently, is how "at most 3" quietly becomes "however many".
    for label, budget in FANOUT_BUDGET_EXCEPTIONS.items():
        assert budget > READ_CONTRACT_MAX_SECTIONS, (
            f"{label} is listed as an exception but is within the contract — "
            "delete the entry rather than carrying dead debt."
        )
    assert FANOUT_BUDGET_EXCEPTIONS == {"home.bootstrap": 8, "cv.evidence": 6}, (
        "The fan-out debt register changed. Adding an exception means an "
        "endpoint now exceeds the read contract — that is a design decision "
        "and belongs in ARCHITECTURE_READ_PATH.md, not just in this dict."
    )


def test_unlisted_fanouts_are_held_to_the_contract() -> None:
    assert section_budget("jobs.matches") == READ_CONTRACT_MAX_SECTIONS
    assert section_budget("companies.detail") == READ_CONTRACT_MAX_SECTIONS
    assert section_budget("some.new.endpoint") == READ_CONTRACT_MAX_SECTIONS
