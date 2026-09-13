"""jd_coverage — Lane C: JD requirements → coverage vs the user's stories."""
import asyncio

from app.services import jd_coverage
from app.services.memory_recall import StoryHit


# ── pure: requirement parse ────────────────────────────────────────────────────

def test_parse_requirements_response_clean_dedup():
    raw = '{"requirements": ["Own enterprise quota", "own enterprise quota", "Build a team", ""]}'
    out = jd_coverage.parse_requirements_response(raw)
    assert out == ["Own enterprise quota", "Build a team"]


def test_parse_requirements_response_strips_fence_and_bullets():
    raw = '```json\n{"requirements": ["• Design incentive plans.", "  CRM tooling  "]}\n```'
    assert jd_coverage.parse_requirements_response(raw) == ["Design incentive plans", "CRM tooling"]


def test_parse_requirements_response_caps_and_junk():
    items = [f"Requirement number {i}" for i in range(30)]
    raw = '{"requirements": ' + str(items).replace("'", '"') + "}"
    out = jd_coverage.parse_requirements_response(raw)
    assert len(out) == jd_coverage.MAX_REQUIREMENTS


def test_parse_requirements_response_malformed_is_empty():
    assert jd_coverage.parse_requirements_response("not json") == []
    assert jd_coverage.parse_requirements_response('{"other": 1}') == []
    assert jd_coverage.parse_requirements_response("") == []


# ── pure: coverage banding ─────────────────────────────────────────────────────

def test_classify_bands():
    assert jd_coverage._classify(0.90) == "covered"
    assert jd_coverage._classify(jd_coverage.COVERED_MIN) == "covered"
    assert jd_coverage._classify(0.60) == "weak"
    assert jd_coverage._classify(jd_coverage.WEAK_MIN) == "weak"
    assert jd_coverage._classify(0.30) == "gap"


# ── async: assess end-to-end (stubbed provider + recall) ───────────────────────

class _FakeProvider:
    def __init__(self, raw):
        self._raw = raw

    async def complete(self, messages, max_tokens=None):
        return self._raw


def _run(coro):
    # Fresh loop per call — get_event_loop() breaks when TestClient tests in
    # this module (or elsewhere in the suite) close the ambient loop.
    return asyncio.run(coro)


def test_assess_classifies_each_requirement(monkeypatch):
    provider = _FakeProvider('{"requirements": ["Own quota", "Design incentives", "Rust systems"]}')

    async def _recall(user_id, query, k=1):
        table = {
            "Own quota": [StoryHit("s1", "Beat quota", "Beat $2M quota", "120%", ["GTM"], 0.85)],
            "Design incentives": [StoryHit("s2", "Comp plan", "Built comp plan", "", [], 0.62)],
            "Rust systems": [],
        }
        return table.get(query, [])

    monkeypatch.setattr(jd_coverage.memory_recall, "recall_stories", _recall)

    result = _run(jd_coverage.assess("u1", "A long enough job description prose here.", provider))
    by_req = {r.requirement: r for r in result.requirements}
    assert by_req["Own quota"].status == "covered"
    assert by_req["Own quota"].story_id == "s1"
    assert by_req["Design incentives"].status == "weak"
    assert by_req["Rust systems"].status == "gap"
    assert by_req["Rust systems"].story_id is None
    assert (result.covered, result.weak, result.gap) == (1, 1, 1)


def test_assess_empty_jd_is_empty():
    result = _run(jd_coverage.assess("u1", "  ", _FakeProvider("{}")))
    assert result.requirements == []


def test_assess_recall_failure_downgrades_to_gap(monkeypatch):
    provider = _FakeProvider('{"requirements": ["Own quota"]}')

    # recall_stories is documented fail-soft → []; _cover_one relies on that
    # contract, so a story with no match downgrades cleanly to gap.
    async def _empty(user_id, query, k=1):
        return []

    monkeypatch.setattr(jd_coverage.memory_recall, "recall_stories", _empty)
    result = _run(jd_coverage.assess("u1", "A long enough job description prose here.", provider))
    assert result.requirements[0].status == "gap"


