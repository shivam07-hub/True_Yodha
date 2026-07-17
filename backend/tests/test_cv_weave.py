"""Tailor with Mentor — weave service + interview + router (grill locks 2026-07-16)."""
import asyncio
import json

from app.services import cv_weave, cv_weave_interview, jd_coverage
from app.services.cv_weave_interview import StoryMaterial
from app.services.jd_coverage import CoverageItem


def _run(coro):
    return asyncio.run(coro)


CV = {
    "contact": {"name": "A"},
    "summary": "Old summary",
    "skills_line": "Sales, GTM",
    "experience": [
        {"role": "BD Manager", "company": "Capgemini", "dates": "2023–now", "bullets": [
            "Generated over $500K in sales of GCP, AWS, and Azure platforms to clients.",
            "Connected with clients at Capgemini to understand their cloud service needs",
        ]},
        {"role": "Analyst", "company": "JLL", "dates": "2021–2023", "bullets": [
            "Orchestrated migration of 50+ legacy datasets on Cloud.",
        ]},
    ],
    "education": [{"school": "X"}],
}


# ── source shape + fingerprint ─────────────────────────────────────────────────

def test_experience_blocks_indexed():
    blocks = cv_weave.experience_blocks(CV)
    assert [b["index"] for b in blocks] == [0, 1]
    assert blocks[0]["company"] == "Capgemini"
    assert len(blocks[0]["bullets"]) == 2


def test_fingerprint_changes_with_bullets():
    fp1 = cv_weave.source_fingerprint(CV)
    changed = json.loads(json.dumps(CV))
    changed["experience"][0]["bullets"].append("New line")
    assert fp1 != cv_weave.source_fingerprint(changed)
    assert fp1 == cv_weave.source_fingerprint(json.loads(json.dumps(CV)))


# ── parse ──────────────────────────────────────────────────────────────────────

def _blocks():
    return cv_weave.experience_blocks(CV)


def test_parse_valid_proposal():
    raw = json.dumps({
        "summary": "Tailored summary",
        "skills_line": None,
        "roles": [{
            "role_index": 0, "why": "Speaks the JD language.",
            "bullets": [{"text": "Sold $500K of GCP, AWS, and Azure platforms to Capgemini clients, owning cloud-need discovery.",
                         "from": [0, 1], "story_ids": ["s1"], "used_answer": True}],
            "dropped": [],
        }],
    })
    parsed = cv_weave.parse_weave_response(raw, _blocks())
    assert parsed is not None
    assert parsed["summary"] == "Tailored summary"
    assert parsed["roles"][0]["bullets"][0]["from"] == [0, 1]


def test_parse_accounting_violation_drops_role():
    # Old bullet 1 neither referenced nor dropped → the role must fall away.
    raw = json.dumps({"roles": [{
        "role_index": 0, "why": "",
        "bullets": [{"text": "One line.", "from": [0], "story_ids": [], "used_answer": False}],
        "dropped": [],
    }]})
    assert cv_weave.parse_weave_response(raw, _blocks()) is None


def test_parse_bad_indices_and_fences():
    raw = "```json\n" + json.dumps({"roles": [{
        "role_index": 9, "bullets": [{"text": "x", "from": [0]}], "dropped": [],
    }], "summary": "Kept"}) + "\n```"
    parsed = cv_weave.parse_weave_response(raw, _blocks())
    assert parsed is not None and parsed["roles"] == [] and parsed["summary"] == "Kept"


def test_parse_garbage_is_none():
    assert cv_weave.parse_weave_response("not json", _blocks()) is None
    assert cv_weave.parse_weave_response('{"roles": []}', _blocks()) is None


# ── guards ─────────────────────────────────────────────────────────────────────

def _entry(text, frm, dropped):
    return {"bullets": [{"text": text, "from": frm, "story_ids": [], "used_answer": False}],
            "dropped": dropped, "why": ""}


def test_guard_rejects_number_loss():
    old = ["Generated over $500K in sales of GCP, AWS, and Azure platforms to clients."]
    entry = _entry("Sold GCP, AWS, and Azure platforms to clients.", [0], [])
    assert cv_weave.role_guard_ok(old, entry, "") is False


def test_guard_rejects_foreign_number():
    old = ["Connected with clients at Capgemini to understand cloud needs."]
    entry = _entry("Drove $2M in Capgemini client cloud deals.", [0], [])
    assert cv_weave.role_guard_ok(old, entry, "") is False


