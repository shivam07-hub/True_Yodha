"""₹199/month Personalised Engagement — checkout, signature, webhook parse."""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers import payments as payments_router
from app.services import engagement_subscription as eng
from app.services import job_switch_plan_service as svc


class _FakeSubscriptionApi:
    def __init__(self) -> None:
        self.created_payload: dict[str, Any] | None = None

    def create(self, payload: dict[str, Any], **_kwargs: Any) -> dict[str, Any]:
        self.created_payload = payload
        return {"id": "sub_test_1", "status": "created", "plan_id": payload["plan_id"]}


class _FakeOrderApi:
    def create(self, payload: dict[str, Any], **_kwargs: Any) -> dict[str, Any]:
        pytest.fail(f"engagement checkout must not create a one-time order: {payload}")


class _FakeRazorpayClient:
    def __init__(self) -> None:
        self.order = _FakeOrderApi()
        self.subscription = _FakeSubscriptionApi()


@pytest.fixture(autouse=True)
def _auth() -> None:
    app.dependency_overrides[payments_router.get_principal] = lambda: payments_router.Principal(
        id="user-1",
        email="shivam@himyro.com",
    )
    yield
    app.dependency_overrides.pop(payments_router.get_principal, None)


@pytest.fixture(autouse=True)
def _razorpay(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(payments_router.settings, "razorpay_key_secret", "test_secret")
    monkeypatch.setattr(payments_router.settings, "razorpay_engagement_plan_id", "plan_eng_test")
    monkeypatch.setattr(payments_router.settings, "engagement_sales_enabled", True)
    monkeypatch.setattr(eng.settings, "razorpay_engagement_plan_id", "plan_eng_test")
    monkeypatch.setattr(eng.settings, "engagement_sales_enabled", True)


def _sub_signature(payment_id: str, subscription_id: str, secret: str = "test_secret") -> str:
    return hmac.new(
        secret.encode("utf-8"),
        f"{payment_id}|{subscription_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def test_engagement_product_is_199_a_month() -> None:
    product = payments_router.PRODUCTS["job_switch_plan"]
    assert product.price_paise == eng.ENGAGEMENT_PRICE_PAISE
    assert product.price_paise == 19900


def test_create_order_opens_a_subscription_not_an_order(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeRazorpayClient()
    recorded: dict[str, Any] = {}
    monkeypatch.setattr(payments_router, "_razorpay_client", lambda: fake)
    monkeypatch.setattr(payments_router, "_record_created_payment", lambda **kwargs: recorded.update(kwargs))
    monkeypatch.setattr(svc, "open_pass_count", lambda: 0)
    monkeypatch.setattr(svc, "has_active_subscription", lambda _uid: False)

    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 19900, "currency": "INR", "product": "job_switch_plan"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["subscription_id"] == "sub_test_1"
    assert body["order_id"] == "sub_test_1"
    assert body["amount"] == 19900
    assert body["product"] == "myro_job_switch_plan"
    assert fake.subscription.created_payload is not None
    assert fake.subscription.created_payload["plan_id"] == "plan_eng_test"
    assert fake.subscription.created_payload["total_count"] == 12
    assert "notes" not in fake.subscription.created_payload
    assert recorded["razorpay_order_id"] == "sub_test_1"
    assert recorded["razorpay_subscription_id"] == "sub_test_1"
    assert recorded["amount_paise"] == 19900


def test_create_order_refuses_when_sales_are_killed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(eng.settings, "engagement_sales_enabled", False)
    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 19900, "currency": "INR", "product": "job_switch_plan"},
            headers={"Authorization": "Bearer token"},
        )
    assert response.status_code == 503


def test_create_order_refuses_when_plan_id_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(eng.settings, "razorpay_engagement_plan_id", "")
    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 19900, "currency": "INR", "product": "job_switch_plan"},
            headers={"Authorization": "Bearer token"},
        )
    assert response.status_code == 503


def test_create_order_refuses_a_second_active_subscription(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(svc, "has_active_subscription", lambda _uid: True)
    monkeypatch.setattr(svc, "open_pass_count", lambda: 0)
    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 19900, "currency": "INR", "product": "job_switch_plan"},
            headers={"Authorization": "Bearer token"},
        )
    assert response.status_code == 409


def test_subscription_signature_accepts_payment_pipe_subscription() -> None:
    sig = _sub_signature("pay_1", "sub_1")
    assert eng.subscription_signature_matches("pay_1", "sub_1", sig, "test_secret") is True
    assert eng.subscription_signature_matches("pay_1", "sub_other", sig, "test_secret") is False


