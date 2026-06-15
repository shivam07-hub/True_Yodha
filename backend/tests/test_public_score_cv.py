"""Tests for routers/public.py — POST /public/score-cv (anon CV-score preview).

Covers:
- happy path: PDF → 200 with score + domain split (gaps/strengths) + skill count
- wrong content-type → 422 (never reaches the LLM)
- scanned/empty PDF guard (CVUP4): <80 chars extracted → 422 before any LLM spend
- no skills extracted → 422
- per-IP rate limit: the (N+1)th call in a window → 429
The heavy deps (text extraction, LLM parse, scoring math) are monkeypatched —
this asserts the router's guards + response contract, not the engine internals.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import public as public_router


@dataclass
class _FakeProjection:
    total_score: float
    domain_scores: dict[str, float]


@pytest.fixture(autouse=True)
def _reset_rate_limit_and_turnstile(monkeypatch: pytest.MonkeyPatch):
    public_router._anon_hits.clear()
    monkeypatch.setattr(public_router.settings, "turnstile_secret", "", raising=False)
    yield
    public_router._anon_hits.clear()


def _wire_engine(
    monkeypatch: pytest.MonkeyPatch, *, raw_text: str, skills: list[dict], structured: dict | None = None
) -> None:
    async def _fake_parse(_text: str, provider=None) -> dict:
        return {"skills_detected": skills, "cv_structured": structured, "raw_text": _text, "provider_failed": False}

    monkeypatch.setattr(public_router.cv_parser, "extract_raw_text", lambda data, ftype: raw_text)
    monkeypatch.setattr(public_router.cv_parser, "parse_cv_text", _fake_parse)
    monkeypatch.setattr(public_router, "get_cv_upload_provider", lambda: object())
    monkeypatch.setattr(public_router, "build_skill_level_map", lambda s: {"python": 3})
    monkeypatch.setattr(public_router, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(public_router, "ScoresRepository", lambda db: object())
    monkeypatch.setattr(
        public_router,
        "project_score",
        lambda repo, level_map, include_market_signals=True: _FakeProjection(
            total_score=72.4,
            domain_scores={"Technology": 80.0, "Data": 61.0, "Leadership": 22.0, "Finance": 9.0},
        ),
    )


def _pdf_upload(content: bytes = b"x" * 500, content_type: str = "application/pdf"):
    return {"file": ("cv.pdf", content, content_type)}


def test_score_cv_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire_engine(monkeypatch, raw_text="A" * 400, skills=[{"display_name": "Python"}, {"display_name": "SQL"}])

    res = TestClient(app).post("/public/score-cv", files=_pdf_upload())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["score"] == 72
    assert body["skills_detected"] == 2
    # domains sorted desc by score
    assert [d["name"] for d in body["domains"]] == ["Technology", "Data", "Leadership", "Finance"]
    # strengths = >=50, top 3; gaps = <50, weakest first
    assert [s["name"] for s in body["strengths"]] == ["Technology", "Data"]
    assert [g["name"] for g in body["gaps"]] == ["Finance", "Leadership"]
    assert body["verdict"]


def test_score_cv_returns_myro_standard_cv(monkeypatch: pytest.MonkeyPatch) -> None:
    # When the parser yields a structured payload, the response carries the CV
    # reformatted to the Myro standard (PdfPage shape) + a contact block.
    structured = {
        "contact": {"name": "Ada Lovelace", "email": "ada@x.io", "title": "Engineer",
                    "phone": "", "location": "London", "linkedin": ""},
        "summary": "Builder.",
        "education": [{"institution": "Cambridge", "degree": "BSc", "dates": "1850", "grade": "", "location": ""}],
        "experience": [{"company": "Analytical", "role": "Lead", "dates": "1843", "location": "", "bullets": ["Wrote the first program."]}],
        "projects": [],
        "skills_line": "Mathematics, Computing",
        "certs": [],
    }
    _wire_engine(monkeypatch, raw_text="A" * 400, skills=[{"display_name": "Python"}], structured=structured)

    res = TestClient(app).post("/public/score-cv", files=_pdf_upload())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["contact"]["name"] == "Ada Lovelace"
    assert body["contact"]["location"] == "London"
    # body mirrors CVStructured — contact is split out, not duplicated inside cv
    assert "contact" not in body["cv"]
    assert body["cv"]["experience"][0]["role"] == "Lead"
    assert body["cv"]["skills_line"] == "Mathematics, Computing"


def test_score_cv_null_cv_when_unstructured(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire_engine(monkeypatch, raw_text="A" * 400, skills=[{"display_name": "Python"}], structured=None)
    body = TestClient(app).post("/public/score-cv", files=_pdf_upload()).json()
    assert body["cv"] is None
    assert body["contact"] is None


def test_score_cv_rejects_wrong_type(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire_engine(monkeypatch, raw_text="A" * 400, skills=[{"display_name": "Python"}])
    res = TestClient(app).post("/public/score-cv", files={"file": ("cv.txt", b"hello", "text/plain")})
    assert res.status_code == 422


def test_score_cv_scanned_pdf_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    # <80 chars extracted → rejected before the LLM is touched.
    _wire_engine(monkeypatch, raw_text="too short", skills=[{"display_name": "Python"}])
    res = TestClient(app).post("/public/score-cv", files=_pdf_upload())
    assert res.status_code == 422
    assert "scanned" in res.json()["detail"].lower()


def test_score_cv_no_skills(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire_engine(monkeypatch, raw_text="A" * 400, skills=[])
    res = TestClient(app).post("/public/score-cv", files=_pdf_upload())
    assert res.status_code == 422


def test_score_cv_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire_engine(monkeypatch, raw_text="A" * 400, skills=[{"display_name": "Python"}])
    client = TestClient(app)
    for _ in range(public_router._ANON_RATE_MAX["score"]):
        assert client.post("/public/score-cv", files=_pdf_upload()).status_code == 200
    # one past the cap, same client IP
    assert client.post("/public/score-cv", files=_pdf_upload()).status_code == 429


# ─── /public/rewrite-bullet + /public/restructure (anon playground AI) ────────


def test_rewrite_bullet_preview(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(bullet, role, kws, metric, provider, allow_no_metric=False):
        assert bullet == "Built a thing that saved 20% time"
        return {"mode": "rewrite", "rewritten_text": "Engineered X cutting cycle time 20%.", "rationale": "XYZ."}

    monkeypatch.setattr(public_router.cv_rewrite, "suggest_rewrite", _fake)
    monkeypatch.setattr(public_router, "get_llm_provider", lambda: object())

    res = TestClient(app).post(
        "/public/rewrite-bullet",
        json={"bullet": "Built a thing that saved 20% time", "role": "Engineer"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["mode"] == "rewrite"
    assert body["rewritten_text"].startswith("Engineered")


def test_rewrite_bullet_no_metric_question(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(*args, **kwargs):
        return {"mode": "question", "question": "What was the impact?"}

    monkeypatch.setattr(public_router.cv_rewrite, "suggest_rewrite", _fake)
    monkeypatch.setattr(public_router, "get_llm_provider", lambda: object())

    body = TestClient(app).post("/public/rewrite-bullet", json={"bullet": "Did work"}).json()
    assert body["mode"] == "question"
    assert body["question"]


def test_restructure_preview(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(*, cv_text, role, company, missing_keywords, provider):
        assert cv_text
        return {
            "mode": "proposal",
            "proposed_text": "RESTRUCTURED CV",
            "changes": ["Reordered experience."],
            "why": "Lead with impact.",
            "rationale": "Lead with impact.",
            "playbook": "XYZ",
            "uncertainty": None,
        }

    monkeypatch.setattr(public_router.cv_restructure, "suggest_restructure", _fake)
    monkeypatch.setattr(public_router, "get_llm_provider", lambda: object())

    res = TestClient(app).post("/public/restructure", json={"cv_text": "my cv text here"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["mode"] == "proposal"
    assert body["proposed_text"] == "RESTRUCTURED CV"
    assert body["changes"] == ["Reordered experience."]


def test_rewrite_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(*args, **kwargs):
        return {"mode": "rewrite", "rewritten_text": "x", "rationale": "y"}

    monkeypatch.setattr(public_router.cv_rewrite, "suggest_rewrite", _fake)
    monkeypatch.setattr(public_router, "get_llm_provider", lambda: object())
    client = TestClient(app)
    for _ in range(public_router._ANON_RATE_MAX["rewrite"]):
        assert client.post("/public/rewrite-bullet", json={"bullet": "b"}).status_code == 200
    assert client.post("/public/rewrite-bullet", json={"bullet": "b"}).status_code == 429