def test_guard_allows_number_from_answer_material():
    old = ["Connected with clients at Capgemini to understand cloud needs."]
    entry = _entry("Drove $2M in Capgemini client cloud deals.", [0], [])
    assert cv_weave.role_guard_ok(old, entry, "I closed $2M in deals") is True


def test_guard_rejects_substance_loss():
    old = ["Delivered pitches for Life Sciences, Energy, and Aerospace clients at Capgemini."]
    entry = _entry("Delivered pitches for key clients at Capgemini.", [0], [])
    assert cv_weave.role_guard_ok(old, entry, "") is False


def test_guard_allows_dropping_a_bullet():
    old = ["Generated $500K in GCP sales.", "Attended weekly standups."]
    entry = {"bullets": [{"text": "Generated $500K in GCP sales for enterprise clients.",
                          "from": [0], "story_ids": [], "used_answer": False}],
             "dropped": [1], "why": ""}
    assert cv_weave.role_guard_ok(old, entry, "enterprise clients") is True


# ── proposal build + compose ───────────────────────────────────────────────────

def _coverage():
    return [
        CoverageItem(requirement="Sell multi-cloud platforms", status="covered", story_id="s1",
                     story_title="Cloud Platform Enablement Sales"),
        CoverageItem(requirement="Own India territory", status="gap"),
    ]


def test_build_proposal_guard_fail_falls_back_to_original():
    parsed = {
        "summary": None, "skills_line": None,
        "roles": [{
            "role_index": 0, "why": "w",
            # Loses the $500K → guard must reject; role falls back unchanged.
            "bullets": [{"text": "Sold cloud platforms to clients.", "from": [0, 1],
                         "story_ids": [], "used_answer": False}],
            "dropped": [],
        }],
    }
    proposal = cv_weave.build_proposal(CV, parsed, [], [], _coverage())
    assert proposal is None  # only role failed + no summary/skills → nothing to sell


def test_build_proposal_provenance_and_counts():
    parsed = {
        "summary": "New summary", "skills_line": None,
        "roles": [{
            "role_index": 0, "why": "Aligns to the ask.",
            "bullets": [{
                "text": "Generated over $500K selling GCP, AWS, and Azure platforms to Capgemini clients, owning cloud-need discovery.",
                "from": [0, 1], "story_ids": ["s9"], "used_answer": True,
            }],
            "dropped": [],
        }],
    }
    stories = [StoryMaterial(id="s9", title="Cloud Platform Enablement Sales", pointer="", result="", metric_values=[])]
    proposal = cv_weave.build_proposal(CV, parsed, stories, [{"text": "extra"}], _coverage())
    assert proposal is not None
    assert proposal["changed_roles"] == 1
    role0 = proposal["roles"][0]
    assert role0["changed"] and not role0["guarded"]
    b = role0["bullets"][0]
    assert len(b["from_lines"]) == 2
    assert b["story_titles"] == ["Cloud Platform Enablement Sales"]
    assert b["used_answer"] is True
    # role 1 untouched but present for the stepper
    assert proposal["roles"][1]["changed"] is False
    assert proposal["roles"][1]["bullets"][0]["text"].startswith("Orchestrated")
    assert proposal["asks_unproven"] == 1


def test_compose_weave_applies_only_accepted():
    proposal = {
        "summary": "New summary", "skills_line": "GTM, Cloud",
        "roles": [
            {"role_index": 0, "changed": True,
             "bullets": [{"text": "Merged line."}], "dropped_lines": []},
            {"role_index": 1, "changed": True,
             "bullets": [{"text": "Other line."}], "dropped_lines": []},
        ],
    }
    out = cv_weave.compose_weave(CV, proposal, {0}, accept_summary=True, accept_skills_line=False)
    assert out["experience"][0]["bullets"] == ["Merged line."]
    assert out["experience"][1]["bullets"] == CV["experience"][1]["bullets"]  # not accepted
    assert out["summary"] == "New summary"
    assert out["skills_line"] == "Sales, GTM"  # flag off
    assert CV["experience"][0]["bullets"][0].startswith("Generated")  # source untouched


# ── weave (LLM, stubbed) ───────────────────────────────────────────────────────

class _FakeProvider:
    def __init__(self, raw):
        self._raw = raw

    async def complete(self, messages, max_tokens=None):
        return self._raw


