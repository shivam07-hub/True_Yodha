"""A failed CV *layout* parse must not cost the user their upload.

2026-08-03, prod. Skill extraction succeeded; the second LLM call — the one that
builds `cv_structured`, the visual layout for the CV playground — returned JSON
that would not parse, and the whole job failed and refunded. The same CV did it
twice in three minutes, which is not what a provider outage looks like.

Nothing downstream of onboarding needs that layout. The score, the skill review
and the direction step are built on `skills_detected`. And `cv_structured = NULL`
is an explicitly supported state: `get_or_backfill_cv_structured` exists to
rebuild it on first read, and `cv_structured_enrich` was written as its
background path — then never enqueued from anywhere, which is why a failed parse
had nowhere to go but "fail everything".
"""

from __future__ import annotations

import asyncio

import pytest

from app.repositories import cv_upload_jobs as upload_jobs_repo
from app.services import cv_workflow


@pytest.fixture
def stages(monkeypatch: pytest.MonkeyPatch):
    """Drive `_run_cv_upload_stages` with skills that parse and a layout that
    does not — the exact prod shape."""
    state: dict = {"persisted": [], "done": [], "failed": [], "enqueued": []}

    async def _skills(_text, **_kw):
        return {"skills_detected": [{"taxonomy_key": "Python (Programming Language)"}]}

    monkeypatch.setattr(upload_jobs_repo, "set_phase", lambda *_a, **_k: None)
    monkeypatch.setattr(upload_jobs_repo, "claim_for_completion", lambda _id: True)
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_skills", _skills)
    monkeypatch.setattr(
        cv_workflow, "_persist_baseline_cv",
        lambda *_a, **kw: state["persisted"].append(kw) or 42,
    )
    monkeypatch.setattr(
        upload_jobs_repo, "mark_done", lambda job_id, **kw: state["done"].append(kw) or True
    )

    async def _fail(job_id, user_id, **kw):
        state["failed"].append(kw)

    monkeypatch.setattr(cv_workflow, "_fail_and_refund", _fail)
    monkeypatch.setattr(
        cv_workflow.background, "enqueue",
        lambda lane, job_type, **kw: state["enqueued"].append((lane, job_type, kw)),
    )

    async def _no_match(_uid, **_kw):
        return None

    monkeypatch.setattr(cv_workflow, "_trigger_initial_match_compute", _no_match)
    return state


def _run() -> None:
    asyncio.run(cv_workflow._run_cv_upload_stages(
        job_id="job-1", user_id="user-1", raw_text="a cv",
        content_hash="hash", source="pdf_upload", allow_retry=False,
        cv_repo=object(),
    ))


def test_unparseable_layout_still_delivers_the_skills(
    monkeypatch: pytest.MonkeyPatch, stages: dict
) -> None:
    async def _no_layout(_text):
        return None  # what "unparseable JSON" resolves to

    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _no_layout)

    _run()

    assert not stages["failed"], "a missing layout must never refund a good analysis"
    assert stages["persisted"], "the baseline must still be written"
    assert not stages["persisted"][0]["cv_structured"]
    assert stages["done"], "the job must reach `done` so onboarding can proceed"


def test_a_crashing_layout_parse_is_also_survivable(
    monkeypatch: pytest.MonkeyPatch, stages: dict
) -> None:
    async def _boom(_text):
        raise RuntimeError("provider client exploded")

    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _boom)

    _run()

    assert not stages["failed"]
    assert stages["done"]


def test_the_missing_layout_is_queued_to_be_filled_in(
    monkeypatch: pytest.MonkeyPatch, stages: dict
) -> None:
    """Degrading is only honest if the gap actually closes. `cv_structured_enrich`
    existed as a handler with no caller — a deferred path that deferred forever."""
    async def _no_layout(_text):
        return None

    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _no_layout)

    _run()

    enrich = [call for call in stages["enqueued"] if call[1] == "cv_structured_enrich"]
    assert len(enrich) == 1, "the layout must be queued for a background retry"
    lane, _job_type, kwargs = enrich[0]
    assert lane == cv_workflow.background.LANE_BULK, "the user is not waiting on this"
    assert kwargs["payload"]["baseline_version_id"] == 42


def test_a_good_layout_is_not_queued_twice(
    monkeypatch: pytest.MonkeyPatch, stages: dict
) -> None:
    async def _layout(_text):
        return {"contact": {}, "experience": []}

    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _layout)

    _run()

    assert stages["persisted"][0]["cv_structured"] == {"contact": {}, "experience": []}
    assert not [call for call in stages["enqueued"] if call[1] == "cv_structured_enrich"]


def test_no_skills_still_fails_because_that_is_the_essential_step(
    monkeypatch: pytest.MonkeyPatch, stages: dict
) -> None:
    """The point is that the OPTIONAL step stopped being fatal — not that nothing
    is. A CV with no extractable skills has nothing to onboard with."""
    async def _nothing(_text, **_kw):
        return {"skills_detected": []}

    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_skills", _nothing)

    _run()

    assert stages["failed"], "a CV with no skills must still fail and refund"
    assert stages["failed"][0]["error_code"] == "no_skills"
    assert not stages["persisted"]


def test_the_structured_output_budget_exceeds_the_input_it_restructures() -> None:
    """The JSON restating a CV — keys, escaping, every bullet verbatim — is
    strictly larger than the CV. A 4096-token ceiling over a 15k-char input
    truncated dense CVs, and truncated JSON reads downstream as a provider
    fault rather than as a budget we chose."""
    from app.services import cv_parser

    # ~4 chars per token is the usual rough conversion.
    approx_input_tokens = cv_parser._CV_TEXT_CHAR_LIMIT / 4
    assert cv_parser._STRUCTURED_MAX_OUTPUT_TOKENS > approx_input_tokens * 2