def test_parse_subscription_charged_event() -> None:
    event = {
        "event": "subscription.charged",
        "payload": {
            "subscription": {"entity": {"id": "sub_1"}},
            "payment": {"entity": {"id": "pay_9", "order_id": "order_9"}},
        },
    }
    charge = eng.parse_subscription_event(event)
    assert charge is not None
    assert charge.subscription_id == "sub_1"
    assert charge.payment_id == "pay_9"
    assert charge.order_id == "order_9"
    assert eng.is_charge_event(charge.event)


def test_parse_subscription_cancelled_event() -> None:
    event = {"event": "subscription.cancelled", "payload": {"subscription": {"entity": {"id": "sub_1"}}}}
    charge = eng.parse_subscription_event(event)
    assert charge is not None
    assert eng.is_stop_event(charge.event)


def test_require_sale_blocks_a_full_queue() -> None:
    with pytest.raises(HTTPException) as exc:
        eng.require_sale(open_pass_count=lambda: eng.MAX_OPEN_PASSES)
    assert exc.value.status_code == 409


def test_verify_subscription_activates_the_scene(monkeypatch: pytest.MonkeyPatch) -> None:
    activated: dict[str, Any] = {}
    monkeypatch.setattr(
        payments_router,
        "_find_payment_by_order",
        lambda *, user_id, razorpay_order_id: {
            "id": "row-e",
            "status": "created",
            "razorpay_payment_id": None,
            "amount_paise": 19900,
            "currency": "INR",
            "xp_amount": 0,
            "product": "myro_job_switch_plan",
            "razorpay_subscription_id": "sub_test_1",
        },
    )
    monkeypatch.setattr(payments_router, "_mark_payment_verified", lambda **_k: True)

    async def _balance(_uid: str) -> int:
        return 3000

    monkeypatch.setattr(payments_router.xp_service, "get_xp_balance", _balance)
    monkeypatch.setattr(
        payments_router.job_switch_plan_service,
        "activate_plan",
        lambda uid, subscription_id=None: activated.update(uid=uid, sub=subscription_id),
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/verify-payment",
            json={
                "razorpay_payment_id": "pay_e1",
                "razorpay_order_id": "sub_test_1",
                "razorpay_subscription_id": "sub_test_1",
                "razorpay_signature": _sub_signature("pay_e1", "sub_test_1"),
            },
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200, response.text
    assert response.json()["job_switch_plan_active"] is True
    assert activated == {"uid": "user-1", "sub": "sub_test_1"}


def _webhook_sig(body: bytes, secret: str = "whsecret") -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def test_webhook_renewal_opens_the_next_month_pass(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_webhook_secret", "whsecret")
    renewed: dict[str, Any] = {}
    monkeypatch.setattr(
        payments_router,
        "_find_payment_by_subscription_id",
        lambda _sid: {
            "id": "row-e",
            "user_id": "user-1",
            "status": "verified",
            "razorpay_payment_id": "pay_first",
            "amount_paise": 19900,
            "currency": "INR",
            "xp_amount": 0,
            "product": "myro_job_switch_plan",
            "razorpay_subscription_id": "sub_test_1",
        },
    )
    monkeypatch.setattr(
        payments_router,
        "_find_payment_by_payment_id",
        lambda _pid: None,
    )
    monkeypatch.setattr(
        payments_router,
        "_record_renewal_payment",
        lambda **kwargs: renewed.update(record=kwargs),
    )
    monkeypatch.setattr(
        payments_router.job_switch_plan_service,
        "renew_period",
        lambda uid: renewed.update(uid=uid),
    )

    body = json.dumps(
        {
            "event": "subscription.charged",
            "payload": {
                "subscription": {"entity": {"id": "sub_test_1"}},
                "payment": {"entity": {"id": "pay_month2", "order_id": "order_month2"}},
            },
        }
    ).encode("utf-8")
    with TestClient(app) as client:
        response = client.post(
            "/api/razorpay/webhook",
            content=body,
            headers={"X-Razorpay-Signature": _webhook_sig(body)},
        )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "renewed"
    assert renewed["uid"] == "user-1"
    assert renewed["record"]["razorpay_payment_id"] == "pay_month2"


def test_webhook_cancelled_stops_the_scene(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_webhook_secret", "whsecret")
    stopped: dict[str, str] = {}
    monkeypatch.setattr(
        payments_router.job_switch_plan_service,
        "mark_subscription_stopped",
        lambda sid: stopped.update(sid=sid),
    )
    body = json.dumps(
        {"event": "subscription.cancelled", "payload": {"subscription": {"entity": {"id": "sub_test_1"}}}}
    ).encode("utf-8")
    with TestClient(app) as client:
        response = client.post(
            "/api/razorpay/webhook",
            content=body,
            headers={"X-Razorpay-Signature": _webhook_sig(body)},
        )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "stopped"
    assert stopped["sid"] == "sub_test_1"
