from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import payments as payments_router
from app.services import razorpay_gateway, settlement
from app.services.billing_catalogue import by_alias
from tests.settlement_support import COIN_PACK, CoinLedger, InMemoryStore

MYROLOGY = by_alias("myrology")


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
    monkeypatch.setattr(razorpay_gateway.settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(razorpay_gateway.settings, "razorpay_key_secret", "test_secret")
    monkeypatch.setattr(razorpay_gateway.settings, "razorpay_webhook_secret", "whsecret")


def _signature(order_id: str, payment_id: str, secret: str = "test_secret") -> str:
    return hmac.new(secret.encode("utf-8"), f"{order_id}|{payment_id}".encode("utf-8"), hashlib.sha256).hexdigest()


def _order_row(product: Any = COIN_PACK, **overrides: Any) -> dict[str, Any]:
    row = {
        "id": "row-1",
        "user_id": "user-1",
        "razorpay_order_id": "order_test_123",
        "razorpay_payment_id": None,
        "amount_paise": product.price_paise,
        "currency": "INR",
        "product": product.key,
        "status": "created",
        "grant_pending": False,
    }
    row.update(overrides)
    return row


def _use_store(monkeypatch: pytest.MonkeyPatch, rows: list[dict[str, Any]], grants: dict[str, Any]) -> InMemoryStore:
    store = InMemoryStore(rows)
    monkeypatch.setattr(payments_router, "_settlement_store", lambda: store)
    monkeypatch.setattr(payments_router, "_grants", lambda: grants)
    return store


def _post_create(client: TestClient, **body: Any) -> Any:
    return client.post("/api/create-order", json=body, headers={"Authorization": "Bearer token"})


def _post_verify(client: TestClient, order_id: str = "order_test_123", payment_id: str = "pay_test_123") -> Any:
    return client.post(
        "/api/verify-payment",
        json={
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": _signature(order_id, payment_id),
        },
        headers={"Authorization": "Bearer token"},
    )


# ── create-order ────────────────────────────────────────────────────────────


def test_create_order_rejects_amount_not_matching_product() -> None:
    with TestClient(app) as client:
        response = _post_create(client, amount=100, currency="INR", product="apply_pack")
    assert response.status_code == 400
    assert "does not match" in response.json()["detail"]


def test_create_order_rejects_unknown_product() -> None:
    with TestClient(app) as client:
        response = _post_create(client, amount=9900, currency="INR", product="free_lunch")
    assert response.status_code == 400
    assert response.json()["detail"] == "Unknown product"


def test_create_order_calls_razorpay_and_records_pending_payment(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_client = _FakeRazorpayClient()
    recorded: dict[str, Any] = {}
    monkeypatch.setattr(razorpay_gateway, "client", lambda: fake_client)
    monkeypatch.setattr(payments_router, "_record_created_payment", lambda **kwargs: recorded.update(kwargs))

    with TestClient(app) as client:
        response = _post_create(client, amount=19900, currency="INR", product="apply_pack", receipt="ap_123", job_id="job-7")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "order_id": "order_test_123",
        "amount": 19900,
        "currency": "INR",
        "product": "myro_apply_pack",
    }
    payload = fake_client.order.created_payload
    assert payload is not None
    assert payload["amount"] == 19900
    assert payload["receipt"] != "ap_123"
    assert "user-1" not in payload["receipt"]
    assert "notes" not in payload
    assert fake_client.order.received_timeout == razorpay_gateway.ORDER_TIMEOUT_SECONDS
    assert recorded["user_id"] == "user-1"
    assert recorded["razorpay_order_id"] == "order_test_123"
    assert recorded["amount_paise"] == 19900
    assert recorded["product"] is by_alias("apply_pack")
    assert recorded["job_id"] == "job-7"


def test_create_order_myrology_records_entitlement_product(monkeypatch: pytest.MonkeyPatch) -> None:
    recorded: dict[str, Any] = {}
    monkeypatch.setattr(razorpay_gateway, "client", lambda: _FakeRazorpayClient())
    monkeypatch.setattr(payments_router, "_record_created_payment", lambda **kwargs: recorded.update(kwargs))

    with TestClient(app) as client:
        response = _post_create(client, amount=29900, currency="INR", product="myrology")

    assert response.status_code == 200, response.text
    assert response.json()["product"] == "myro_myrology_unlock"
    assert recorded["product"] is MYROLOGY
    assert recorded["product"].coins == 0


def test_create_order_maps_razorpay_auth_failure_to_gateway_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FailingOrderApi:
        def create(self, _payload: dict[str, Any], **_kwargs: Any) -> dict[str, Any]:
            raise razorpay_gateway.razorpay_errors.BadRequestError("Authentication failed")

    class _FailingRazorpayClient:
        order = _FailingOrderApi()

    monkeypatch.setattr(razorpay_gateway, "client", lambda: _FailingRazorpayClient())
    monkeypatch.setattr(
        payments_router, "_record_created_payment", lambda **_kwargs: pytest.fail("should not record failed order")
    )

    with TestClient(app) as client:
        response = _post_create(client, amount=19900, currency="INR", product="apply_pack")

    assert response.status_code == 401
    assert response.json()["detail"] == "Razorpay authentication failed"


def test_the_retired_coin_pack_is_refused_at_create(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(razorpay_gateway, "client", lambda: pytest.fail("no order for a retired product"))
    with TestClient(app) as client:
        response = _post_create(client, amount=9900, currency="INR", product="xp_pack")
    assert response.status_code == 410


def test_create_order_refuses_when_razorpay_is_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(razorpay_gateway.settings, "razorpay_key_secret", "")

    with TestClient(app) as client:
        response = _post_create(client, amount=29900, currency="INR", product="myrology")

    assert response.status_code == 503


def test_razorpay_credentials_trim_quotes_and_spaces(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(razorpay_gateway.settings, "razorpay_key_id", '  "rzp_test_key" ')
    monkeypatch.setattr(razorpay_gateway.settings, "razorpay_key_secret", " 'test_secret' ")

    assert razorpay_gateway.credentials() == ("rzp_test_key", "test_secret")


# ── verify-payment → settle ─────────────────────────────────────────────────


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
    monkeypatch.setattr(payments_router, "_settlement_store", lambda: pytest.fail("no lookup on a bad signature"))

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


def test_verify_payment_grants_coins_once(monkeypatch: pytest.MonkeyPatch) -> None:
    ledger = CoinLedger(balance=1200)
    store = _use_store(monkeypatch, [_order_row()], {COIN_PACK.key: ledger.grant})

    async def _balance(_uid: str) -> int:
        return ledger.balance

    monkeypatch.setattr(payments_router.xp_service, "get_xp_balance", _balance)

    with TestClient(app) as client:
        first = _post_verify(client)
        again = _post_verify(client)

    assert first.status_code == 200, first.text
    assert first.json() == {
        "success": True,
        "coins_earned": 1000,
        "new_coin_balance": 2200,
        "product": "myro_xp_launch_pack",
        "myrology_unlocked": False,
    }
    assert ledger.rows == ["row-1"]
    assert store.row("order_test_123")["grant_pending"] is False

    assert again.status_code == 200
    assert again.json()["coins_earned"] == 0
    assert ledger.rows == ["row-1"]


def test_verify_payment_unlocks_myrology(monkeypatch: pytest.MonkeyPatch) -> None:
    unlocked: list[str] = []

    async def _grant(row: dict[str, Any]) -> None:
        unlocked.append(row["user_id"])

    async def _balance(_uid: str) -> int:
        return 1500

    _use_store(monkeypatch, [_order_row(MYROLOGY)], {MYROLOGY.key: _grant})
    monkeypatch.setattr(payments_router.xp_service, "get_xp_balance", _balance)

    with TestClient(app) as client:
        response = _post_verify(client)

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "coins_earned": 0,
        "new_coin_balance": 1500,
        "product": "myro_myrology_unlock",
        "myrology_unlocked": True,
    }
    assert unlocked == ["user-1"]


def test_verify_payment_answers_202_while_the_grant_is_pending(monkeypatch: pytest.MonkeyPatch) -> None:
    ledger = CoinLedger()
    ledger.fail_next = 1
    store = _use_store(monkeypatch, [_order_row()], {COIN_PACK.key: ledger.grant})

    with TestClient(app) as client:
        response = _post_verify(client)

    assert response.status_code == 202
    assert response.json() == {"outcome": "grant_pending"}
    assert store.row("order_test_123")["grant_pending"] is True


def test_verify_payment_for_someone_elses_order_is_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    _use_store(monkeypatch, [_order_row(user_id="user-2")], {COIN_PACK.key: CoinLedger().grant})

    with TestClient(app) as client:
        response = _post_verify(client)

    assert response.status_code == 400
    assert response.json()["detail"] == "Unknown payment order"


def test_unlock_myrology_sets_interested_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """Paying must set both flags: unlocked (paid routes) AND interested (nav icon)."""
    captured: dict[str, Any] = {}

    class _Eq:
        def eq(self, column: str, value: str) -> "_Eq":
            captured["eq"] = (column, value)
            return self

        def execute(self) -> None:
            return None

    class _Table:
        def update(self, payload: dict[str, Any]) -> _Eq:
            captured["payload"] = payload
            return _Eq()

    class _Admin:
        def table(self, name: str) -> _Table:
            captured["table"] = name
            return _Table()

    monkeypatch.setattr(settlement, "get_supabase_admin", lambda: _Admin())
    settlement.unlock_myrology("user-42")

    assert captured == {
        "table": "user_profiles",
        "payload": {"myrology_unlocked": True, "myrology_interested": True},
        "eq": ("id", "user-42"),
    }


# ── webhook ─────────────────────────────────────────────────────────────────


def _webhook_signature(body: bytes, secret: str = "whsecret") -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _event(kind: str = "payment.captured", order_id: str = "order_test_123", payment_id: str = "pay_test_1") -> bytes:
    return json.dumps(
        {"event": kind, "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id}}}}
    ).encode("utf-8")


def _post_webhook(client: TestClient, body: bytes, signature: str | None = None) -> Any:
    return client.post(
        "/api/razorpay/webhook",
        content=body,
        headers={"X-Razorpay-Signature": signature or _webhook_signature(body)},
    )


def test_webhook_503_when_secret_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(razorpay_gateway.settings, "razorpay_webhook_secret", "")
    with TestClient(app) as client:
        response = _post_webhook(client, _event())
    assert response.status_code == 503


def test_webhook_rejects_bad_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(payments_router, "_settlement_store", lambda: pytest.fail("no lookup on a bad signature"))
    with TestClient(app) as client:
        response = _post_webhook(client, _event(), signature="nope")
    assert response.status_code == 401


def test_webhook_ignores_unhandled_event() -> None:
    body = json.dumps({"event": "order.paid", "payload": {}}).encode("utf-8")
    with TestClient(app) as client:
        response = _post_webhook(client, body)
    assert response.status_code == 200
    assert response.json()["status"] == "ignored"


def test_webhook_captured_settles_once(monkeypatch: pytest.MonkeyPatch) -> None:
    ledger = CoinLedger()
    _use_store(monkeypatch, [_order_row()], {COIN_PACK.key: ledger.grant})

    with TestClient(app) as client:
        first = _post_webhook(client, _event())
        again = _post_webhook(client, _event())

    assert first.json()["status"] == "granted"
    assert again.json()["status"] == "already_granted"
    assert ledger.rows == ["row-1"]


def test_webhook_answers_500_while_the_grant_is_pending_so_razorpay_redelivers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ledger = CoinLedger()
    ledger.fail_next = 1
    _use_store(monkeypatch, [_order_row()], {COIN_PACK.key: ledger.grant})

    with TestClient(app) as client:
        first = _post_webhook(client, _event())
        redelivered = _post_webhook(client, _event())

    assert first.status_code == 500
    assert redelivered.status_code == 200
    assert redelivered.json()["status"] == "granted"
    assert ledger.rows == ["row-1"]


def test_webhook_payment_failed_marks_the_row_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    store = _use_store(monkeypatch, [_order_row()], {})

    with TestClient(app) as client:
        response = _post_webhook(client, _event("payment.failed"))

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert store.row("order_test_123")["status"] == "failed"


def test_webhook_unknown_order_acks(monkeypatch: pytest.MonkeyPatch) -> None:
    _use_store(monkeypatch, [], {})
    with TestClient(app) as client:
        response = _post_webhook(client, _event())
    assert response.status_code == 200
    assert response.json()["status"] == "unknown_order"


# ── catalogue ───────────────────────────────────────────────────────────────


def test_catalogue_offers_the_pack_and_never_a_retired_product(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import human_check

    class _NoOpenChecks:
        def open_due_ats(self) -> list[Any]:
            return []

    monkeypatch.setattr(human_check, "SupabaseHumanCheckStore", lambda: _NoOpenChecks())

    with TestClient(app) as client:
        response = client.get("/api/catalogue")

    assert response.status_code == 200, response.text
    body = response.json()
    aliases = {p["alias"]: p for p in body["products"]}
    assert set(aliases) == {"apply_pack", "myrology", "filing_intake"}
    assert aliases["apply_pack"] == {
        "alias": "apply_pack",
        "price_paise": 19900,
        "coins": 500,
        "human_checks": 1,
        "available": True,
        "unavailable_reason": None,
    }
    assert body["human_check"]["checks_full"] is False
    assert body["human_check"]["linkedin_coins"] == 5000


# ── Where an order came from (ARCHITECTURE_ONE_PREP.md P3) ──────────────────
# `billing_payments` recorded the job a pack was bought for, not the door it was
# bought through, so "did the offer in the room sell anything" had no answer.


def test_create_order_records_the_door_it_came_through(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_client = _FakeRazorpayClient()
    recorded: dict[str, Any] = {}
    monkeypatch.setattr(razorpay_gateway, "client", lambda: fake_client)
    monkeypatch.setattr(payments_router, "_record_created_payment", lambda **kwargs: recorded.update(kwargs))

    with TestClient(app) as client:
        response = _post_create(
            client, amount=19900, currency="INR", product="apply_pack", job_id="job-7", surface="room",
        )

    assert response.status_code == 200, response.text
    assert recorded["surface"] == "room"
    assert recorded["job_id"] == "job-7"


def test_an_order_with_no_door_records_none(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_client = _FakeRazorpayClient()
    recorded: dict[str, Any] = {}
    monkeypatch.setattr(razorpay_gateway, "client", lambda: fake_client)
    monkeypatch.setattr(payments_router, "_record_created_payment", lambda **kwargs: recorded.update(kwargs))

    with TestClient(app) as client:
        response = _post_create(client, amount=19900, currency="INR", product="apply_pack")

    assert response.status_code == 200, response.text
    assert recorded["surface"] is None


def test_an_unknown_door_is_refused_before_any_order() -> None:
    with TestClient(app) as client:
        response = _post_create(client, amount=19900, currency="INR", product="apply_pack", surface="banner")
    assert response.status_code == 422


def test_the_doors_the_api_accepts_are_the_doors_the_table_stores() -> None:
    import re
    from pathlib import Path
    from typing import get_args

    sql = (
        Path(__file__).parents[2] / "database/migrations/20261128120000_billing_payments_surface.sql"
    ).read_text()
    allowed = set(re.findall(r"'([a-z_]+)'", sql.split("check (surface in (", 1)[1].split(")", 1)[0]))
    assert allowed == set(get_args(payments_router.SaleSurface))
