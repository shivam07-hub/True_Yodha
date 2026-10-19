"""jd_coverage — Lane C: JD requirements → coverage vs the user's stories."""
import asyncio

import json

from app.services import jd_coverage, jd_reflection
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


# ── async: assess end-to-end (stubbed provider + recall + embeddings) ───────

class _FakeProvider:
    """Answers the requirement parse and the judge, and counts judge calls."""

    def __init__(self, parse_raw, judge_raw='{"proven": {}}'):
        self._parse = parse_raw
        self._judge = judge_raw
        self.judge_calls: list[str] = []

    async def complete(self, messages, max_tokens=None, temperature=None):
        if messages[0]["content"] == jd_reflection.JUDGE_SYSTEM:
            self.judge_calls.append(messages[1]["content"])
            if isinstance(self._judge, Exception):
                raise self._judge
            return self._judge
        return self._parse


def _run(coro):
    # Fresh loop per call — get_event_loop() breaks when TestClient tests in
    # this module (or elsewhere in the suite) close the ambient loop.
    return asyncio.run(coro)


def _proofs(mapping):
    """The judge's answer: per requirement number, (line id, words quoted from it)."""
    return json.dumps({"proven": {
        str(n): [{"id": i, "shows": q} for i, q in proofs] for n, proofs in mapping.items()
    }})


def _patch_recall(monkeypatch, per_query):
    """Coverage recalls every requirement in one batch; the fakes answer per query."""
    async def _many(user_id, queries, *, k=4, qvecs=None):
        return [await per_query(user_id, q, k) for q in queries]

    monkeypatch.setattr(jd_coverage.memory_recall, "recall_stories_many", _many)


def _no_embeddings(monkeypatch):
    from app.services import embeddings

    async def _embed(texts):
        return [[1.0, 0.0] for _ in texts]

    monkeypatch.setattr(embeddings, "embed_texts", _embed)


def _story(sid, pointer, sim, told=True):
    return StoryHit(sid, f"Story {sid}", pointer, "", [], sim, told=told)


def test_assess_rules_each_requirement_with_one_judge_call(monkeypatch):
    _no_embeddings(monkeypatch)
    provider = _FakeProvider(
        '{"requirements": ["Own quota", "Design incentives", "Rust systems"]}',
        _proofs({1: [("1a", "Own quota across")], 2: [("2a", "sales comp plan")], 3: []}),
    )

    async def _recall(user_id, query, k=1):
        table = {
            "Own quota": [_story("s1", "Own quota across the region at 120%", 0.85)],
            "Design incentives": [_story("s2", "Designed the sales comp plan", 0.62, told=False)],
            "Rust systems": [],
        }
        return table.get(query, [])

    _patch_recall(monkeypatch, _recall)

    result = _run(jd_coverage.assess("u1", "A long enough job description prose here.", provider))
    by_req = {r.requirement: r for r in result.requirements}
    assert by_req["Own quota"].status == "covered"
    assert by_req["Own quota"].story_id == "s1"
    assert by_req["Design incentives"].status == "weak", "an untold story is evidence, not an answer"
    assert by_req["Rust systems"].status == "gap"
    assert by_req["Rust systems"].story_id is None
    assert (result.covered, result.weak, result.gap) == (1, 1, 1)
    assert len(provider.judge_calls) == 1, "one judgment call per panel"


def test_assess_empty_jd_is_empty():
    result = _run(jd_coverage.assess("u1", "  ", _FakeProvider("{}")))
    assert result.requirements == []


def test_a_cv_line_the_judge_rules_proving_covers_and_is_recorded(monkeypatch):
    _no_embeddings(monkeypatch)

    async def _recall(user_id, query, k=1):
        return []

    _patch_recall(monkeypatch, _recall)
    provider = _FakeProvider("", _proofs({1: [("1a", "property-management dashboards")]}))
    lines = ["Built property-management dashboards for 50+ enterprise clients"]
    result = _run(jd_coverage.rematch(
        "u1", ["Build and maintain self-serve dashboards"], provider, cv_lines=lines,
    ))
    item = result.requirements[0]
    assert (item.status, item.source) == ("covered", "cv")
    assert item.story_pointer == lines[0]
    assert item.proof_lines == lines


