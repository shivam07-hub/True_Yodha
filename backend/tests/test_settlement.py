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
    for alias in ("xp_pack", "myrology", "ai_workflow_audit", "filing_intake"):
        product = billing_catalogue.by_alias(alias)
        assert product.billing == "order"
        assert product.key in grants
    assert billing_catalogue.by_alias("job_switch_plan").key not in grants