# ── cache payload round-trip (Preparations room) ───────────────────────────────

def _sample_result():
    return jd_coverage.CoverageResult(
        requirements=[
            jd_coverage.CoverageItem(
                requirement="Own quota", status="covered", story_id="s1",
                story_title="Beat quota", story_pointer="120%", similarity=0.85,
            ),
            jd_coverage.CoverageItem(requirement="Rust systems", status="gap"),
        ],
        covered=1, weak=0, gap=1,
    )


def test_payload_round_trip():
    raw = jd_coverage.result_to_payload(_sample_result())
    hit = jd_coverage.payload_to_result(raw)
    assert hit is not None
    result, computed_at = hit
    assert computed_at  # stamped
    assert (result.covered, result.weak, result.gap) == (1, 0, 1)
    assert result.requirements[0].story_id == "s1"
    assert result.requirements[1].status == "gap"


def test_payload_to_result_rejects_garbage():
    assert jd_coverage.payload_to_result(None) is None
    assert jd_coverage.payload_to_result("") is None
    assert jd_coverage.payload_to_result("not json") is None
    assert jd_coverage.payload_to_result('{"requirements": []}') is None
    assert jd_coverage.payload_to_result('{"requirements": [{"status": "bogus"}]}') is None


# ── router cache behaviour (/cv/jd-coverage) ───────────────────────────────────

def test_router_cache_hit_skips_llm_and_refresh_recomputes(monkeypatch):
    from fastapi.testclient import TestClient

    from app.deps import CurrentUser, get_current_user
    from app.main import app
    from app.repositories.jobs import get_token_jobs_repository

    class _Repo:
        def __init__(self):
            self.deepenings: dict[str, str] = {}

        def get_jobs_by_ids(self, _ids):
            return [{"job_description": "A long enough job description prose here."}]

        def get_deepening(self, _u, _j, key):
            return self.deepenings.get(key)

        def upsert_deepening(self, _u, _j, key, text):
            self.deepenings[key] = text

    calls = {"n": 0}

    async def _assess(user_id, jd_text, provider, cv_bullets=None):
        calls["n"] += 1
        return _sample_result()

    monkeypatch.setattr(jd_coverage, "assess", _assess)
    repo = _Repo()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email="t@e.com", token="tok")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    from app.repositories.cv import get_token_cv_repository
    app.dependency_overrides[get_token_cv_repository] = lambda: type("CVRepo", (), {"latest_baseline": staticmethod(lambda _u: None)})()
    try:
        client = TestClient(app)
        # First call computes + caches.
        r1 = client.post("/cv/jd-coverage", json={"job_id": "j1"})
        assert r1.status_code == 200 and r1.json()["cached"] is False
        assert calls["n"] == 1 and jd_coverage.CACHE_PROMPT_KEY in repo.deepenings
        # Second call is a cache hit — no LLM.
        r2 = client.post("/cv/jd-coverage", json={"job_id": "j1"})
        assert r2.json()["cached"] is True and r2.json()["computed_at"]
        assert calls["n"] == 1
        assert r2.json()["covered"] == 1 and r2.json()["gap"] == 1
        # refresh forces a recompute.
        r3 = client.post("/cv/jd-coverage", json={"job_id": "j1", "refresh": True})
        assert r3.json()["cached"] is False
        assert calls["n"] == 2
    finally:
        app.dependency_overrides.clear()