def test_a_told_story_outranks_a_cv_line_and_an_untold_story_is_weak(monkeypatch):
    _no_embeddings(monkeypatch)

    async def _recall(user_id, query, k=1):
        return [_story("told", "Ran the regional quota", 0.9), _story("thin", "Quota line", 0.8, told=False)]

    _patch_recall(monkeypatch, _recall)
    # Candidates sort by cosine: told story (0.9), thin story (0.8), CV line (cosine 1.0 here
    # from the stub, so it is first). Every one is ruled proving.
    provider = _FakeProvider("", _proofs({1: [
        ("1a", "Owned quota"), ("1b", "regional quota"), ("1c", "Quota line"),
    ]}))
    item = _run(jd_coverage.rematch("u1", ["Own quota"], provider, cv_lines=["Owned quota"])).requirements[0]
    assert (item.status, item.source, item.story_id) == ("covered", "story", "told")
    assert item.proof_lines == ["Owned quota"]

    thin_only = _FakeProvider("", _proofs({1: [("1c", "Quota line")]}))
    item = _run(jd_coverage.rematch("u1", ["Own quota"], thin_only, cv_lines=["Owned quota"])).requirements[0]
    assert (item.status, item.story_id) == ("weak", "thin")


def test_shared_words_are_not_proof_when_the_judge_says_so(monkeypatch):
    """The 63-of-68 class: "plan" in a GTM line no longer proves "Plan and
    budget projects" — no string rule runs on it, and the judge said no."""
    _no_embeddings(monkeypatch)

    async def _recall(user_id, query, k=1):
        return []

    _patch_recall(monkeypatch, _recall)
    provider = _FakeProvider("", '{"proven": {"1": []}}')
    item = _run(jd_coverage.rematch(
        "u1", ["Plan and budget projects to meet timelines"], provider,
        cv_lines=["Owned the India GTM plan for GCC clients"],
    )).requirements[0]
    assert item.status == "gap"


def test_a_named_tool_is_settled_by_string_without_the_judge(monkeypatch):
    _no_embeddings(monkeypatch)

    async def _recall(user_id, query, k=1):
        return []

    _patch_recall(monkeypatch, _recall)
    provider = _FakeProvider("", '{"proven": {"1": []}}')
    lines = ["Ran the weekly ops review", "Python, SQL, Tableau, Excel"]
    result = _run(jd_coverage.rematch(
        "u1",
        ["Use tools such as Alteryx, Power BI, and Tableau", "Run weekly business reviews"],
        provider, cv_lines=lines,
    ))
    tool, review = result.requirements
    assert (tool.status, tool.source, tool.proof_lines) == ("covered", "cv", ["Python, SQL, Tableau, Excel"])
    assert review.status == "gap"
    assert len(provider.judge_calls) == 1
    assert "Alteryx" not in provider.judge_calls[0], "the tool list never reaches the judge"


def test_a_failed_judge_is_not_a_panel_of_gaps(monkeypatch):
    from app.services.llm_provider import LLMProviderError

    _no_embeddings(monkeypatch)

    async def _recall(user_id, query, k=1):
        return [_story("s1", "Own quota", 0.9)]

    _patch_recall(monkeypatch, _recall)
    assert _run(jd_coverage.rematch("u1", ["Own quota"], _FakeProvider("", LLMProviderError("down")))) is None
    assert _run(jd_coverage.rematch("u1", ["Own quota"], _FakeProvider("", "no json here"))) is None


def test_the_judge_sees_at_most_three_lines_per_requirement(monkeypatch):
    _no_embeddings(monkeypatch)

    async def _recall(user_id, query, k=1):
        return [_story(f"s{i}", f"story line {i}", 0.5 - i / 100) for i in range(8)]

    _patch_recall(monkeypatch, _recall)
    provider = _FakeProvider("")
    _run(jd_coverage.rematch("u1", ["Own quota"], provider, cv_lines=["a cv line"]))
    body = provider.judge_calls[0]
    assert "[1a]" in body and "[1b]" in body and "[1c]" in body and "[1d]" not in body


# ── forward pass: an old panel re-judges with its own requirements ──────────

class _MemRepo:
    def __init__(self, raw=None):
        self.deepenings: dict[str, str] = {}
        if raw is not None:
            self.deepenings[jd_coverage.CACHE_PROMPT_KEY] = raw

    def get_deepening(self, _u, _j, key):
        return self.deepenings.get(key)

    def upsert_deepening(self, _u, _j, key, text):
        self.deepenings[key] = text


def _old_panel():
    """Shape of every panel cached before 2026-10-19: no rule stamp."""
    return json.dumps({
        "computed_at": "2026-10-01T00:00:00+00:00",
        "requirements": [{"requirement": "Own quota", "status": "gap", "source": "story"}],
    })


def test_an_unstamped_panel_is_stale_and_re_judges_without_a_parse(monkeypatch):
    _no_embeddings(monkeypatch)

    async def _recall(user_id, query, k=1):
        return [_story("s1", "Own quota across the region", 0.9)]

    _patch_recall(monkeypatch, _recall)
    assert jd_coverage.is_stale(_old_panel())
    repo = _MemRepo(_old_panel())
    provider = _FakeProvider("PARSE MUST NOT RUN", _proofs({1: [("1a", "Own quota across")]}))
    result, cached, _ = _run(jd_coverage.assess_for_job("u1", "j1", "jd", repo, {}, provider))
    assert cached is False
    assert result.requirements[0].status == "covered"
    stored = repo.deepenings[jd_coverage.CACHE_PROMPT_KEY]
    assert not jd_coverage.is_stale(stored), "a judged panel is stamped"
    again, cached, _ = _run(jd_coverage.assess_for_job("u1", "j1", "jd", repo, {}, provider))
    assert cached is True and len(provider.judge_calls) == 1


