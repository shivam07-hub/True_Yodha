"""Where the user is in onboarding is DERIVED, never stored.

There used to be two answers. `user_onboarding_state.status` and `.current_stage`
were written in THIRTEEN places and read for a decision in TWO, while
`_current_result` independently derived the same position from the journey's own
facts — and it was the derivation that decided what actually rendered. A
`patch_state` forgotten at any of the thirteen desynced the entry redirect from
the screen it sent you to.

`start_over` already did exactly that, undetected: it set the stage back to
`experience` without clearing the baseline, confirmed skills or target. The two
models disagreed the moment anyone used it — the stored copy simply won for one
screen, so it looked like it worked.

The write seam now REJECTS both fields (see test_onboarding_repository), so the
copy cannot return. These cover the replacement.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import onboarding_service


def _install(
    monkeypatch: pytest.MonkeyPatch,
    *,
    state: dict[str, Any] | None,
    baseline: dict[str, Any] | None,
) -> None:
    monkeypatch.setattr(
        onboarding_service, "OnboardingRepository",
        lambda _db: type("R", (), {"get_state": lambda _s, _u: state})(),
    )
    monkeypatch.setattr(
        onboarding_service, "CVVersionsRepository",
        lambda _db: type("R", (), {"latest_baseline": lambda _s, _u: baseline})(),
    )


def _position(monkeypatch: pytest.MonkeyPatch, **kwargs: Any) -> str:
    _install(monkeypatch, **kwargs)
    return onboarding_service.journey_position(object(), "u1")["position"]


def test_a_user_with_no_row_at_all_is_at_the_upload_door(monkeypatch) -> None:
    """No separate default shape to keep in sync — absence derives like anything
    else."""
    assert _position(monkeypatch, state=None, baseline=None) == "experience"


def test_an_upload_in_flight_belongs_to_the_journey_screen(monkeypatch) -> None:
    """The baseline does not exist yet, but the analysis does — sending this user
    back to the upload door would ask them to do it twice."""
    assert _position(
        monkeypatch, state={"upload_job_id": "job-1"}, baseline=None
    ) == "result"


def test_a_baseline_belongs_to_the_journey_screen(monkeypatch) -> None:
    assert _position(monkeypatch, state={}, baseline={"id": 7}) == "result"


def test_a_finished_user_is_not_in_the_funnel(monkeypatch) -> None:
    assert _position(
        monkeypatch,
        state={"completed_at": "2026-08-04T00:00:00+00:00", "upload_job_id": "job-1"},
        baseline={"id": 7},
    ) == "completed"


def test_the_facts_a_resuming_screen_needs_ride_along(monkeypatch) -> None:
    """One call answers where you are AND gives the screen what it needs to
    resume, so the entry redirect never needs a second request."""
    _install(
        monkeypatch,
        state={
            "upload_job_id": "job-1",
            "generator_answers": {"1": {"preferred_name": "Ada"}},
            "generated_draft": "draft text",
            "entry_mode": "description",
        },
        baseline=None,
    )
    result = onboarding_service.journey_position(object(), "u1")

    assert result["position"] == "result"
    assert result["upload_job_id"] == "job-1"
    assert result["generator_answers"] == {"1": {"preferred_name": "Ada"}}
    assert result["generated_draft"] == "draft text"
    assert result["entry_mode"] == "description"
    # The stored copy is not shipped either — a client cannot start trusting it again.
    assert "status" not in result
    assert "current_stage" not in result
