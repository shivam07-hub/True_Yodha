"""Ten columns stop being read and written (Shivam, 2026-11-01; BACKLOG: drop them).

`user_profiles.onboarding_complete` was a stored copy of "finished" that disagreed
with the journey for 138 people. The nine in `user_onboarding_state` have no reader
that decides anything. Prod `main` still writes some, so they drop a week after
the next merge, and nothing here may start naming them again in that week.
"""
from __future__ import annotations

import re

from tests.test_stored_copies_stopped import ROOT, _sources, _strings

_STATE_COLUMNS = re.compile(
    r"\b(current_stage|result_seen_at|score_gap_reviewed_at|activated_at|activation_kind"
    r"|preview_payload|description_text|tailored_cv_created_at)\b"
)


def test_no_code_names_a_dead_onboarding_column() -> None:
    offenders = [
        f"{path.relative_to(ROOT)}:{line}"
        for path in _sources()
        for line, text in _strings(path)
        if _STATE_COLUMNS.search(text)
    ]
    assert offenders == [], ", ".join(offenders)


def test_no_code_writes_the_finished_flag() -> None:
    """`"onboarding_complete"` is still a result kind. As a key it is the column."""
    offenders = [
        str(path.relative_to(ROOT))
        for path in _sources()
        if re.search(r"""["']onboarding_complete["']\s*:""", path.read_text())
    ]
    assert offenders == []