def test_a_stale_panel_keeps_its_verdicts_when_the_judge_fails(monkeypatch):
    from app.services.llm_provider import LLMProviderError

    _no_embeddings(monkeypatch)

    async def _recall(user_id, query, k=1):
        return []

    _patch_recall(monkeypatch, _recall)
    repo = _MemRepo(_old_panel())
    result, _cached, _ = _run(jd_coverage.assess_for_job(
        "u1", "j1", "jd", repo, {}, _FakeProvider("", LLMProviderError("down")),
    ))
    assert result.requirements[0].requirement == "Own quota"
    assert repo.deepenings[jd_coverage.CACHE_PROMPT_KEY] == _old_panel(), "nothing written"


def test_a_fresh_panel_whose_judge_fails_is_neither_shown_nor_cached(monkeypatch):
    from app.services.llm_provider import LLMProviderError

    _no_embeddings(monkeypatch)

    async def _recall(user_id, query, k=1):
        return []

    _patch_recall(monkeypatch, _recall)
    repo = _MemRepo()
    provider = _FakeProvider('{"requirements": ["Own quota"]}', LLMProviderError("down"))
    result, _cached, _ = _run(jd_coverage.assess_for_job(
        "u1", "j1", "A long enough job description prose here.", repo, {}, provider,
    ))
    assert result.requirements == []
    assert repo.deepenings == {}


def test_evidence_lines_are_bullets_then_skills_then_summary():
    cv = {
        "summary": "Six years in B2B SaaS",
        "skills_line": "SQL, Python",
        "experience": [{"bullets": ["a", " "]}],
        "projects": [{"bullets": ["b"]}],
    }
    assert jd_coverage.evidence_lines(cv) == ["a", "b", "SQL, Python", "Six years in B2B SaaS"]
    assert jd_coverage.evidence_lines(None) == []


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

    async def _assess(user_id, jd_text, provider, cv_lines=None):
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

    async def _assess(user_id, jd_text, provider, cv_lines=None):
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


def test_router_reads_snapshot_when_live_listing_is_hidden(monkeypatch):
    """Prep keeps going after the marketplace hides a closed listing.

    Evidence is work on a job the user already started, not a live-feed lookup.
    RLS on `jobs` returns no row; the application snapshot still has the JD.
    """
    from fastapi.testclient import TestClient

    from app.deps import CurrentUser, get_current_user
    from app.main import app
    from app.repositories.jobs import get_token_jobs_repository

    class _Repo:
        def __init__(self):
            self.deepenings: dict[str, str] = {}
            self.assessed_jd = ""

        def get_jobs_by_ids(self, _ids):
            return []

        def get_application_job_snapshot(self, _u, _j):
            return {"job_description": "A long enough job description prose here.", "job_title": "PM"}

        def get_deepening(self, _u, _j, key):
            return self.deepenings.get(key)

        def upsert_deepening(self, _u, _j, key, text):
            self.deepenings[key] = text

    async def _assess(user_id, jd_text, provider, cv_lines=None):
        repo.assessed_jd = jd_text
        return _sample_result()

    monkeypatch.setattr(jd_coverage, "assess", _assess)
    repo = _Repo()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email="t@e.com", token="tok")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    from app.repositories.cv import get_token_cv_repository
    app.dependency_overrides[get_token_cv_repository] = lambda: type("CVRepo", (), {"latest_baseline": staticmethod(lambda _u: None)})()
    try:
        resp = TestClient(app).post("/cv/jd-coverage", json={"job_id": "j1"})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["requirements"]) == 2
        assert repo.assessed_jd.startswith("A long enough job description")
    finally:
        app.dependency_overrides.clear()


