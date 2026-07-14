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
    return asyncio.get_event_loop().run_until_complete(coro)


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
