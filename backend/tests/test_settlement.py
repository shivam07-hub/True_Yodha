"""Settlement grants exactly once (ARCHITECTURE_PAYMENTS.md §6 S1).

`settle()` is the test surface. The store is in memory and the grants are
recorded, so nothing here patches a router helper.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any

import pytest

from app.services import settlement
from app.services.billing_catalogue import UnknownProduct, by_alias
from app.services.razorpay_gateway import Arrival, Failure
from tests.settlement_support import CoinLedger, InMemoryStore

COIN_PACK = by_alias("xp_pack")
MYROLOGY = by_alias("myrology")


def _row(product: Any = COIN_PACK, **overrides: Any) -> dict[str, Any]:
    row = {
        "id": "row-1",
        "user_id": "user-1",
        "razorpay_order_id": "order_1",
        "razorpay_payment_id": None,
        "amount_paise": product.price_paise,
        "currency": "INR",
        "product": product.key,
        "status": "created",
        "grant_pending": False,
    }
    row.update(overrides)
    return row


def _checkout(payment_id: str = "pay_1", user_id: str | None = "user-1") -> Arrival:
    return Arrival(order_id="order_1", payment_id=payment_id, source="checkout", user_id=user_id)


def _webhook(payment_id: str = "pay_1") -> Arrival:
    return Arrival(order_id="order_1", payment_id=payment_id, source="webhook")


def _settle(arrival: Arrival, store: InMemoryStore, ledger: CoinLedger) -> settlement.Settlement:
    return asyncio.run(settlement.settle(arrival, store=store, grants={COIN_PACK.key: ledger.grant}))


def test_checkout_first_grants_once_and_the_webhook_finds_it_done() -> None:
    store, ledger = InMemoryStore([_row()]), CoinLedger()

    first = _settle(_checkout(), store, ledger)
    second = _settle(_webhook(), store, ledger)

    assert (first.outcome, first.new_coin_balance) == ("granted", 4000)
    assert second.outcome == "already_granted"
    assert ledger.rows == ["row-1"]
    assert store.row("order_1")["grant_pending"] is False


def test_webhook_first_grants_once_and_checkout_finds_it_done() -> None:
    store, ledger = InMemoryStore([_row()]), CoinLedger()

    assert _settle(_webhook(), store, ledger).outcome == "granted"
    assert _settle(_checkout(), store, ledger).outcome == "already_granted"
    assert ledger.rows == ["row-1"]


def test_duplicate_arrival_is_already_granted() -> None:
    store, ledger = InMemoryStore([_row()]), CoinLedger()

    _settle(_webhook(), store, ledger)
    again = _settle(_webhook(), store, ledger)

    assert again.outcome == "already_granted"
    assert again.new_coin_balance is None
    assert ledger.rows == ["row-1"]


def test_grant_that_raises_stays_pending_and_the_next_arrival_finishes_it() -> None:
    store, ledger = InMemoryStore([_row()]), CoinLedger()
    ledger.fail_next = 1

    first = _settle(_checkout(), store, ledger)
    assert first.outcome == "grant_pending"
    assert store.row("order_1")["status"] == "verified"
    assert store.row("order_1")["grant_pending"] is True
    assert ledger.rows == []

    second = _settle(_webhook(), store, ledger)
    assert second.outcome == "granted"
    assert ledger.rows == ["row-1"]  # one ledger row, not two
    assert store.row("order_1")["grant_pending"] is False


def test_unknown_product_raises() -> None:
    store = InMemoryStore([{**_row(), "product": "myro_free_lunch"}])
    with pytest.raises(UnknownProduct):
        _settle(_checkout(), store, CoinLedger())


def test_a_product_with_no_grant_raises_instead_of_unlocking_something_else() -> None:
    store = InMemoryStore([_row(MYROLOGY)])
    with pytest.raises(UnknownProduct):
        _settle(_checkout(), store, CoinLedger())  # registry holds only the coin pack


def test_amount_mismatch_grants_nothing() -> None:
    store, ledger = InMemoryStore([_row(amount_paise=100)]), CoinLedger()

    result = _settle(_checkout(), store, ledger)

    assert result.outcome == "amount_mismatch"
    assert store.row("order_1")["status"] == "created"
    assert ledger.rows == []


def test_failed_then_captured_still_settles() -> None:
    store, ledger = InMemoryStore([_row()]), CoinLedger()

    asyncio.run(settlement.record_failure(Failure(order_id="order_1", payment_id="pay_0"), store=store))
    assert store.row("order_1")["status"] == "failed"

    assert _settle(_webhook("pay_1"), store, ledger).outcome == "granted"
    assert ledger.rows == ["row-1"]


def test_failure_never_moves_a_verified_row_back() -> None:
    store, ledger = InMemoryStore([_row()]), CoinLedger()
    _settle(_webhook(), store, ledger)

    asyncio.run(settlement.record_failure(Failure(order_id="order_1", payment_id="pay_9"), store=store))

    assert store.row("order_1")["status"] == "verified"


def test_two_concurrent_claims_grant_once() -> None:
    store, ledger = InMemoryStore([_row()]), CoinLedger()
    barrier = threading.Barrier(2)
    outcomes: list[str] = []

    def arrive(arrival: Arrival) -> None:
        barrier.wait()
        outcomes.append(_settle(arrival, store, ledger).outcome)

    threads = [threading.Thread(target=arrive, args=(a,)) for a in (_checkout(), _webhook())]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(outcomes) in (["already_granted", "granted"], ["granted", "granted"])
    assert ledger.rows == ["row-1"]
    assert store.row("order_1")["grant_pending"] is False


def test_checkout_for_another_users_order_is_unknown() -> None:
    store, ledger = InMemoryStore([_row()]), CoinLedger()

    result = _settle(_checkout(user_id="user-2"), store, ledger)

    assert result.outcome == "unknown_order"
    assert store.row("order_1")["status"] == "created"


def test_a_second_payment_on_a_settled_order_grants_nothing_more() -> None:
    store, ledger = InMemoryStore([_row()]), CoinLedger()
    _settle(_webhook("pay_1"), store, ledger)

    result = _settle(_webhook("pay_2"), store, ledger)

    assert result.outcome == "already_granted"
    assert ledger.rows == ["row-1"]


def test_unknown_order_is_reported_not_raised() -> None:
    result = _settle(_webhook(), InMemoryStore([]), CoinLedger())
    assert result.outcome == "unknown_order"


def test_every_order_product_in_the_catalogue_has_a_grant() -> None:
    from app.services import billing_catalogue

    grants = settlement.default_grants()
    for alias in ("apply_pack", "xp_pack", "myrology", "ai_workflow_audit", "filing_intake"):
        product = billing_catalogue.by_alias(alias)
        assert product.key in grants


def test_the_apply_pack_grants_500_coins_and_opens_one_check_on_its_job(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import human_check

    pack = by_alias("apply_pack")
    rewarded: list[dict[str, Any]] = []
    opened: list[dict[str, Any]] = []

    async def _reward(user_id: str, amount: int, action: str, reason: str, **kw: Any) -> int:
        rewarded.append({"user": user_id, "amount": amount, "action": action, **kw})
        return 3500

    def _open(_store: Any, user_id: str, **kw: Any) -> dict[str, Any]:
        opened.append({"user": user_id, **kw})
        return {"id": "check-1"}

    monkeypatch.setattr(settlement.xp_service, "reward", _reward)
    monkeypatch.setattr(human_check, "open_check", _open)
    monkeypatch.setattr(human_check, "SupabaseHumanCheckStore", lambda: object())

    row = {"id": "row-1", "user_id": "u1", "product": pack.key, "job_id": "job-9"}
    balance = asyncio.run(settlement.default_grants()[pack.key](row))

    assert balance == 3500
    assert rewarded == [{"user": "u1", "amount": 500, "action": "apply_pack", "ref_table": "billing_payments", "ref_id": "row-1"}]
    assert opened == [{"user": "u1", "billing_payment_id": "row-1", "job_id": "job-9"}]
    assert (pack.price_paise, pack.coins, pack.human_checks) == (19900, 500, 1)
