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
