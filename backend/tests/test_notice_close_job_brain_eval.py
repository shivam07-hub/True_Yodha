"""Close proof for work_lane:job_brain_eval:TransientJobError.

Malformed / invalid_input no longer raise TransientJobError. The Notice was
the None-collapse cycle (2 → 23). See CONTEXT.md Model Outcome.
"""

from app.services.background.dispatch import TransientJobError
from app.services.model_outcome import ModelOutcome, retry_transient

NOTICE_CAUSE_KEY = "work_lane:job_brain_eval:TransientJobError"


def test_malformed_brain_is_not_a_work_lane_retry() -> None:
    retry_transient(ModelOutcome.malformed("unparseable"), allow_retry=True)


def test_unavailable_brain_still_retries() -> None:
    try:
        retry_transient(ModelOutcome.unavailable("provider"), allow_retry=True)
    except TransientJobError:
        return
    raise AssertionError("unavailable must remain TRANSIENT")
