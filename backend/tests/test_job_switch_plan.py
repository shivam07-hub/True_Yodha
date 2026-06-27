"""Tests for the ₹99 Personalised Job-Switch Plan (#33).

Covers the review-window guards (B5/B6), the router contract, the admin-token
gate, and the Razorpay fulfilment dispatch (entitlement → activate_plan). DB
chains are monkeypatched — this asserts the lifecycle rules + wiring, not Supabase.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers import job_switch_plan as jsp_router
from app.routers import payments as payments_router
from app.services import job_switch_plan_service as svc


# ── service: second-review guards (B6) ───────────────────────────────────────

def _state(reviews: list[dict[str, Any]], *, window_open: bool, can_second: bool) -> dict[str, Any]:
    return {
        "plan": {"id": "plan-1", "user_id": "u1"},
        "reviews": reviews,
        "can_request_second_review": can_second,
        "window_open": window_open,
    }


def test_request_second_review_no_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(svc, "get_plan_state", lambda uid: None)
    with pytest.raises(HTTPException) as exc:
        svc.request_second_review("u1")
    assert exc.value.status_code == 404


def test_request_second_review_already_requested(monkeypatch: pytest.MonkeyPatch) -> None:
    reviews = [{"review_no": 1, "status": "delivered"}, {"review_no": 2, "status": "pending"}]
    monkeypatch.setattr(svc, "get_plan_state", lambda uid: _state(reviews, window_open=True, can_second=False))
    with pytest.raises(HTTPException) as exc:
        svc.request_second_review("u1")
    assert exc.value.status_code == 409
    assert "already" in exc.value.detail.lower()


def test_request_second_review_window_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    reviews = [{"review_no": 1, "status": "delivered"}]
    monkeypatch.setattr(svc, "get_plan_state", lambda uid: _state(reviews, window_open=False, can_second=False))
    with pytest.raises(HTTPException) as exc:
        svc.request_second_review("u1")
    assert exc.value.status_code == 409
    assert "window" in exc.value.detail.lower()


def test_request_second_review_first_not_delivered(monkeypatch: pytest.MonkeyPatch) -> None:
    reviews = [{"review_no": 1, "status": "in_progress"}]
    monkeypatch.setattr(svc, "get_plan_state", lambda uid: _state(reviews, window_open=True, can_second=False))
    with pytest.raises(HTTPException) as exc:
        svc.request_second_review("u1")
    assert exc.value.status_code == 409
    assert "first review" in exc.value.detail.lower()


def test_request_second_review_happy(monkeypatch: pytest.MonkeyPatch) -> None:
    reviews = [{"review_no": 1, "status": "delivered"}]
    monkeypatch.setattr(svc, "get_plan_state", lambda uid: _state(reviews, window_open=True, can_second=True))
    opened: dict[str, Any] = {}

    def _open(plan_id: str, *, review_no: int) -> dict[str, Any]:
        opened.update(plan_id=plan_id, review_no=review_no)
        return {"id": "r2", "review_no": review_no, "status": "pending"}

    monkeypatch.setattr(svc, "_open_review", _open)
    monkeypatch.setattr(svc, "_notify_reviewer", lambda **_k: None)
    review = svc.request_second_review("u1")
    assert opened == {"plan_id": "plan-1", "review_no": 2}
    assert review["review_no"] == 2


# ── service: working-days SLA helper ─────────────────────────────────────────

def test_add_working_days_skips_weekend() -> None:
    from datetime import datetime, timezone

    # Friday → +5 working days lands on the next Friday (skips Sat/Sun).
    friday = datetime(2026, 6, 26, 12, 0, tzinfo=timezone.utc)  # 2026-06-26 is a Friday
    due = svc._add_working_days(friday, 5)
    assert due.weekday() == 4  # Friday
    assert (due - friday).days == 7


# ── router: contract + admin gate ────────────────────────────────────────────

@pytest.fixture
def _auth() -> None:
    app.dependency_overrides[jsp_router.get_principal] = lambda: jsp_router.Principal(
        id="u1", email="seeker@himyro.com"
    )
    yield
    app.dependency_overrides.pop(jsp_router.get_principal, None)


def test_get_plan_returns_null_when_unpurchased(monkeypatch: pytest.MonkeyPatch, _auth: None) -> None:
    monkeypatch.setattr(svc, "get_plan_state", lambda uid: None)
    with TestClient(app) as client:
        resp = client.get("/job-switch-plan", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200
    assert resp.json() is None


def test_get_plan_shape(monkeypatch: pytest.MonkeyPatch, _auth: None) -> None:
    state = {
        "plan": {
            "id": "plan-1",
            "target_role": "Product Manager",
            "status": "active",
            "reviews_used": 1,
            "window_expires_at": "2026-10-25T00:00:00+00:00",
            "created_at": "2026-06-27T00:00:00+00:00",
        },
        "reviews": [
            {
                "id": "r1",
                "review_no": 1,
                "status": "delivered",
                "review_text": "Focus on X.",
                "sla_due_at": "2026-07-04T00:00:00+00:00",
                "requested_at": "2026-06-27T00:00:00+00:00",
                "delivered_at": "2026-06-30T00:00:00+00:00",
            }
        ],
        "can_request_second_review": True,
        "window_open": True,
    }
    monkeypatch.setattr(svc, "get_plan_state", lambda uid: state)
    with TestClient(app) as client:
        resp = client.get("/job-switch-plan", headers={"Authorization": "Bearer t"})
    body = resp.json()
    assert resp.status_code == 200
    assert body["target_role"] == "Product Manager"
    assert body["can_request_second_review"] is True
    assert body["reviews"][0]["review_no"] == 1


def test_admin_endpoint_503_when_token_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jsp_router.settings, "job_switch_admin_token", "", raising=False)
    with TestClient(app) as client:
        resp = client.patch("/job-switch-plan/reviews/r1/status", json={"status": "delivered"})
    assert resp.status_code == 503


def test_admin_endpoint_401_wrong_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jsp_router.settings, "job_switch_admin_token", "secret", raising=False)
    with TestClient(app) as client:
        resp = client.patch(
            "/job-switch-plan/reviews/r1/status",
            json={"status": "delivered"},
            headers={"X-Myro-Admin-Token": "wrong"},
        )
    assert resp.status_code == 401


# ── payments: fulfilment dispatch (entitlement → activate_plan) ──────────────

def test_entitlement_dispatch_to_job_switch_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    called: dict[str, Any] = {}
    monkeypatch.setattr(
        payments_router.job_switch_plan_service, "activate_plan", lambda uid: called.update(uid=uid)
    )
    monkeypatch.setattr(payments_router, "_unlock_myrology", lambda uid: called.update(myrology=uid))

    payments_router._apply_entitlement("u9", payments_router.PRODUCTS["job_switch_plan"])
    assert called == {"uid": "u9"}  # plan activated, myrology NOT unlocked


def test_entitlement_dispatch_to_myrology(monkeypatch: pytest.MonkeyPatch) -> None:
    called: dict[str, Any] = {}
    monkeypatch.setattr(
        payments_router.job_switch_plan_service, "activate_plan", lambda uid: called.update(plan=uid)
    )
    monkeypatch.setattr(payments_router, "_unlock_myrology", lambda uid: called.update(uid=uid))

    payments_router._apply_entitlement("u9", payments_router.PRODUCTS["myrology"])
    assert called == {"uid": "u9"}  # myrology unlocked, plan NOT activated
