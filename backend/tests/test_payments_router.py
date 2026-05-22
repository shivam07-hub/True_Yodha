from __future__ import annotations

import hashlib
import hmac
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import payments as payments_router


class _FakeOrderApi:
    def __init__(self) -> None:
        self.created_payload: dict[str, Any] | None = None

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_payload = payload
        return {
            "id": "order_test_123",
            "amount": payload["amount"],
            "currency": payload["currency"],
            "receipt": payload["receipt"],
        }


class _FakeRazorpayClient:
    def __init__(self) -> None:
        self.order = _FakeOrderApi()


@pytest.fixture(autouse=True)
def _payments_auth_override() -> None:
    app.dependency_overrides[payments_router.get_principal] = lambda: payments_router.Principal(
        id="user-1",
        email="shivam@himyro.com",
    )
    yield
    app.dependency_overrides.pop(payments_router.get_principal, None)


@pytest.fixture(autouse=True)
def _razorpay_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(payments_router.settings, "razorpay_key_secret", "test_secret")


def _signature(order_id: str, payment_id: str, secret: str = "test_secret") -> str:
    return hmac.new(
        secret.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def test_create_order_rejects_amount_below_100() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 99, "currency": "INR", "receipt": "xp_test"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 400
    assert "at least 100 paise" in response.json()["detail"]


def test_create_order_rejects_non_launch_pack_amount() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 100, "currency": "INR", "receipt": "xp_test"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 400
    assert "1000 XP launch pack" in response.json()["detail"]


def test_create_order_calls_razorpay_and_records_pending_payment(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_client = _FakeRazorpayClient()
    recorded: dict[str, Any] = {}

    monkeypatch.setattr(payments_router, "_razorpay_client", lambda: fake_client)
    monkeypatch.setattr(payments_router, "_record_created_payment", lambda **kwargs: recorded.update(kwargs))

    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 9900, "currency": "INR", "receipt": "xp_123"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200, response.text
    assert response.json() == {"order_id": "order_test_123", "amount": 9900, "currency": "INR"}
    assert fake_client.order.created_payload == {
        "amount": 9900,
        "currency": "INR",
        "receipt": "xp_123",
        "notes": {"user_id": "user-1", "xp_amount": "1000", "product": "myro_xp_launch_pack"},
    }
    assert recorded["user_id"] == "user-1"
    assert recorded["razorpay_order_id"] == "order_test_123"
    assert recorded["amount_paise"] == 9900
    assert recorded["currency"] == "INR"
    assert recorded["xp_amount"] == 1000


def test_verify_payment_requires_all_fields() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/verify-payment",
            json={"razorpay_order_id": "order_test_123", "razorpay_payment_id": "pay_test_123"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 400
    assert "Missing payment verification fields" in response.json()["detail"]


def test_verify_payment_rejects_bad_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        payments_router,
        "_find_payment_by_order",
        lambda *, user_id, razorpay_order_id: {
            "id": "row-1",
            "status": "created",
            "razorpay_payment_id": None,
            "amount_paise": 9900,
            "currency": "INR",
            "xp_amount": 1000,
        },
    )
    monkeypatch.setattr(payments_router, "_mark_payment_verified", lambda **_kwargs: pytest.fail("should not mark paid"))

    with TestClient(app) as client:
        response = client.post(
            "/api/verify-payment",
            json={
                "razorpay_order_id": "order_test_123",
                "razorpay_payment_id": "pay_test_123",
                "razorpay_signature": "not-valid",
            },
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 400
    assert "Signature mismatch" in response.json()["detail"]


def test_verify_payment_credits_xp_after_valid_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    marked: dict[str, Any] = {}

    monkeypatch.setattr(
        payments_router,
        "_find_payment_by_order",
        lambda *, user_id, razorpay_order_id: {
            "id": "row-1",
            "status": "created",
            "razorpay_payment_id": None,
            "amount_paise": 9900,
            "currency": "INR",
            "xp_amount": 1000,
        },
    )
    monkeypatch.setattr(payments_router, "_mark_payment_verified", lambda **kwargs: marked.update(kwargs) or True)

    async def _earn_xp(user_id: str, amount: int) -> int:
        assert user_id == "user-1"
        assert amount == 1000
        return 2200

    monkeypatch.setattr(payments_router.xp_service, "earn_xp", _earn_xp)

    with TestClient(app) as client:
        response = client.post(
            "/api/verify-payment",
            json={
                "razorpay_order_id": "order_test_123",
                "razorpay_payment_id": "pay_test_123",
                "razorpay_signature": _signature("order_test_123", "pay_test_123"),
            },
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "xp_earned": 1000, "new_xp_balance": 2200}
    assert marked["payment_row_id"] == "row-1"
    assert marked["razorpay_payment_id"] == "pay_test_123"


def test_verify_payment_is_idempotent_for_already_verified_order(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        payments_router,
        "_find_payment_by_order",
        lambda *, user_id, razorpay_order_id: {
            "id": "row-1",
            "status": "verified",
            "razorpay_payment_id": "pay_test_123",
            "amount_paise": 9900,
            "currency": "INR",
            "xp_amount": 1000,
        },
    )
    monkeypatch.setattr(payments_router, "_mark_payment_verified", lambda **_kwargs: pytest.fail("should not update twice"))

    async def _get_xp_balance(user_id: str) -> int:
        assert user_id == "user-1"
        return 2200

    async def _earn_xp(user_id: str, amount: int) -> int:
        pytest.fail("should not credit twice")

    monkeypatch.setattr(payments_router.xp_service, "get_xp_balance", _get_xp_balance)
    monkeypatch.setattr(payments_router.xp_service, "earn_xp", _earn_xp)

    with TestClient(app) as client:
        response = client.post(
            "/api/verify-payment",
            json={
                "razorpay_order_id": "order_test_123",
                "razorpay_payment_id": "pay_test_123",
                "razorpay_signature": _signature("order_test_123", "pay_test_123"),
            },
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "xp_earned": 0, "new_xp_balance": 2200}
