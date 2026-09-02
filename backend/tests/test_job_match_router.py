from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository


class _FakeJobsRepo:
    def __init__(
        self,
        *,
        stack: list[dict] | None = None,
        new_jobs: int = 0,
        agent_picks: list[dict] | None = None,
        dismissed_ids: list[str] | None = None,
        evals: dict[str, dict] | None = None,
    ) -> None:
        self.dismissed: list[tuple[str, str]] = []
        self._stack = stack or []
        self._new_jobs = new_jobs
        self._agent_picks = agent_picks or []
        self._dismissed_ids = dismissed_ids or []
        self._evals = evals or {}
        self.count_markers: list[int] = []
        self.exposures: list[tuple[str, str, list[str]]] = []
        self.dismissed_reads = 0

    def get_agent_picks(self, user_id: str) -> list[dict]:
        return self._agent_picks

    def get_cached_match_evals(
        self, user_id: str, job_ids: list[str], *, full: bool = False
    ) -> dict[str, dict]:
        return {jid: self._evals[jid] for jid in job_ids if jid in self._evals}

    def dismiss_dashboard_job_card(self, user_id: str, job_id: str) -> None:
        self.dismissed.append((user_id, job_id))

    def get_user_match_stack(
        self, user_id: str, *, dismissed: set[str] | None = None
    ) -> list[dict]:
        return self._stack

    def get_feed_updated_at(self) -> str | None:
        return None

    def get_dismissed_job_card_ids(self, user_id: str) -> list[str]:
        self.dismissed_reads += 1
        return list(self._dismissed_ids)

    def count_new_jobs_since(self, since) -> int:
        self.count_markers.append(since)
        return self._new_jobs

    def last_match_run_at(self, _user_id: str):
        from datetime import datetime

        raw = self._stack[0].get("computed_at") if self._stack else None
        return datetime.fromisoformat(str(raw)) if raw else None

    def count_new_jobs_for_user(self, user_id: str) -> int:
        computed_at = self.last_match_run_at(user_id)
        if computed_at is None:
            return 0
        return self.count_new_jobs_since(computed_at)

    def record_recommendation_exposures(
        self, user_id: str, rows: list[dict], *, surface: str
    ) -> int:
        self.exposures.append(
            (user_id, surface, [str(row["job_id"]) for row in rows])
        )
        return len(rows)

    # compute_match_health lookups — empty defaults keep the health path at
    # "empty" (no skills → no failure) for these router tests.
    def has_computed_matches(self, user_id: str) -> bool:
        return False

    def get_user_skill_rows(self, user_id: str) -> list[dict]:
        return []

    def get_existing_match_job_ids(self, user_id: str) -> list[str]:
        return [str(row["job_id"]) for row in self._stack]


def test_matches_new_jobs_count_skipped_when_never_matched() -> None:
    # No persisted matches → no baseline → "new since last match" is meaningless,
    # so the count is 0 and the (potentially expensive) count query never runs.
    repo = _FakeJobsRepo(stack=[], new_jobs=99)
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/matches")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["new_jobs_count"] == 0
    assert repo.count_markers == []


def test_matches_new_jobs_count_uses_landing_timestamp() -> None:
    """The count is "landed after MY last match", to the second. It used to round
    the user's match time down to a YYYYMMDD int and compare against the scraper's
    own date marker — which made a batch imported the day after its scrape run
    permanently invisible to everyone who had matched since."""
    repo = _FakeJobsRepo(
        stack=[{"id": 1, "job_id": "j1", "computed_at": "2026-06-04T09:00:00+00:00"}],
        new_jobs=7,
    )
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/matches")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["new_jobs_count"] == 7
    # The exact compute instant, not a date bucket.
    assert [dt.isoformat() for dt in repo.count_markers] == ["2026-06-04T09:00:00+00:00"]
    assert repo.exposures == [("u1", "dashboard", ["j1"])]
    # The dismissed-card set is read ONCE per request. It used to be read twice
    # — inside get_user_match_stack to filter, and again to build the response's
    # dismissed_job_ids — which on this Railway<->Supabase path costs a whole
    # extra ~150-300ms round trip for a set already in memory.
    assert repo.dismissed_reads == 1