def test_weave_end_to_end_stubbed():
    raw = json.dumps({
        "summary": None, "skills_line": None,
        "roles": [{
            "role_index": 1, "why": "Cloud migration speaks to the JD.",
            "bullets": [{"text": "Orchestrated migration of 50+ legacy datasets to Cloud for enterprise clients.",
                         "from": [0], "story_ids": [], "used_answer": True}],
            "dropped": [],
        }],
    })
    proposal = _run(cv_weave.weave(
        job_title="Sales Specialist", company="Oracle", jd_text="JD text",
        coverage_items=_coverage(), cv_structured=CV, stories=[],
        answers=[{"requirement": "x", "text": "for enterprise clients"}],
        provider=_FakeProvider(raw),
    ))
    assert proposal is not None
    assert proposal["changed_roles"] == 1
    assert proposal["fingerprint"] == cv_weave.source_fingerprint(CV)


def test_weave_empty_cv_is_none():
    assert _run(cv_weave.weave(
        job_title="t", company="c", jd_text="jd", coverage_items=[],
        cv_structured={"experience": []}, stories=[], answers=[],
        provider=_FakeProvider("{}"),
    )) is None


# ── interview: follow-up rule ──────────────────────────────────────────────────

def test_follow_up_thin_answer():
    assert cv_weave_interview.follow_up_for("Yes I have sold GCP, Azure, AWS solutions.") is not None


def test_follow_up_passes_with_figures_or_length():
    assert cv_weave_interview.follow_up_for("Sold $500K of GCP to 12 clients") is None
    long = " ".join(["word"] * 30)
    assert cv_weave_interview.follow_up_for(long) is None


# ── interview: option mining (fake vectors + repo) ─────────────────────────────

def test_build_interview_mines_story_and_cv_options(monkeypatch):
    VEC = {
        "Own India territory": [1.0, 0.0, 0.0],
        # story s1 close to the requirement; CV bullet mid; second story far
        "story-s1": [0.9, 0.1, 0.0],
        "story-s2": [0.0, 1.0, 0.0],
        "Generated over $500K in sales of GCP, AWS, and Azure platforms to clients.": [0.7, 0.3, 0.0],
        "Connected with clients at Capgemini to understand their cloud service needs": [0.0, 0.2, 1.0],
        "Orchestrated migration of 50+ legacy datasets on Cloud.": [0.0, 0.1, 1.0],
    }

    async def _embed(texts):
        return [VEC.get(t, [0.0, 0.0, 1.0]) for t in texts]

    monkeypatch.setattr(cv_weave_interview.embeddings, "embed_texts", _embed)

    class _Repo:
        def __init__(self, _db=None):
            pass

        def story_embeddings(self, _u):
            return [{"id": "s1", "embedding": VEC["story-s1"]},
                    {"id": "s2", "embedding": VEC["story-s2"]}]

        def list_stories(self, _u):
            return [
                {"id": "s1", "title": "Cloud Platform Enablement Sales", "narrative": {"result": "Sold platforms"}},
                {"id": "s2", "title": "Unrelated", "narrative": {}},
            ]

        def story_pointers(self, _u, ids):
            return [{"story_id": "s1", "is_canonical": True, "text": "Sold GCP, AWS and Azure to clients."}]

    import app.database as database_mod
    import app.repositories.career_reservoir as reservoir_mod
    monkeypatch.setattr(database_mod, "get_supabase_admin", lambda: None)
    monkeypatch.setattr(reservoir_mod, "CareerReservoirRepository", _Repo)

    items = [CoverageItem(requirement="Own India territory", status="gap")]
    questions = _run(cv_weave_interview.build_interview("u1", items, CV))
    assert len(questions) == 1
    kinds = [o.kind for o in questions[0].options]
    assert "story" in kinds and "cv" in kinds
    story_opt = next(o for o in questions[0].options if o.kind == "story")
    assert story_opt.story_id == "s1"
    assert story_opt.detail == "Sold GCP, AWS and Azure to clients."  # canonical pointer join
    assert all(o.story_id != "s2" for o in questions[0].options)  # below OPTION_MIN


def test_build_interview_covered_asks_skipped():
    items = [CoverageItem(requirement="Sell platforms", status="covered", story_id="s1")]
    assert _run(cv_weave_interview.build_interview("u1", items, CV)) == []


