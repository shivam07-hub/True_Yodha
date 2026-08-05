"""The upload job must narrate every boundary it actually crosses.

Before this, `_run_cv_upload_stages` wrote exactly two phases for the whole run:
`queued` when the row was created, and `finding_skills` at the top of the stage
runner. Everything after that was one LLM call measured in prod at p50 48s /
p90 109s, so the screen showed one sentence and then held it for a minute or
more. A wait that never changes reads as a wait that has stopped — and that is
literally what the client did about it, printing "Still working — this one is
slower than usual." over the same unchanging label.

The fix is not a nicer spinner. It is emitting the boundary that was already
there: extraction returns and validates, then the claim + baseline write begin.

These phases are facts, never a timer. That distinction is the whole reason the
fabricated parse-substeps were removed in db89a3f4, and the reason the label set
must only contain steps the worker really passes through.
"""

from __future__ import annotations

import asyncio

import pytest

from app.repositories import cv_upload_jobs as upload_jobs_repo
from app.services import cv_workflow


@pytest.fixture
def run_log(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """One ordered log of everything the run does, so ORDER is assertable.

    Phase writes and the parse call land in the same list: a phase claimed
    before the work it describes is a lie that a set-membership assertion would
    happily pass.
    """
    log: list[str] = []

    async def _skills(_text, **_kw):
        log.append("parse:start")
        await asyncio.sleep(0)
        log.append("parse:end")
        return {"skills_detected": [{"taxonomy_key": "Python (Programming Language)"}]}

    monkeypatch.setattr(
        upload_jobs_repo, "set_phase", lambda _job, phase: log.append(f"phase:{phase}")
    )
    monkeypatch.setattr(
        upload_jobs_repo, "claim_for_completion", lambda _id: log.append("claim") or True
    )
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_skills", _skills)
    monkeypatch.setattr(
        cv_workflow, "_persist_baseline_cv", lambda *_a, **_kw: log.append("persist") or 42
    )
    monkeypatch.setattr(
        upload_jobs_repo, "mark_done", lambda _job, **_kw: log.append("done") or True
    )
    monkeypatch.setattr(cv_workflow.background, "enqueue", lambda *_a, **_kw: None)

    async def _fail(_job, _user, **kw):
        log.append(f"fail:{kw.get('error_code')}")

    async def _no_match(_uid, **_kw):
        return None

    monkeypatch.setattr(cv_workflow, "_fail_and_refund", _fail)
    monkeypatch.setattr(cv_workflow, "_trigger_initial_match_compute", _no_match)
    return log


def _run() -> None:
    asyncio.run(cv_workflow._run_cv_upload_stages(
        job_id="job-1", user_id="user-1", raw_text="a cv",
        content_hash="hash", source="pdf_upload", allow_retry=False,
        cv_repo=object(),
    ))


def test_the_long_leg_ending_is_announced(run_log: list[str]) -> None:
    """The one that matters. Falsify by deleting the `saving` write: the run
    emits a single phase and the user watches one sentence for 48-109s."""
    _run()

    phases = [entry.split(":", 1)[1] for entry in run_log if entry.startswith("phase:")]
    assert phases == ["finding_skills", "saving"], (
        f"expected both boundaries to be narrated, got {phases}"
    )


def test_a_phase_is_never_claimed_before_the_work_it_describes(run_log: list[str]) -> None:
    """`saving` must follow the parse RETURNING, not merely be listed after it.

    A phase written optimistically ahead of its work is the fabricated-progress
    defect wearing a persisted-phase costume, and set-membership would not see it.
    """
    _run()

    assert run_log.index("phase:finding_skills") < run_log.index("parse:start")
    assert run_log.index("parse:end") < run_log.index("phase:saving")
    assert run_log.index("phase:saving") < run_log.index("persist")


def test_a_failed_extraction_never_claims_to_be_saving(
    monkeypatch: pytest.MonkeyPatch, run_log: list[str]
) -> None:
    """The boundary is real, so it must not be crossed when the work behind it
    did not happen. A CV yielding no skills has nothing to save."""
    async def _nothing(_text, **_kw):
        return {"skills_detected": []}

    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_skills", _nothing)

    _run()

    assert "phase:saving" not in run_log
    assert "fail:no_skills" in run_log


def test_every_emitted_phase_is_one_the_api_can_return() -> None:
    """The worker and the response model share one vocabulary.

    A `set_phase` value missing from the union does not fail here — it fails in
    production, at response-validation time, on a poll the user is waiting on.
    """
    from typing import get_args

    from app.schemas.cv import CVUploadPhase

    allowed = set(get_args(CVUploadPhase))
    for emitted in ("queued", "finding_skills", "saving", "ready", "failed"):
        assert emitted in allowed, f"the worker writes {emitted!r}; the API cannot return it"
