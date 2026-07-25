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
        self.received_timeout: int | None = None

    def create(self, payload: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        self.created_payload = payload
        timeout = kwargs.get("timeout")
        if isinstance(timeout, int):
            self.received_timeout = timeout
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


def test_create_order_rejects_amount_not_matching_product() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 100, "currency": "INR", "receipt": "xp_test"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 400
    assert "does not match" in response.json()["detail"]


def test_create_order_rejects_unknown_product() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 9900, "currency": "INR", "product": "free_lunch"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unknown product"


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
    assert response.json() == {
        "order_id": "order_test_123",
        "amount": 9900,
        "currency": "INR",
        "product": "myro_xp_launch_pack",
    }
    assert fake_client.order.created_payload["amount"] == 9900
    assert fake_client.order.created_payload["currency"] == "INR"
    assert fake_client.order.created_payload["receipt"] != "xp_123"
    assert "user-1" not in fake_client.order.created_payload["receipt"]
    assert "notes" not in fake_client.order.created_payload
    assert fake_client.order.received_timeout == payments_router.RAZORPAY_ORDER_TIMEOUT_SECONDS
    assert recorded["user_id"] == "user-1"
    assert recorded["razorpay_order_id"] == "order_test_123"
    assert recorded["amount_paise"] == 9900
    assert recorded["currency"] == "INR"
    assert recorded["xp_amount"] == 1000
    assert recorded["product_key"] == "myro_xp_launch_pack"


def test_create_order_myrology_records_entitlement_product(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_client = _FakeRazorpayClient()
    recorded: dict[str, Any] = {}

    monkeypatch.setattr(payments_router, "_razorpay_client", lambda: fake_client)
    monkeypatch.setattr(payments_router, "_record_created_payment", lambda **kwargs: recorded.update(kwargs))

    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 29900, "currency": "INR", "product": "myrology", "receipt": "myro_1"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "order_id": "order_test_123",
        "amount": 29900,
        "currency": "INR",
        "product": "myro_myrology_unlock",
    }
    assert "notes" not in fake_client.order.created_payload
    assert recorded["xp_amount"] == 0
    assert recorded["product_key"] == "myro_myrology_unlock"


def test_create_order_maps_razorpay_auth_failure_to_gateway_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FailingOrderApi:
        def create(self, _payload: dict[str, Any], **_kwargs: Any) -> dict[str, Any]:
            raise payments_router.razorpay_errors.BadRequestError("Authentication failed")

    class _FailingRazorpayClient:
        order = _FailingOrderApi()

    monkeypatch.setattr(payments_router, "_razorpay_client", lambda: _FailingRazorpayClient())
    monkeypatch.setattr(payments_router, "_record_created_payment", lambda **_kwargs: pytest.fail("should not record failed order"))

    with TestClient(app) as client:
        response = client.post(
            "/api/create-order",
            json={"amount": 9900, "currency": "INR", "receipt": "xp_123"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Razorpay authentication failed"


def test_razorpay_credentials_trim_quotes_and_spaces(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_key_id", "  \"rzp_test_key\" ")
    monkeypatch.setattr(payments_router.settings, "razorpay_key_secret", " 'test_secret' ")

    key_id, key_secret = payments_router._razorpay_credentials()

    assert key_id == "rzp_test_key"
    assert key_secret == "test_secret"


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
    assert response.json() == {
        "success": True,
        "coins_earned": 1000,
        "new_coin_balance": 2200,
        "product": "myro_xp_launch_pack",
        "myrology_unlocked": False,
        "job_switch_plan_active": False,
    }
    assert marked["payment_row_id"] == "row-1"
    assert marked["razorpay_payment_id"] == "pay_test_123"


def test_verify_payment_unlocks_myrology_entitlement(monkeypatch: pytest.MonkeyPatch) -> None:
    unlocked: list[str] = []

    monkeypatch.setattr(
        payments_router,
        "_find_payment_by_order",
        lambda *, user_id, razorpay_order_id: {
            "id": "row-9",
            "status": "created",
            "razorpay_payment_id": None,
            "amount_paise": 29900,
            "currency": "INR",
            "xp_amount": 0,
            "product": "myro_myrology_unlock",
        },
    )
    monkeypatch.setattr(payments_router, "_mark_payment_verified", lambda **_kwargs: True)
    monkeypatch.setattr(payments_router, "_unlock_myrology", lambda user_id: unlocked.append(user_id))

    async def _get_xp_balance(user_id: str) -> int:
        return 1500

    async def _earn_xp(user_id: str, amount: int) -> int:
        pytest.fail("entitlement purchase must not credit XP")

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
    assert response.json() == {
        "success": True,
        "coins_earned": 0,
        "new_coin_balance": 1500,
        "product": "myro_myrology_unlock",
        "myrology_unlocked": True,
        "job_switch_plan_active": False,
    }
    assert unlocked == ["user-1"]


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
    assert response.json() == {
        "success": True,
        "coins_earned": 0,
        "new_coin_balance": 2200,
        "product": "myro_xp_launch_pack",
        "myrology_unlocked": False,
        "job_switch_plan_active": False,
    }


def test_unlock_myrology_sets_interested_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """Paying must set both flags: unlocked (paid routes) AND interested (nav icon)."""
    captured: dict[str, Any] = {}

    class _Exec:
        def execute(self) -> None:
            return None

    class _Eq(_Exec):
        def eq(self, column: str, value: str) -> "_Eq":
            captured["eq"] = (column, value)
            return self

    class _Table:
        def update(self, payload: dict[str, Any]) -> _Eq:
            captured["payload"] = payload
            return _Eq()

    class _Admin:
        def table(self, name: str) -> _Table:
            captured["table"] = name
            return _Table()

    monkeypatch.setattr(payments_router, "get_supabase_admin", lambda: _Admin())

    payments_router._unlock_myrology("user-42")

    assert captured["table"] == "user_profiles"
    assert captured["payload"] == {"myrology_unlocked": True, "myrology_interested": True}
    assert captured["eq"] == ("id", "user-42")


# ── Razorpay webhook (G1 — server-side reconciliation) ──────────────────────

import json  # noqa: E402


def _webhook_signature(body: bytes, secret: str = "whsecret") -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _captured_event(order_id: str = "order_test_123", payment_id: str = "pay_test_1") -> bytes:
    return json.dumps(
        {
            "event": "payment.captured",
            "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id}}},
        }
    ).encode("utf-8")


def test_webhook_503_when_secret_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_webhook_secret", "")
    body = _captured_event()
    with TestClient(app) as client:
        response = client.post(
            "/api/razorpay/webhook", content=body, headers={"X-Razorpay-Signature": _webhook_signature(body)}
        )
    assert response.status_code == 503


def test_webhook_rejects_bad_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_webhook_secret", "whsecret")
    monkeypatch.setattr(
        payments_router, "_find_payment_by_order_id", lambda _oid: pytest.fail("must not look up on bad sig")
    )
    body = _captured_event()
    with TestClient(app) as client:
        response = client.post("/api/razorpay/webhook", content=body, headers={"X-Razorpay-Signature": "nope"})
    assert response.status_code == 401


def test_webhook_ignores_unhandled_event(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_webhook_secret", "whsecret")
    body = json.dumps({"event": "payment.failed", "payload": {}}).encode("utf-8")
    with TestClient(app) as client:
        response = client.post(
            "/api/razorpay/webhook", content=body, headers={"X-Razorpay-Signature": _webhook_signature(body)}
        )
    assert response.status_code == 200
    assert response.json()["status"] == "ignored"


def test_webhook_reconciles_entitlement_and_unlocks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_webhook_secret", "whsecret")
    monkeypatch.setattr(
        payments_router,
        "_find_payment_by_order_id",
        lambda _oid: {
            "id": "row-1",
            "user_id": "user-9",
            "status": "created",
            "razorpay_payment_id": None,
            "amount_paise": 29900,
            "currency": "INR",
            "xp_amount": 0,
            "product": "myro_myrology_unlock",
        },
    )
    marked: dict[str, Any] = {}
    monkeypatch.setattr(payments_router, "_mark_payment_verified", lambda **kw: marked.update(kw) or True)
    fulfilled: dict[str, Any] = {}

    async def _apply(user_id: str, product: Any, payment: dict[str, Any]) -> int:
        fulfilled.update({"user_id": user_id, "product": product.key})
        return 0

    monkeypatch.setattr(payments_router, "_apply_fulfilment", _apply)

    body = _captured_event(payment_id="pay_xyz")
    with TestClient(app) as client:
        response = client.post(
            "/api/razorpay/webhook", content=body, headers={"X-Razorpay-Signature": _webhook_signature(body)}
        )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "reconciled"
    assert marked["razorpay_payment_id"] == "pay_xyz"
    assert fulfilled == {"user_id": "user-9", "product": "myro_myrology_unlock"}


def test_webhook_idempotent_when_already_verified(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_webhook_secret", "whsecret")
    monkeypatch.setattr(
        payments_router,
        "_find_payment_by_order_id",
        lambda _oid: {
            "id": "row-1",
            "user_id": "user-9",
            "status": "verified",
            "razorpay_payment_id": "pay_xyz",
            "amount_paise": 29900,
            "currency": "INR",
            "xp_amount": 0,
            "product": "myro_myrology_unlock",
        },
    )
    monkeypatch.setattr(payments_router, "_mark_payment_verified", lambda **_kw: pytest.fail("must not re-mark"))

    body = _captured_event()
    with TestClient(app) as client:
        response = client.post(
            "/api/razorpay/webhook", content=body, headers={"X-Razorpay-Signature": _webhook_signature(body)}
        )
    assert response.status_code == 200
    assert response.json()["status"] == "already_verified"


def test_webhook_lost_cas_does_not_double_fulfil(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_webhook_secret", "whsecret")
    monkeypatch.setattr(
        payments_router,
        "_find_payment_by_order_id",
        lambda _oid: {
            "id": "row-1",
            "user_id": "user-9",
            "status": "created",
            "razorpay_payment_id": None,
            "amount_paise": 29900,
            "currency": "INR",
            "xp_amount": 0,
            "product": "myro_myrology_unlock",
        },
    )
    # CAS loses the race (browser verify won concurrently) -> 0 rows updated.
    monkeypatch.setattr(payments_router, "_mark_payment_verified", lambda **_kw: False)
    monkeypatch.setattr(
        payments_router, "_apply_fulfilment", lambda *_a, **_k: pytest.fail("must not fulfil after losing CAS")
    )

    body = _captured_event()
    with TestClient(app) as client:
        response = client.post(
            "/api/razorpay/webhook", content=body, headers={"X-Razorpay-Signature": _webhook_signature(body)}
        )
    assert response.status_code == 200
    assert response.json()["status"] == "already_verified"


def test_webhook_unknown_order_acks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router.settings, "razorpay_webhook_secret", "whsecret")
    monkeypatch.setattr(payments_router, "_find_payment_by_order_id", lambda _oid: None)
    body = _captured_event()
    with TestClient(app) as client:
        response = client.post(
            "/api/razorpay/webhook", content=body, headers={"X-Razorpay-Signature": _webhook_signature(body)}
        )
    assert response.status_code == 200
    assert response.json()["status"] == "unknown_order"