def test_router_never_caches_empty_parse(monkeypatch):
    from fastapi.testclient import TestClient

    from app.deps import CurrentUser, get_current_user
    from app.main import app
    from app.repositories.jobs import get_token_jobs_repository

    class _Repo:
        def __init__(self):
            self.deepenings: dict[str, str] = {}

        def get_jobs_by_ids(self, _ids):
            return [{"job_description": "A long enough job description prose here."}]

        def get_deepening(self, _u, _j, key):
            return self.deepenings.get(key)

        def upsert_deepening(self, _u, _j, key, text):
            self.deepenings[key] = text

    async def _assess(user_id, jd_text, provider, cv_bullets=None):
        return jd_coverage.CoverageResult()  # provider failure → fail-soft empty

    monkeypatch.setattr(jd_coverage, "assess", _assess)
    repo = _Repo()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email="t@e.com", token="tok")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    from app.repositories.cv import get_token_cv_repository
    app.dependency_overrides[get_token_cv_repository] = lambda: type("CVRepo", (), {"latest_baseline": staticmethod(lambda _u: None)})()
    try:
        resp = TestClient(app).post("/cv/jd-coverage", json={"job_id": "j1"})
        assert resp.status_code == 200
        assert resp.json()["requirements"] == []
        assert repo.deepenings == {}  # a failed parse is never frozen
    finally:
        app.dependency_overrides.clear()


# ── L1: a CV line is a start, not an answer (BACKLOG #13, 2026-09-13) ────────

def _hit(sim, told):
    return StoryHit(id="s1", title="Billing migration", pointer="", result="Moved it to AWS.",
                    skills=[], similarity=sim, told=told)


def test_a_thin_story_is_capped_at_weak_however_well_it_scores(monkeypatch):
    """`covered` is what removes a requirement from the weave interview — for
    good, on this job and every later one. A story lifted from a CV line may
    evidence the requirement; it may not close it."""
    async def _recall(user_id, q, k=1):
        return [_hit(0.97, told=False)]

    monkeypatch.setattr(jd_coverage.memory_recall, "recall_stories", _recall)
    item = asyncio.run(jd_coverage._cover_one("u1", "migrate payments to cloud"))
    assert item.status == "weak", "a scraped bullet must not close the question"
    assert item.story_id == "s1", "…but it is still shown as the evidence"


def test_a_told_story_at_the_same_score_does_close_it(monkeypatch):
    async def _recall(user_id, q, k=1):
        return [_hit(0.97, told=True)]

    monkeypatch.setattr(jd_coverage.memory_recall, "recall_stories", _recall)
    assert asyncio.run(jd_coverage._cover_one("u1", "migrate payments to cloud")).status == "covered"


def test_depth_does_not_rescue_a_genuine_gap(monkeypatch):
    async def _recall(user_id, q, k=1):
        return [_hit(0.20, told=True)]

    monkeypatch.setattr(jd_coverage.memory_recall, "recall_stories", _recall)
    assert asyncio.run(jd_coverage._cover_one("u1", "kubernetes")).status == "gap"


# ── L2: the answer knows which story it improves ─────────────────────────────

def test_story_for_requirement_reads_the_cache_not_the_client():
    """The answer must know which story it improves. Resolved from OUR cache: a
    client-supplied id would let a caller graft an answer onto any story."""
    payload = jd_coverage.result_to_payload(
        jd_coverage.CoverageResult(requirements=[
            jd_coverage.CoverageItem(
                requirement="Migrate payments to cloud", status="weak",
                story_id="story-42", story_title="t", story_pointer="p", similarity=0.8,
            ),
        ])
    )
    # whitespace- and case-insensitive, because the answer echoes the requirement back
    assert jd_coverage.story_for_requirement(payload, "Migrate  payments to cloud") == "story-42"
    assert jd_coverage.story_for_requirement(payload, "migrate payments to CLOUD") == "story-42"
    assert jd_coverage.story_for_requirement(payload, "Something else") is None
    assert jd_coverage.story_for_requirement(None, "Migrate payments to cloud") is None
    assert jd_coverage.story_for_requirement("not json", "Migrate payments to cloud") is None


def test_a_gap_requirement_has_no_story_to_improve():
    """Nothing evidenced it, so an answer about it is a genuinely new story."""
    payload = jd_coverage.result_to_payload(
        jd_coverage.CoverageResult(requirements=[
            jd_coverage.CoverageItem(requirement="Kubernetes", status="gap"),
        ])
    )
    assert jd_coverage.story_for_requirement(payload, "Kubernetes") is None
