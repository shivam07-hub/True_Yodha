"""The CV *layout* parse must never sit on the upload's critical path.

Two incidents, one cause. 2026-08-03: the layout call returned unparseable JSON
and the whole job failed and refunded a good analysis. That was fixed by letting
a failed layout degrade — but the call itself stayed inline, so every successful
upload still paid for it.

Measured 2026-08-04 in prod: the whole job ran p50 48s / p90 109s over 30 days,
and decomposing the 14 jobs that carry `llm_elapsed_ms` puts the layout leg at
~5-8s for nine of them and 29-52s for the other five. Bimodal, because its prompt
demands every bullet of every role VERBATIM and so asks for 12,000 output tokens
against the skills call's 3,072 — dense CVs pay it, short ones do not. So this is
a TAIL fix, not a median halving, and the tail is where users leave.

And nothing on the screen behind that wait reads it: `FirstRunSkillReview` renders
`skills` and `baseline_version_id`, and the score, the direction step and the
shortlist are all built on `skills_detected`.

So the invariant is now stronger than "a failed layout is survivable": the upload
path does not call the layout parser at all, and always hands it to the background
lane. `cv_structured = NULL` is a supported state — `get_or_backfill_cv_structured`
rebuilds it on first read and the playground renders `CvDocumentSkeleton` meanwhile.
"""

from __future__ import annotations

import asyncio

import pytest

from app.repositories import cv_upload_jobs as upload_jobs_repo
from app.services import cv_workflow


@pytest.fixture
def stages(monkeypatch: pytest.MonkeyPatch):
    """Drive `_run_cv_upload_stages` with skills that parse.

    `reparse_structured_only` is replaced with a tripwire: the upload path calling
    it at all is the regression this module exists to catch.
    """
    state: dict = {"persisted": [], "done": [], "failed": [], "enqueued": [], "layout_calls": 0}

    async def _skills(_text, **_kw):
        return {"skills_detected": [{"taxonomy_key": "Python (Programming Language)"}]}

    async def _layout_tripwire(_text):
        state["layout_calls"] += 1
        return {"contact": {}, "experience": []}

    monkeypatch.setattr(upload_jobs_repo, "set_phase", lambda *_a, **_k: None)
    monkeypatch.setattr(upload_jobs_repo, "claim_for_completion", lambda _id: True)
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_skills", _skills)
    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _layout_tripwire)
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


def test_the_upload_never_waits_on_the_layout_parse(stages: dict) -> None:
    """The whole point. Falsify by restoring the inline `await` — this fails."""
    _run()

    assert stages["layout_calls"] == 0, (
        "the upload path awaited the layout parse; that is the larger half of the "
        "wait and nothing behind the wait reads it"
    )
    assert stages["done"], "the job must still reach `done` so onboarding can proceed"


def test_the_baseline_is_written_without_a_layout(stages: dict) -> None:
    _run()

    assert stages["persisted"], "the baseline must be written"
    assert not stages["persisted"][0]["cv_structured"], (
        "the layout is filled in by the background job, not by the upload"
    )


def test_the_layout_is_always_queued_not_only_when_it_failed(stages: dict) -> None:
    """Deferring is only honest if the gap actually closes — for every upload,
    not just the ones whose inline parse happened to fail."""
    _run()

    enrich = [call for call in stages["enqueued"] if call[1] == "cv_structured_enrich"]
    assert len(enrich) == 1, "every upload must queue its layout exactly once"
    lane, _job_type, kwargs = enrich[0]
    assert lane == cv_workflow.background.LANE_FAST, (
        "the user is not blocked on this, but they are walking towards it — the CV "
        "playground is where onboarding ends"
    )
    assert kwargs["payload"]["baseline_version_id"] == 42
    assert kwargs["payload"]["raw_text"] == "a cv"


def test_no_skills_still_fails_because_that_is_the_essential_step(
    monkeypatch: pytest.MonkeyPatch, stages: dict
) -> None:
    """The point is that the OPTIONAL step left the critical path — not that
    nothing can fail it. A CV with no extractable skills has nothing to onboard
    with, and must not leave a layout job queued for a baseline that never was."""
    async def _nothing(_text, **_kw):
        return {"skills_detected": []}

    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_skills", _nothing)

    _run()

    assert stages["failed"], "a CV with no skills must still fail and refund"
    assert stages["failed"][0]["error_code"] == "no_skills"
    assert not stages["persisted"]
    assert not [call for call in stages["enqueued"] if call[1] == "cv_structured_enrich"]


def test_the_structured_output_budget_exceeds_the_input_it_restructures() -> None:
    """The JSON restating a CV — keys, escaping, every bullet verbatim — is
    strictly larger than the CV. A 4096-token ceiling over a 15k-char input
    truncated dense CVs, and truncated JSON reads downstream as a provider
    fault rather than as a budget we chose.

    This budget is also why the call belongs off the critical path: an output
    ceiling several times the input is a call that takes tens of seconds by
    construction."""
    from app.services import cv_parser

    # ~4 chars per token is the usual rough conversion.
    approx_input_tokens = cv_parser._CV_TEXT_CHAR_LIMIT / 4
    assert cv_parser._STRUCTURED_MAX_OUTPUT_TOKENS > approx_input_tokens * 2