# ── jd_coverage: CV-bullet leg + source round-trip ─────────────────────────────

def test_coverage_cv_bullet_pass_upgrades_gap(monkeypatch):
    VEC = {
        "Sell multi-cloud platforms": [1.0, 0.0],
        "Generated over $500K in sales of GCP, AWS, and Azure platforms to clients.": [0.95, 0.05],
    }

    async def _embed(texts):
        return [VEC.get(t, [0.0, 1.0]) for t in texts]

    import app.services.embeddings as embeddings_mod
    monkeypatch.setattr(embeddings_mod, "embed_texts", _embed)

    provider = _FakeProvider('{"requirements": ["Sell multi-cloud platforms"]}')

    async def _no_stories(user_id, query, k=1):
        return []

    monkeypatch.setattr(jd_coverage.memory_recall, "recall_stories", _no_stories)
    result = _run(jd_coverage.assess(
        "u1", "A long enough job description prose here.", provider,
        cv_bullets=jd_coverage.bullets_from_cv(CV),
    ))
    item = result.requirements[0]
    assert item.status == "covered"
    assert item.source == "cv"
    assert item.story_pointer.startswith("Generated over $500K")


def test_coverage_source_survives_payload_round_trip():
    result = jd_coverage.CoverageResult(
        requirements=[CoverageItem(requirement="R", status="covered", story_title="On your CV",
                                   story_pointer="line", similarity=0.8, source="cv")],
        covered=1, weak=0, gap=0,
    )
    hit = jd_coverage.payload_to_result(jd_coverage.result_to_payload(result))
    assert hit is not None
    assert hit[0].requirements[0].source == "cv"


def test_bullets_from_cv_flattens_experience_and_projects():
    cv = {"experience": [{"bullets": ["a", ""]}], "projects": [{"bullets": ["b"]}]}
    assert jd_coverage.bullets_from_cv(cv) == ["a", "b"]
    assert jd_coverage.bullets_from_cv(None) == []


# ── router ─────────────────────────────────────────────────────────────────────

class _JobsRepo:
    def __init__(self):
        self.deepenings: dict[str, str] = {}

    def get_jobs_by_ids(self, _ids):
        return [{"job_id": "j1", "job_title": "Sales Specialist", "company_name": "Oracle",
                 "job_description": "A long enough job description prose here."}]

    def get_deepening(self, _u, _j, key):
        return self.deepenings.get(key)

    def upsert_deepening(self, _u, _j, key, text):
        self.deepenings[key] = text


class _CVRepo:
    def __init__(self):
        self.created = []

    def latest_baseline(self, _u):
        return {"id": 7, "cv_structured": json.loads(json.dumps(CV))}

    def create(self, _u, spec):
        self.created.append(spec)
        return {"id": 99}


def _client(monkeypatch, jobs_repo, cv_repo, charge_calls):
    from fastapi.testclient import TestClient

    from app.deps import CurrentUser, get_current_user
    from app.main import app
    from app.repositories.career_reservoir import get_career_reservoir_repository
    from app.repositories.cv import get_token_cv_repository
    from app.repositories.jobs import get_token_jobs_repository
    from app.routers.cv import weave as weave_router
    from app.services import career_reservoir as reservoir_service

    async def _no_backfill(_repo, _u, limit=20):
        return 0

    async def _assert_ok(_u, _amt, _action):
        return 1000

    async def _charge(_u, amount, action, **kwargs):
        charge_calls.append((amount, action, kwargs.get("ref_id")))
        return 950

    async def _balance(_u):
        return 950

    monkeypatch.setattr(reservoir_service, "backfill_missing_embeddings", _no_backfill)
    monkeypatch.setattr(weave_router.xp_service, "assert_can_spend_xp", _assert_ok)
    monkeypatch.setattr(weave_router.xp_service, "charge_or_raise", _charge)
    monkeypatch.setattr(weave_router.xp_service, "get_xp_balance", _balance)

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email="t@e.com", token="tok")
    app.dependency_overrides[get_token_jobs_repository] = lambda: jobs_repo
    app.dependency_overrides[get_token_cv_repository] = lambda: cv_repo
    app.dependency_overrides[get_career_reservoir_repository] = lambda: object()
    return TestClient(app)


def _seed_coverage(jobs_repo):
    jobs_repo.deepenings[jd_coverage.CACHE_PROMPT_KEY] = jd_coverage.result_to_payload(
        jd_coverage.CoverageResult(requirements=_coverage(), covered=1, weak=0, gap=1)
    )