def test_retry_accepted_when_overlap_only(monkeypatch) -> None:
    # Matches exist but none vetted → free re-vet is allowed and enqueues work.
    repo = _FakeJobsRepo(stack=[{"job_id": "j1", "overall_score": None}])
    enqueued: list = []
    from app.services import background
    monkeypatch.setattr(background, "enqueue", lambda *a, **k: enqueued.append((a, k)))
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/matches/retry")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert body == {"accepted": True, "match_health": "overlap_only"}
    assert len(enqueued) == 1


def test_retry_refused_when_vetted(monkeypatch) -> None:
    # A vetted user can't use the free re-vet to dodge the paid refresh.
    repo = _FakeJobsRepo(stack=[{"job_id": "j1", "overall_score": 4.5}])
    enqueued: list = []
    from app.services import background
    monkeypatch.setattr(background, "enqueue", lambda *a, **k: enqueued.append((a, k)))
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/matches/retry")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"accepted": False, "match_health": "vetted"}
    assert enqueued == []


def test_agent_picks_empty_when_no_picks() -> None:
    # No curated picks → empty band → the frontend never renders it.
    repo = _FakeJobsRepo(agent_picks=[])
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/agent-picks")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["picks"] == []


def test_agent_picks_returns_curated_shortlist_with_comment() -> None:
    picks = [
        {
            "job_id": "j1",
            "job_title": "Growth Management - Manager",
            "company_name": "Paytm",
            "job_description": None,
            "skills": ["Revenue Growth"],
            "matched_skills": ["Revenue Growth"],
            "matched_skill_count": 1,
            "target_role_match": 0,
            "is_active": True,
            "agent_rank": 1,
            "agent_tier": "bullseye",
            "agent_comment": "A direct mirror of your growth work.",
        }
    ]
    repo = _FakeJobsRepo(agent_picks=picks)
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/agent-picks")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    pick = body["picks"][0]
    assert pick["job_id"] == "j1"
    assert pick["agent_rank"] == 1
    assert pick["agent_tier"] == "bullseye"
    assert pick["agent_comment"] == "A direct mirror of your growth work."
    assert pick["verdict"] is None
    assert pick["match_score"] is None
    assert repo.exposures == [("u1", "agent_pick", ["j1"])]


def test_agent_picks_carry_the_match_verdict() -> None:
    """Picks are gated on a strong brain score, then shaped as bare feed rows —
    so the card fell back to an overlap pill and hid the judge. Same attach the
    feed uses (`_rank_feed_rows`, no reorder): editorial order stays, the ring
    speaks."""
    picks = [
        {
            "job_id": "j1",
            "job_title": "Data Engineer",
            "company_name": "Accenture",
            "job_description": None,
            "skills": ["PySpark"],
            "matched_skills": [],
            "matched_skill_count": 0,
            "target_role_match": 0,
            "is_active": True,
            "agent_rank": 1,
            "agent_tier": "strong",
            "agent_comment": "Technical fit, sales unused.",
        }
    ]
    evals = {
        "j1": {
            "overall_score": 4.2,
            "overlap_score": 70.0,
            "recommendation": "Apply",
            "grade": "A",
            "seniority_compatibility": "compatible",
            "legitimacy_tier": "high_confidence",
        }
    }
    repo = _FakeJobsRepo(agent_picks=picks, evals=evals)
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/agent-picks")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    pick = response.json()["picks"][0]
    assert pick["verdict"] == "strong"
    assert pick["match_score"] == 84
    assert pick["is_strong"] is True
    assert pick["agent_rank"] == 1


def test_dismiss_match_card_marks_card_removed_for_current_user() -> None:
    repo = _FakeJobsRepo()
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-123")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.delete("/jobs/matches/job-456")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert repo.dismissed == [("user-123", "job-456")]


