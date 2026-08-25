"""Backlog #16 regression contract: saturation must page a real alert
destination. Covers the burst-threshold trigger, cooldown, and the
safe-empty-recipient default in app.request_timing._maybe_alert_saturation.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app import request_timing as rt


@pytest.fixture(autouse=True)
def _reset_alert_state():
    rt._slow_events.clear()
    rt._last_alert_at = 0.0
    yield
    rt._slow_events.clear()
    rt._last_alert_at = 0.0


@pytest.mark.asyncio
async def test_alert_skipped_below_threshold():
    sent = []
    with patch("app.services.email_service.send_email", side_effect=lambda **kw: sent.append(kw) or True):
        with patch("app.config.settings.ops_alert_email", "ops@example.com"):
            for i in range(rt._ALERT_THRESHOLD - 1):
                rt._maybe_alert_saturation("GET", f"/x/{i}", 1500.0)
    assert sent == []


@pytest.mark.asyncio
async def test_alert_fires_once_at_threshold():
    sent = []
    with patch("app.services.email_service.send_email", side_effect=lambda **kw: sent.append(kw) or True):
        with patch("app.config.settings.ops_alert_email", "ops@example.com"):
            for i in range(rt._ALERT_THRESHOLD):
                rt._maybe_alert_saturation("GET", f"/x/{i}", 1500.0)
            import asyncio

            await asyncio.sleep(0.1)  # let run_in_executor dispatch
    assert len(sent) == 1
    assert sent[0]["to"] == "ops@example.com"
    assert "saturation" in sent[0]["subject"].lower()


@pytest.mark.asyncio
async def test_cooldown_prevents_duplicate_alert():
    import asyncio

    sent = []
    with patch("app.services.email_service.send_email", side_effect=lambda **kw: sent.append(kw) or True):
        with patch("app.config.settings.ops_alert_email", "ops@example.com"):
            for i in range(rt._ALERT_THRESHOLD):
                rt._maybe_alert_saturation("GET", f"/x/{i}", 1500.0)
            await asyncio.sleep(0.1)
            assert len(sent) == 1

            # Still within cooldown — must not fire again.
            rt._maybe_alert_saturation("GET", "/x/extra", 1500.0)
            await asyncio.sleep(0.1)
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_empty_recipient_stays_silent():
    sent = []
    with patch("app.services.email_service.send_email", side_effect=lambda **kw: sent.append(kw) or True):
        with patch("app.config.settings.ops_alert_email", ""):
            for i in range(rt._ALERT_THRESHOLD + 1):
                rt._maybe_alert_saturation("GET", f"/x/{i}", 1500.0)
            import asyncio

            await asyncio.sleep(0.1)
    assert sent == []


@pytest.mark.asyncio
async def test_alert_path_never_raises_on_email_failure():
    """A broken email path must never propagate into the request path."""
    with patch("app.services.email_service.send_email", side_effect=RuntimeError("boom")):
        with patch("app.config.settings.ops_alert_email", "ops@example.com"):
            for i in range(rt._ALERT_THRESHOLD):
                rt._maybe_alert_saturation("GET", f"/x/{i}", 1500.0)  # must not raise
            import asyncio

            await asyncio.sleep(0.1)


# --- Stratified sample: one loud stage must not evict every other -----------
#
# Over 2026-08-14..24, `POST /partner/v1/sso/session` was 170 of 613 alert lines
# and nine alert windows were 100% SSO — on each of those a stage-one route was
# also slow and never reached the email. The sample was `list(_slow_events)[-8:]`,
# so the noisiest route took every slot. ARCHITECTURE_READ_PATH.md S16 P0.

def _event(path: str, ms: float = 1500.0, at: float = 0.0):
    return (at, "GET", path, ms)


def test_stage_of_classifies_the_journey() -> None:
    assert rt._stage_of("/partner/v1/sso/session") == "partner"
    assert rt._stage_of("/cv/upload/finalize") == "funnel"
    assert rt._stage_of("/onboarding/state") == "funnel"
    assert rt._stage_of("/roles/families") == "funnel"
    assert rt._stage_of("/users/me") == "funnel"
    assert rt._stage_of("/jobs/feed") == "funnel"
    assert rt._stage_of("/public/stats") == "public"
    assert rt._stage_of("/companies/Accenture/jobs") == "public"
    assert rt._stage_of("/jobs/matches") == "market"
    assert rt._stage_of("/home/bootstrap") == "market"
    assert rt._stage_of("/v1/status") == "other"


def test_jobs_companies_is_public_not_market() -> None:
    """The `/jobs/companies/*` SEO reads must beat the `/jobs` catch-all."""
    assert rt._stage_of("/jobs/companies/indexable") == "public"
    assert rt._stage_of("/jobs/companies/pulse") == "public"


def test_a_loud_stage_cannot_evict_a_quiet_one() -> None:
    """The exact production shape: 20 partner lines and one CV upload."""
    events = [_event("/partner/v1/sso/session", 2000.0, float(i)) for i in range(20)]
    events.append(_event("/cv/upload/finalize", 4136.0, 20.0))

    sample = rt._stratified_sample(events)

    assert "/cv/upload/finalize" in sample, "the funnel line was evicted"
    assert sample.count("/partner/v1/sso/session") <= rt._SAMPLE_PER_STAGE
    # And the stage that matters is read first.
    assert sample.index("funnel") < sample.index("partner")


def test_sample_says_how_many_it_is_hiding() -> None:
    events = [_event("/partner/v1/sso/session", 2000.0, float(i)) for i in range(20)]
    sample = rt._stratified_sample(events)
    assert "partner (20 slow, showing 3):" in sample


def test_a_stage_fully_shown_is_not_labelled_as_truncated() -> None:
    sample = rt._stratified_sample([_event("/cv/upload/finalize", 4136.0, 1.0)])
    assert "funnel (1 slow):" in sample
    assert "showing" not in sample


def test_sample_is_slowest_first_within_a_stage() -> None:
    """Recency carries no information across a 120s window; magnitude does."""
    events = [
        _event("/roles/families", 8322.0, 1.0),
        _event("/roles/family-locations", 1441.0, 2.0),
        _event("/profile/ninja-name", 1898.0, 3.0),
        _event("/cv/upload/finalize", 3799.0, 4.0),
    ]
    sample = rt._stratified_sample(events)
    assert sample.index("/roles/families") < sample.index("/cv/upload/finalize")
    assert "/roles/family-locations" not in sample, "the fastest line took a slot"