def test_router_weave_charges_on_delivery_and_caches(monkeypatch):
    from app.main import app

    jobs_repo, cv_repo, charges = _JobsRepo(), _CVRepo(), []
    _seed_coverage(jobs_repo)
    client = _client(monkeypatch, jobs_repo, cv_repo, charges)

    from app.routers.cv import weave as weave_router

    async def _weave(**kwargs):
        return {"fingerprint": cv_weave.source_fingerprint(CV), "summary": "S", "skills_line": None,
                "roles": [], "changed_roles": 1, "requirements_total": 2, "asks_unproven": 1}

    async def _material(_u, _reqs, cap=12):
        return []

    monkeypatch.setattr(weave_router.cv_weave, "weave", _weave)
    monkeypatch.setattr(weave_router.cv_weave_interview, "gather_story_material", _material)
    try:
        r = client.post("/cv/weave", json={"job_id": "j1"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["cached"] is False and body["new_coin_balance"] == 950
        assert charges and charges[0][0] == 50 and charges[0][1] == "cv_weave"
        assert cv_weave.CACHE_PROMPT_KEY in jobs_repo.deepenings
        # replay: cached, NO second charge
        r2 = client.post("/cv/weave", json={"job_id": "j1"})
        assert r2.json()["cached"] is True and len(charges) == 1
    finally:
        app.dependency_overrides.clear()


def test_router_weave_failure_charges_nothing(monkeypatch):
    from app.main import app

    jobs_repo, cv_repo, charges = _JobsRepo(), _CVRepo(), []
    _seed_coverage(jobs_repo)
    client = _client(monkeypatch, jobs_repo, cv_repo, charges)

    from app.routers.cv import weave as weave_router

    async def _weave(**kwargs):
        return None

    async def _material(_u, _reqs, cap=12):
        return []

    monkeypatch.setattr(weave_router.cv_weave, "weave", _weave)
    monkeypatch.setattr(weave_router.cv_weave_interview, "gather_story_material", _material)
    try:
        r = client.post("/cv/weave", json={"job_id": "j1"})
        assert r.status_code == 503
        assert charges == [] and cv_weave.CACHE_PROMPT_KEY not in jobs_repo.deepenings
    finally:
        app.dependency_overrides.clear()


def test_router_answer_probes_then_banks(monkeypatch):
    from app.main import app

    from app.repositories.cv_dump import get_cv_dump_repository
    from app.routers.cv import weave as weave_router

    banked = []

    class _DumpRepo:
        def add(self, _u, text, source, kind, payload):
            banked.append((text, source, payload))
            return {"id": "e1"}

    enqueued = []
    monkeypatch.setattr(weave_router.career_reservoir, "enqueue_ingest", lambda u, e: enqueued.append(e))

    jobs_repo, cv_repo, charges = _JobsRepo(), _CVRepo(), []
    client = _client(monkeypatch, jobs_repo, cv_repo, charges)
    app.dependency_overrides[get_cv_dump_repository] = lambda: _DumpRepo()
    try:
        # thin answer → one probe, nothing banked
        r1 = client.post("/cv/weave/answer", json={
            "requirement": "Own India territory",
            "answer": "Yes I have sold GCP and Azure solutions.",
        })
        assert r1.status_code == 200
        assert r1.json()["follow_up"] and r1.json()["entry_id"] is None
        assert banked == []
        # final → banked + enqueued
        r2 = client.post("/cv/weave/answer", json={
            "requirement": "Own India territory",
            "answer": "Yes I have sold GCP and Azure solutions.",
            "final": True,
        })
        assert r2.json()["entry_id"] == "e1"
        assert enqueued == ["e1"]
        assert banked[0][2]["via"] == "weave"
    finally:
        app.dependency_overrides.clear()


def test_router_apply_fingerprint_gate(monkeypatch):
    from app.main import app

    jobs_repo, cv_repo, charges = _JobsRepo(), _CVRepo(), []
    client = _client(monkeypatch, jobs_repo, cv_repo, charges)
    proposal = {
        "fingerprint": "deadbeefdeadbeef",  # stale
        "summary": None, "skills_line": None,
        "roles": [{"role_index": 0, "role": "BD Manager", "company": "Capgemini", "changed": True,
                   "guarded": False, "why": "", "bullets": [{"text": "Merged."}], "dropped_lines": []}],
        "changed_roles": 1, "requirements_total": 1, "asks_unproven": 0, "computed_at": "t",
    }
    jobs_repo.deepenings[cv_weave.CACHE_PROMPT_KEY] = json.dumps(proposal)
    try:
        r = client.post("/cv/weave/apply", json={"job_id": "j1", "accepted_roles": [0]})
        assert r.status_code == 409
        # fix the fingerprint → version written with job binding
        proposal["fingerprint"] = cv_weave.source_fingerprint(CV)
        jobs_repo.deepenings[cv_weave.CACHE_PROMPT_KEY] = json.dumps(proposal)
        r2 = client.post("/cv/weave/apply", json={"job_id": "j1", "accepted_roles": [0]})
        assert r2.status_code == 200 and r2.json()["version_id"] == 99
        spec = cv_repo.created[0]
        assert spec.kind == "deterministic" and spec.job_id == "j1" and spec.parent_version_id == 7
        assert spec.cv_structured["experience"][0]["bullets"] == ["Merged."]
        assert spec.cv_structured["experience"][1]["bullets"] == CV["experience"][1]["bullets"]
    finally:
        app.dependency_overrides.clear()


# ── S3: answered-ask cache patch (no re-asking answered questions) ─────────────

def test_patch_requirement_answered_flips_gap_to_covered():
    raw = jd_coverage.result_to_payload(jd_coverage.CoverageResult(
        requirements=[
            CoverageItem(requirement="Own India territory", status="gap"),
            CoverageItem(requirement="Sell platforms", status="covered", story_id="s1"),
        ],
        covered=1, weak=0, gap=1,
    ))
    patched = jd_coverage.patch_requirement_answered(raw, "own india territory", "I ran the north region for 2 years")
    assert patched is not None
    hit = jd_coverage.payload_to_result(patched)
    assert hit is not None
    result, _ = hit
    row = next(r for r in result.requirements if r.requirement == "Own India territory")
    assert row.status == "covered"
    assert row.story_title == "Your answer"
    assert row.story_pointer.startswith("I ran the north region")
    assert (result.covered, result.gap) == (2, 0)


def test_patch_requirement_answered_none_on_miss_or_garbage():
    assert jd_coverage.patch_requirement_answered(None, "x", "y") is None
    assert jd_coverage.patch_requirement_answered("not json", "x", "y") is None
    raw = jd_coverage.result_to_payload(jd_coverage.CoverageResult(
        requirements=[CoverageItem(requirement="A", status="covered", story_id="s1")],
        covered=1, weak=0, gap=0,
    ))
    # already covered → nothing to patch
    assert jd_coverage.patch_requirement_answered(raw, "A", "answer") is None
    # unknown requirement → leave cache alone
    assert jd_coverage.patch_requirement_answered(raw, "B", "answer") is None


def test_router_answer_patches_coverage_cache(monkeypatch):
    from app.main import app

    from app.repositories.cv_dump import get_cv_dump_repository
    from app.routers.cv import weave as weave_router

    class _DumpRepo:
        def add(self, _u, text, source, kind, payload):
            return {"id": "e1"}

    monkeypatch.setattr(weave_router.career_reservoir, "enqueue_ingest", lambda u, e: None)
    jobs_repo, cv_repo, charges = _JobsRepo(), _CVRepo(), []
    jobs_repo.deepenings[jd_coverage.CACHE_PROMPT_KEY] = jd_coverage.result_to_payload(
        jd_coverage.CoverageResult(
            requirements=[CoverageItem(requirement="Own India territory", status="gap")],
            covered=0, weak=0, gap=1,
        )
    )
    client = _client(monkeypatch, jobs_repo, cv_repo, charges)
    app.dependency_overrides[get_cv_dump_repository] = lambda: _DumpRepo()
    try:
        r = client.post("/cv/weave/answer", json={
            "requirement": "Own India territory",
            "answer": "I ran the north region for 2 years across 12 cities.",
            "job_id": "j1",
        })
        assert r.status_code == 200 and r.json()["entry_id"] == "e1"
        hit = jd_coverage.payload_to_result(jobs_repo.deepenings[jd_coverage.CACHE_PROMPT_KEY])
        assert hit is not None and hit[0].requirements[0].status == "covered"
    finally:
        app.dependency_overrides.clear()