def test_matches_excludes_dismissed_cards_after_concurrent_fetch() -> None:
    """The dismissed filter moved OUT of get_user_match_stack and into the
    router, so the stack read no longer has to wait for the dismissed read
    (ARCHITECTURE_READ_PATH.md S4-followup: both now run in one concurrent
    wave). This guards the relocated behaviour — a dismissed job must still
    never reach the response, and must not be counted in `total`.
    """
    repo = _FakeJobsRepo(
        stack=[
            {"id": 1, "job_id": "keep-1", "overall_score": 80},
            {"id": 2, "job_id": "dropped", "overall_score": 90},
            {"id": 3, "job_id": "keep-2", "overall_score": 70},
        ],
        dismissed_ids=["dropped"],
    )
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/matches")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    returned = [j["job_id"] for j in body["jobs"]]
    assert returned == ["keep-1", "keep-2"]
    assert body["total"] == 2
    # Still surfaced to the client, and still read exactly once.
    assert body["dismissed_job_ids"] == ["dropped"]
    assert repo.dismissed_reads == 1
    # The exposure ledger records what the user actually saw, not the dropped card.
    assert repo.exposures == [("u1", "dashboard", ["keep-1", "keep-2"])]


def _stub_dispatch(monkeypatch, seen: list) -> None:
    """Stand in for compute so these tests exercise pricing + serialization only."""
    from app.services.job_refresh import _dispatch
    from app.services.job_refresh.types import RefreshTicket

    async def _fake(*, user_id, batch_week, excluded_job_ids, xp_charged, new_coin_balance):
        seen.append({"xp_charged": xp_charged, "new_coin_balance": new_coin_balance})
        return RefreshTicket(
            id="ticket-1",
            state="queued",
            xp_charged=xp_charged,
            new_coin_balance=new_coin_balance,
            batch_week=batch_week,
            progress_label="Waiting to start",
        )

    monkeypatch.setattr(_dispatch, "cannot_run", lambda: False)
    monkeypatch.setattr(_dispatch, "dispatch", _fake)


def test_refresh_free_run_reports_a_null_balance(monkeypatch) -> None:
    """A Myro-initiated run is free, so no charge happens and there is no new
    balance to report — the client keeps the number it has.

    This 500'd in prod (2026-08-08 08:09:36) because `RefreshTicketResponse`
    demanded an int. The dispatch-layer test already asserted None; nothing
    exercised the response model, which is where it actually raised.
    """
    repo = _FakeJobsRepo(
        stack=[{"job_id": "j1", "computed_at": "2026-06-04T09:00:00+00:00"}],
        new_jobs=7,
    )
    seen: list = []
    _stub_dispatch(monkeypatch, seen)
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/refresh")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    body = response.json()
    assert body["xp_charged"] == 0
    assert body["new_coin_balance"] is None
    assert body["id"] == "ticket-1"
    # The wallet was never touched — free means free, not "charged 0 then read".
    assert seen == [{"xp_charged": 0, "new_coin_balance": None}]


def test_refresh_paid_run_reports_the_balance_it_charged(monkeypatch) -> None:
    # No new inventory → the user asked for another pass → flat MATCH_RUN_COST,
    # and the balance the charge returned is what the client reconciles against.
    from app.services.job_refresh import _xp_charge
    from app.services.xp_policy import MATCH_RUN_COST

    repo = _FakeJobsRepo(
        stack=[{"job_id": "j1", "computed_at": "2026-06-04T09:00:00+00:00"}],
        new_jobs=0,
    )
    charges: list = []

    async def _fake_charge(user_id: str, amount: int) -> int:
        charges.append((user_id, amount))
        return 900

    monkeypatch.setattr(_xp_charge, "charge", _fake_charge)
    seen: list = []
    _stub_dispatch(monkeypatch, seen)
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/refresh")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    body = response.json()
    assert body["xp_charged"] == MATCH_RUN_COST
    assert body["new_coin_balance"] == 900
    assert charges == [("u1", MATCH_RUN_COST)]
