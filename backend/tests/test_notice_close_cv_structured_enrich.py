"""Close proof for work_lane:cv_structured_enrich:TransientJobError.

Short / unparseable layout is permanent. Display reads body_text. See
CONTEXT.md Model Outcome and Work Lane.
"""

from app.services.background.dispatch import TransientJobError
from app.services.model_outcome import ModelOutcome, retry_transient

NOTICE_CAUSE_KEY = "work_lane:cv_structured_enrich:TransientJobError"


def test_short_layout_is_not_a_work_lane_retry() -> None:
    retry_transient(ModelOutcome.invalid_input("short_text"), allow_retry=True)


def test_unavailable_layout_still_retries() -> None:
    try:
        retry_transient(ModelOutcome.unavailable("provider"), allow_retry=True)
    except TransientJobError:
        return
    raise AssertionError("unavailable must remain TRANSIENT")