def test_router_serves_cached_coverage_when_listing_and_snapshot_are_gone(monkeypatch):
    """A banked panel still renders if the live row and the snapshot are both gone."""
    from fastapi.testclient import TestClient

    from app.deps import CurrentUser, get_current_user
    from app.main import app
    from app.repositories.jobs import get_token_jobs_repository

    class _Repo:
        def __init__(self):
            self.deepenings = {jd_coverage.CACHE_PROMPT_KEY: jd_coverage.result_to_payload(_sample_result())}

        def get_jobs_by_ids(self, _ids):
            return []

        def get_application_job_snapshot(self, _u, _j):
            return None

        def get_deepening(self, _u, _j, key):
            return self.deepenings.get(key)

        def upsert_deepening(self, _u, _j, key, text):
            self.deepenings[key] = text

    async def _assess(user_id, jd_text, provider, cv_lines=None):
        raise AssertionError("cache must answer — do not re-parse a missing JD")

    monkeypatch.setattr(jd_coverage, "assess", _assess)
    repo = _Repo()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email="t@e.com", token="tok")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    from app.repositories.cv import get_token_cv_repository
    app.dependency_overrides[get_token_cv_repository] = lambda: type("CVRepo", (), {"latest_baseline": staticmethod(lambda _u: None)})()
    try:
        resp = TestClient(app).post("/cv/jd-coverage", json={"job_id": "j1"})
        assert resp.status_code == 200
        assert resp.json()["cached"] is True
        assert len(resp.json()["requirements"]) == 2
    finally:
        app.dependency_overrides.clear()


def test_router_404_when_job_is_unknown(monkeypatch):
    from fastapi.testclient import TestClient

    from app.deps import CurrentUser, get_current_user
    from app.main import app
    from app.repositories.jobs import get_token_jobs_repository

    class _Repo:
        def get_jobs_by_ids(self, _ids):
            return []

        def get_application_job_snapshot(self, _u, _j):
            return None

        def get_deepening(self, _u, _j, key):
            return None

        def upsert_deepening(self, _u, _j, key, text):
            pass

    async def _assess(user_id, jd_text, provider, cv_lines=None):
        return jd_coverage.CoverageResult()

    monkeypatch.setattr(jd_coverage, "assess", _assess)
    repo = _Repo()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email="t@e.com", token="tok")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    from app.repositories.cv import get_token_cv_repository
    app.dependency_overrides[get_token_cv_repository] = lambda: type("CVRepo", (), {"latest_baseline": staticmethod(lambda _u: None)})()
    try:
        resp = TestClient(app).post("/cv/jd-coverage", json={"job_id": "missing"})
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


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


# ── the panel carries the judge's stamp and proof lines ─────────────────────

def test_payload_round_trip_keeps_proof_lines_and_the_rule():
    result = _sample_result()
    result.requirements[0].proof_lines = ["Built the quota model"]
    raw = jd_coverage.result_to_payload(result)
    assert not jd_coverage.is_stale(raw)
    item = jd_coverage.payload_to_result(raw)[0].requirements[0]
    assert item.proof_lines == ["Built the quota model"]


# ── a banked answer is ruled by the judge, once ─────────────────────────────

def _gap_panel():
    return jd_coverage.result_to_payload(jd_coverage.CoverageResult(requirements=[
        jd_coverage.CoverageItem(requirement="Own quota", status="gap"),
    ]))


def test_an_answer_flips_its_row_only_when_the_judge_says_it_proves_it():
    answer = "I owned a ₹4Cr quota across 12 cities for two years"
    assert jd_coverage.patch_requirement_answered(_gap_panel(), "Own quota", answer, proven=False) is None
    patched = jd_coverage.patch_requirement_answered(_gap_panel(), "own  QUOTA", answer, proven=True)
    item = jd_coverage.payload_to_result(patched)[0].requirements[0]
    assert (item.status, item.story_title) == ("covered", "Your answer")
    assert not jd_coverage.is_stale(patched)


def test_a_patch_does_not_stamp_an_old_panel_as_judged():
    patched = jd_coverage.patch_requirement_answered(_old_panel(), "Own quota", "I owned it", proven=True)
    assert jd_coverage.payload_to_result(patched)[0].requirements[0].status == "covered"
    assert jd_coverage.is_stale(patched), "the other rows were never judged"


def test_an_unproving_answer_marks_its_room_for_re_judging(monkeypatch):
    repo = _MemRepo(_gap_panel())
    provider = _FakeProvider("", '{"proven": {"1": []}}')
    _run(jd_coverage.settle_answer(repo, "u1", "j1", _gap_panel(), "Own quota", "I like sales", provider))
    stored = repo.deepenings[jd_coverage.CACHE_PROMPT_KEY]
    assert jd_coverage.payload_to_result(stored)[0].requirements[0].status == "gap"
    assert jd_coverage.is_stale(stored)
    assert len(provider.judge_calls) == 1


def test_a_proving_answer_is_written_covered(monkeypatch):
    repo = _MemRepo(_gap_panel())
    provider = _FakeProvider("", _proofs({1: [("1a", "4Cr quota")]}))
    _run(jd_coverage.settle_answer(
        repo, "u1", "j1", _gap_panel(), "Own quota", "I owned a ₹4Cr quota for two years", provider,
    ))
    stored = repo.deepenings[jd_coverage.CACHE_PROMPT_KEY]
    assert jd_coverage.payload_to_result(stored)[0].requirements[0].status == "covered"
    assert not jd_coverage.is_stale(stored)
