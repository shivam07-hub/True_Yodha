from __future__ import annotations

from datetime import date
from typing import Any

from app.services import llm_ranker


class _FakeQuery:
    def __init__(self, tape: dict[str, Any]) -> None:
        self._tape = tape

    def upsert(self, rows: list[dict[str, Any]], on_conflict: str) -> "_FakeQuery":
        self._tape["rows"] = rows
        self._tape["on_conflict"] = on_conflict
        return self

    def execute(self) -> "_FakeQuery":
        self._tape["executed"] = True
        return self


class _FakeDB:
    def __init__(self) -> None:
        self.tape: dict[str, Any] = {}

    def table(self, name: str) -> _FakeQuery:
        self.tape["table"] = name
        return _FakeQuery(self.tape)


def _eval(**over: Any) -> dict[str, Any]:
    base = {
        "overall_score": 4.2,
        "grade": "A",
        "role_fit": 4.5,
        "comp_fit": 3.8,
        "growth_fit": 4.0,
        "culture_fit": 3.9,
        "risk_score": 1.5,
        "summary": "Strong strategy fit.",
        "strengths": ["GTM depth"],
        "concerns": ["Comp unclear"],
        "recommendation": "Apply",
        "application_angle": "Lead with consulting wins.",
    }
    base.update(over)
    return base


# ── persist_matches ────────────────────────────────────────────────────────────

def test_persist_matches_upserts_on_permanent_unique_key() -> None:
    """Backlog #36 de-weekly: permanent per-(user,job) identity (migration
    20260710) — re-evaluating a job upserts in place, not a new row per week."""
    db = _FakeDB()
    written = llm_ranker.persist_matches(
        db=db,  # type: ignore[arg-type]
        user_id="user-1",
        batch_week=date(2026, 5, 25),
        top_jobs=[{"job_id": "job-1", "overlap_score": 82.0, "matched_skills": ["Python"]}],
        evaluations={"job-1": _eval()},
    )
    assert written == 1
    assert db.tape["table"] == "user_job_matches"
    assert db.tape["on_conflict"] == "user_id,job_id"
    assert db.tape["executed"] is True


def test_persist_matches_writes_5axis_fields() -> None:
    db = _FakeDB()
    llm_ranker.persist_matches(
        db=db,  # type: ignore[arg-type]
        user_id="user-1",
        batch_week=date(2026, 5, 25),
        top_jobs=[{"job_id": "job-1", "overlap_score": 82.0, "matched_skills": ["Python"]}],
        evaluations={"job-1": _eval()},
    )
    row = db.tape["rows"][0]
    assert row["grade"] == "A"
    assert row["recommendation"] == "Apply"
    assert row["overall_score"] == 4.2
    assert row["role_fit"] == 4.5
    assert row["risk_score"] == 1.5
    assert row["application_angle"] == "Lead with consulting wins."
    assert row["summary"] == "Strong strategy fit."
    # llm_explanation mirrors summary for back-compat
    assert row["llm_explanation"] == "Strong strategy fit."
    assert row["strengths"] == ["GTM depth"]
    assert row["concerns"] == ["Comp unclear"]


def test_persist_matches_unevaluated_job_gets_null_brain_fields() -> None:
    db = _FakeDB()
    llm_ranker.persist_matches(
        db=db,  # type: ignore[arg-type]
        user_id="user-1",
        batch_week=date(2026, 5, 25),
        top_jobs=[{"job_id": "job-x", "overlap_score": 50.0, "matched_skills": []}],
        evaluations={},  # eval failed for this job
    )
    row = db.tape["rows"][0]
    assert row["overall_score"] is None
    assert row["grade"] is None
    assert row["recommendation"] is None
    assert row["strengths"] == []
    assert row["overlap_score"] == 50.0


def test_persist_matches_ranks_evaluated_before_unevaluated() -> None:
    db = _FakeDB()
    llm_ranker.persist_matches(
        db=db,  # type: ignore[arg-type]
        user_id="user-1",
        batch_week=date(2026, 5, 25),
        top_jobs=[
            {"job_id": "low", "overlap_score": 90.0, "matched_skills": []},   # no eval
            {"job_id": "high", "overlap_score": 40.0, "matched_skills": []},  # eval'd
        ],
        evaluations={"high": _eval(overall_score=4.8)},
    )
    by_id = {r["job_id"]: r for r in db.tape["rows"]}
    assert by_id["high"]["llm_rank"] == 1
    assert by_id["low"]["llm_rank"] == 2


