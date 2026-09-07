"""The skill-confirmation dead end, and the nudge that led users into it.

Both found live on 2026-09-07 from a screenshot: a fully set-up account, mid
session with 75 saved jobs, told to "Confirm your skills" and then dropped on a
screen with an empty list, "0 kept", and a disabled "Keep at least one".
"""

from __future__ import annotations

from pathlib import Path

SERVICE = (
    Path(__file__).parents[1] / "app/services/skill_confirmation.py"
).read_text()
REPO = (Path(__file__).parents[1] / "app/repositories/users.py").read_text()
TELEMETRY = (Path(__file__).parents[1] / "app/routers/telemetry.py").read_text()


def test_nothing_to_review_is_not_a_failed_review() -> None:
    """The guard stops someone unticking every real skill. It must not punish a
    CV we failed to read: with zero detected skills "keep at least one" cannot
    be satisfied and the step becomes a permanent dead end."""
    assert "if not reviewed and base_rows:" in SERVICE


def test_a_real_review_still_cannot_be_emptied() -> None:
    """The original rule survives where it means something."""
    guard = SERVICE.split("if not reviewed and base_rows:")[1].split("\n\n")[0]
    assert "Keep at least one evidence-backed skill." in guard


def test_setup_completeness_is_ever_confirmed_not_latest() -> None:
    """A user who onboarded months ago and later uploaded a fresh CV has an
    unconfirmed LATEST baseline. Reading only that told 29 fully set-up people
    to go and confirm their skills. A newer unreviewed upload is not an
    onboarding gap."""
    fn = REPO.split("def baseline_state(")[1].split("def has_baseline_cv(")[0]
    assert "any(r.get(\"skills_confirmed_at\") for r in rows)" in fn
    assert ".limit(1)" not in fn


def test_the_journey_steps_after_upload_are_instrumented() -> None:
    """The trail stopped at `parse`, so the two steps where users actually stall
    had no telemetry and the dead end could not report itself."""
    assert '"confirm"' in TELEMETRY
    assert '"direction"' in TELEMETRY