def test_persist_matches_dedupes_repeated_job_ids() -> None:
    db = _FakeDB()
    written = llm_ranker.persist_matches(
        db=db,  # type: ignore[arg-type]
        user_id="user-1",
        batch_week=date(2026, 5, 25),
        top_jobs=[
            {"job_id": "job-1", "overlap_score": 72.0, "matched_skills": ["Python"]},
            {"job_id": "job-1", "overlap_score": 88.0, "matched_skills": ["Python", "SQL"]},
            {"job_id": "job-2", "overlap_score": 61.0, "matched_skills": ["SQL"]},
        ],
        evaluations={},
    )
    assert written == 2
    by_job_id = {row["job_id"]: row for row in db.tape["rows"]}
    assert by_job_id["job-1"]["overlap_score"] == 88.0
    assert by_job_id["job-1"]["matched_skills"] == ["Python", "SQL"]


def _target_profile(**over: Any) -> dict[str, Any]:
    profile = {
        "baseline_version_id": 7,
        "target_role_title": "Product Manager",
        "target_seniority": "senior",
        "target_location": "Bengaluru, India",
        "target_location_country": "India",
    }
    profile.update(over)
    return profile


def _target_job(job_id: str, **over: Any) -> dict[str, Any]:
    job = {
        "job_id": job_id,
        "title": "Senior Product Manager",
        "overlap_score": 82.0,
        "matched_skills": ["Product Management"],
        "location": "Bengaluru, Karnataka, India",
        "location_city": "Bengaluru",
        "location_country": "India",
        "location_mode": "onsite",
    }
    job.update(over)
    return job


def test_persist_matches_marks_at_most_three_credible_jobs() -> None:
    db = _FakeDB()
    jobs = [_target_job(f"job-{index}") for index in range(4)]
    llm_ranker.persist_matches(
        db=db,  # type: ignore[arg-type]
        user_id="user-1",
        batch_week=date(2026, 5, 25),
        top_jobs=jobs,
        evaluations={job["job_id"]: _eval() for job in jobs},
        profile=_target_profile(),
    )

    rows = db.tape["rows"]
    assert sum(row["is_recommended"] for row in rows) == 3
    assert all(row["target_context_hash"] for row in rows)
    assert all(row["baseline_version_id"] == 7 for row in rows)


def test_persist_matches_never_recommends_low_score_or_wrong_seniority() -> None:
    db = _FakeDB()
    llm_ranker.persist_matches(
        db=db,  # type: ignore[arg-type]
        user_id="user-1",
        batch_week=date(2026, 5, 25),
        top_jobs=[
            _target_job("low"),
            _target_job("junior", title="Junior Product Manager"),
        ],
        evaluations={
            "low": _eval(overall_score=2.8, recommendation="Apply"),
            "junior": _eval(overall_score=4.7, recommendation="Apply"),
        },
        profile=_target_profile(),
    )

    by_id = {row["job_id"]: row for row in db.tape["rows"]}
    assert by_id["low"]["recommendation"] == "Skip"
    assert by_id["low"]["is_recommended"] is False
    assert by_id["junior"]["seniority_compatibility"] == "incompatible"
    assert by_id["junior"]["is_recommended"] is False


def test_persist_matches_never_recommends_location_mismatch() -> None:
    db = _FakeDB()
    llm_ranker.persist_matches(
        db=db,  # type: ignore[arg-type]
        user_id="user-1",
        batch_week=date(2026, 5, 25),
        top_jobs=[_target_job("mismatch", location="Mumbai, India", location_city="Mumbai")],
        evaluations={"mismatch": _eval(overall_score=4.7)},
        profile=_target_profile(),
    )

    row = db.tape["rows"][0]
    assert row["is_recommended"] is False


# ── parse_eval ──────────────────────────────────────────────────────────────────

def test_parse_eval_extracts_object_from_fenced_json() -> None:
    text = '```json\n{"overall_score": 4.0, "grade": "A", "recommendation": "Apply"}\n```'
    out = llm_ranker.parse_eval(text)
    assert out is not None
    assert out["overall_score"] == 4.0
    assert out["grade"] == "A"
    assert out["recommendation"] == "Apply"


def test_parse_eval_clamps_scores_to_0_5() -> None:
    out = llm_ranker.parse_eval('{"overall_score": 9.9, "role_fit": -3, "recommendation": "Apply"}')
    assert out is not None
    assert out["overall_score"] == 5.0
    assert out["role_fit"] == 0.0


def test_parse_eval_forces_skip_below_threshold() -> None:
    out = llm_ranker.parse_eval('{"overall_score": 2.1, "recommendation": "Apply"}')
    assert out is not None
    assert out["recommendation"] == "Skip"


def test_parse_eval_rejects_unknown_recommendation() -> None:
    out = llm_ranker.parse_eval('{"overall_score": 4.0, "recommendation": "Maybe"}')
    assert out is not None
    assert out["recommendation"] is None


def test_parse_eval_strips_think_block() -> None:
    text = '<think>weighing it</think>{"overall_score": 3.6, "recommendation": "Apply"}'
    out = llm_ranker.parse_eval(text)
    assert out is not None
    assert out["overall_score"] == 3.6


def test_parse_eval_extracts_archetype_and_legitimacy() -> None:
    out = llm_ranker.parse_eval(
        '{"overall_score": 4.1, "recommendation": "Apply", "archetype": "Data Scientist",'
        ' "legitimacy_tier": "high_confidence", "legitimacy_reason": "detailed stack + scope"}'
    )
    assert out is not None
    assert out["archetype"] == "Data Scientist"
    assert out["legitimacy_tier"] == "high_confidence"
    assert out["legitimacy_reason"] == "detailed stack + scope"


def test_parse_eval_drops_invalid_legitimacy_tier() -> None:
    out = llm_ranker.parse_eval('{"overall_score": 4.0, "recommendation": "Apply", "legitimacy_tier": "totally_legit"}')
    assert out is not None
    assert out["legitimacy_tier"] is None
    assert out["archetype"] is None


def test_parse_eval_returns_none_on_garbage() -> None:
    assert llm_ranker.parse_eval("no json here") is None


# ── per-job reveal callback (ADR-0009) ──────────────────────────────────────────

def test_evaluate_all_fires_on_progress_per_job(monkeypatch) -> None:
    import asyncio

    async def fake_eval(job, system_prompt, provider):
        return {"overall_score": 1.0, "summary": "ok"}

    monkeypatch.setattr(llm_ranker, "evaluate_job", fake_eval)
    monkeypatch.setattr(llm_ranker, "build_system_prompt", lambda *a, **k: "sys")

    jobs = [
        {"job_id": "a", "title": "A", "company": "X"},
        {"job_id": "b", "title": "B", "company": "Y"},
        {"job_id": "c", "title": "C", "company": "Z"},
    ]
    calls: list[tuple[int, int, str]] = []

    def cb(done: int, total: int, job: dict) -> None:
        calls.append((done, total, job["job_id"]))

    res = asyncio.run(llm_ranker.evaluate_all({}, jobs, object(), cb))

    assert len(res) == 3
    assert sorted(c[0] for c in calls) == [1, 2, 3]   # done counts 1..3
    assert {c[1] for c in calls} == {3}                # total always 3
    assert {c[2] for c in calls} == {"a", "b", "c"}    # every job reported


# ── Tier-1 triage (pool → shortlist) ──────────────────────────────────────────

class _TriageProvider:
    def __init__(self, response: str = "", fail: bool = False) -> None:
        self._response = response
        self._fail = fail
        self.calls = 0

    async def complete(self, _messages: list[dict[str, Any]], max_tokens: int = 0) -> str:
        self.calls += 1
        if self._fail:
            raise llm_ranker.LLMProviderError("providers down")
        return self._response


def _pool(n: int) -> list[dict[str, Any]]:
    return [
        {"job_id": f"j{i}", "title": f"Role {i}", "company": "Co",
         "overlap_score": 90 - i, "matched_skills": ["python"], "description": "desc"}
        for i in range(n)
    ]


def test_parse_triage_maps_indices_dedupes_and_caps() -> None:
    out = llm_ranker.parse_triage('{"shortlist": [3, 1, 3, 99, 2]}', pool_size=5, keep_n=2)
    assert out == [2, 0]


def test_parse_triage_returns_none_on_garbage() -> None:
    assert llm_ranker.parse_triage("not json", pool_size=5, keep_n=3) is None
    assert llm_ranker.parse_triage('{"nope": []}', pool_size=5, keep_n=3) is None


def test_triage_returns_pool_unchanged_when_within_keep() -> None:
    import asyncio
    prov = _TriageProvider()
    pool = _pool(3)
    out = asyncio.run(llm_ranker.triage_shortlist({"target_roles": ["PM"]}, pool, prov, keep_n=5))
    assert out == pool
    assert prov.calls == 0


def test_triage_selects_brain_ranked_shortlist() -> None:
    import asyncio
    prov = _TriageProvider('{"shortlist": [5, 2]}')
    pool = _pool(6)
    out = asyncio.run(llm_ranker.triage_shortlist({"target_roles": ["PM"]}, pool, prov, keep_n=2))
    assert [j["job_id"] for j in out] == ["j4", "j1"]
    assert prov.calls == 1


def test_triage_falls_back_to_overlap_head_on_provider_failure() -> None:
    import asyncio
    prov = _TriageProvider(fail=True)
    pool = _pool(6)
    out = asyncio.run(llm_ranker.triage_shortlist({}, pool, prov, keep_n=3))
    assert [j["job_id"] for j in out] == ["j0", "j1", "j2"]


def test_triage_falls_back_on_unparseable_shortlist() -> None:
    import asyncio
    prov = _TriageProvider("garbage no json")
    pool = _pool(6)
    out = asyncio.run(llm_ranker.triage_shortlist({}, pool, prov, keep_n=2))
    assert [j["job_id"] for j in out] == ["j0", "j1"]
