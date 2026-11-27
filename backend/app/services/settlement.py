"""Settlement — a payment arrived; grant exactly once (ARCHITECTURE_PAYMENTS.md §3 C).

The checkout verify and the webhook both hand an `Arrival` to `settle`. Whoever
arrives first claims the row and the grant runs; whoever arrives later either
sees the grant finished or finishes it.

The claim flips `verified` and sets `grant_pending` in ONE update, and only a
finished grant clears `grant_pending`. Before this, `verified` was set first and
the grant ran after it, so a grant that failed was never retried — the retry
read `already_verified` and stopped.

Every grant is idempotent per `billing_payments.id`, so two arrivals that both
run it (one claimed, one saw it still pending) change nothing twice.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Protocol

from fastapi.concurrency import run_in_threadpool

from app.database import get_supabase_admin
from app.services import ai_workflow_audit, billing_catalogue, filing_intake, human_check, xp_service
from app.services.billing_catalogue import CURRENCY, Product, UnknownProduct
from app.services.razorpay_gateway import Arrival, Failure

logger = logging.getLogger(__name__)

Outcome = Literal["granted", "already_granted", "grant_pending", "unknown_order", "amount_mismatch"]


@dataclass(frozen=True)
class Settlement:
    outcome: Outcome
    user_id: str | None = None
    product: Product | None = None
    new_coin_balance: int | None = None  # present only when this arrival moved coins


class SettlementStore(Protocol):
    def find_by_order(self, order_id: str) -> dict[str, Any] | None: ...

    def claim(self, row_id: str, payment_id: str) -> bool:
        """created|failed → verified with grant_pending, in one update. True if won."""
        ...

    def finish(self, row_id: str) -> bool:
        """grant_pending true → false. True if this call cleared it."""
        ...

    def mark_failed(self, order_id: str) -> bool:
        """created → failed. True if the row moved."""
        ...


# A grant reads the claimed row and returns the new coin balance when it moved
# coins, else None. It must be idempotent per row id.
Grant = Callable[[dict[str, Any]], Awaitable[int | None]]
Grants = Mapping[str, Grant]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SupabaseSettlementStore:
    def __init__(self, admin: Any | None = None) -> None:
        self._admin = admin or get_supabase_admin()

    def _table(self) -> Any:
        return self._admin.table("billing_payments")

    def find_by_order(self, order_id: str) -> dict[str, Any] | None:
        result = self._table().select("*").eq("razorpay_order_id", order_id).maybe_single().execute()
        return (result.data if result else None) or None

    def claim(self, row_id: str, payment_id: str) -> bool:
        result = (
            self._table()
            .update(
                {
                    "status": "verified",
                    "razorpay_payment_id": payment_id,
                    "verified_at": _now(),
                    "grant_pending": True,
                }
            )
            .eq("id", row_id)
            .in_("status", ["created", "failed"])
            .execute()
        )
        return bool(result.data)

    def finish(self, row_id: str) -> bool:
        result = (
            self._table()
            .update({"grant_pending": False})
            .eq("id", row_id)
            .eq("grant_pending", True)
            .execute()
        )
        return bool(result.data)

    def mark_failed(self, order_id: str) -> bool:
        result = (
            self._table()
            .update({"status": "failed", "failed_at": _now()})
            .eq("razorpay_order_id", order_id)
            .eq("status", "created")
            .execute()
        )
        return bool(result.data)


async def settle(arrival: Arrival, *, store: SettlementStore, grants: Grants) -> Settlement:
    """Grant what `arrival` paid for, exactly once. Raises `UnknownProduct` when
    the row names a product the catalogue or the grant registry does not know."""
    row = await run_in_threadpool(store.find_by_order, arrival.order_id)
    if row is None or (arrival.user_id is not None and str(row.get("user_id")) != arrival.user_id):
        logger.warning("metric settlement.unknown_order source=%s", arrival.source)
        return Settlement("unknown_order")

    product = billing_catalogue.by_key(str(row.get("product") or ""))
    grant = grants.get(product.key)
    if grant is None:
        raise UnknownProduct(product.key)
    user_id = str(row["user_id"])

    currency = str(row.get("currency") or "").strip().upper()
    if int(row.get("amount_paise") or 0) != product.price_paise or currency != CURRENCY:
        logger.error("metric settlement.amount_mismatch product=%s", product.key)
        return Settlement("amount_mismatch", user_id, product)

    if row.get("status") in ("created", "failed"):
        won = await run_in_threadpool(store.claim, str(row["id"]), arrival.payment_id)
        if won:
            row = {**row, "status": "verified", "razorpay_payment_id": arrival.payment_id, "grant_pending": True}
        else:
            row = await run_in_threadpool(store.find_by_order, arrival.order_id) or row

    if row.get("razorpay_payment_id") != arrival.payment_id:
        # A second captured payment on an order another payment already settled:
        # the buyer paid twice. Nothing more is granted; the money needs a person.
        logger.warning("metric settlement.second_payment product=%s source=%s", product.key, arrival.source)
        return Settlement("already_granted", user_id, product)

    if not row.get("grant_pending"):
        return Settlement("already_granted", user_id, product)

    try:
        balance = await grant(row)
    except Exception:  # noqa: BLE001 — classified: the row stays pending and the next arrival finishes it
        logger.error("metric settlement.grant_pending product=%s source=%s", product.key, arrival.source, exc_info=True)
        return Settlement("grant_pending", user_id, product)

    finished = await run_in_threadpool(store.finish, str(row["id"]))
    return Settlement("granted" if finished else "already_granted", user_id, product, balance)


async def record_failure(failure: Failure, *, store: SettlementStore) -> None:
    """Razorpay said an attempt failed. A row already verified never moves back,
    and a failed row that is captured later still settles."""
    moved = await run_in_threadpool(store.mark_failed, failure.order_id)
    logger.info("metric settlement.payment_failed moved=%s", moved)


# ── grants ──────────────────────────────────────────────────────────────────


def unlock_myrology(user_id: str) -> None:
    """Paying implies interest — set both so the payer gets the nav icon without
    hunting the opt-in toggle. `myrology_unlocked` still guards the paid routes."""
    get_supabase_admin().table("user_profiles").update(
        {"myrology_unlocked": True, "myrology_interested": True}
    ).eq("id", user_id).execute()


async def _grant_coin_pack(row: dict[str, Any]) -> int:
    product = billing_catalogue.by_key(str(row["product"]))
    return await xp_service.reward(
        str(row["user_id"]),
        product.coins,
        "coin_pack",
        "purchase",
        ref_table="billing_payments",
        ref_id=str(row["id"]),
    )


async def _grant_apply_pack(row: dict[str, Any]) -> int:
    """500 coins and one Human Check, both idempotent on the payment row. The
    check arrives queued on the job it was bought for, else unassigned."""
    user_id, row_id = str(row["user_id"]), str(row["id"])
    product = billing_catalogue.by_key(str(row["product"]))
    balance = await xp_service.reward(
        user_id, product.coins, "apply_pack", "purchase", ref_table="billing_payments", ref_id=row_id
    )
    await run_in_threadpool(
        human_check.open_check,
        human_check.SupabaseHumanCheckStore(),
        user_id,
        billing_payment_id=row_id,
        job_id=row.get("job_id"),
    )
    return balance


async def _grant_myrology(row: dict[str, Any]) -> None:
    await run_in_threadpool(unlock_myrology, str(row["user_id"]))


async def _grant_audit(row: dict[str, Any]) -> None:
    await run_in_threadpool(ai_workflow_audit.activate_audit, str(row["user_id"]), str(row["id"]))


async def _grant_full_pack(row: dict[str, Any]) -> int:
    """The ₹599 pack (ENG5, §10.3): 500 coins, the CV check (queued on the job it
    was bought for, else held), a check held for the LinkedIn rewrite, the search
    call, and the filing step marked paid. Every step is idempotent on the
    payment row, so a retry after a failure finishes the rest."""
    user_id, row_id = str(row["user_id"]), str(row["id"])
    product = billing_catalogue.by_key(str(row["product"]))
    balance = await xp_service.reward(
        user_id, product.coins, "full_pack", "purchase", ref_table="billing_payments", ref_id=row_id
    )
    store = human_check.SupabaseHumanCheckStore()
    await run_in_threadpool(
        human_check.open_check, store, user_id, billing_payment_id=row_id, job_id=row.get("job_id")
    )
    for slot in human_check.PACK_SLOTS:
        await run_in_threadpool(
            human_check.open_pack_check, store, user_id, pack_payment_id=row_id, pack_slot=slot
        )
    await run_in_threadpool(filing_intake.mark_paid, user_id)
    return balance


def default_grants() -> dict[str, Grant]:
    """Order products only. The ₹199/month engagement is a subscription and
    keeps its own path until S5 deletes it."""
    return {
        billing_catalogue.by_alias("apply_pack").key: _grant_apply_pack,
        billing_catalogue.by_alias("xp_pack").key: _grant_coin_pack,
        billing_catalogue.by_alias("myrology").key: _grant_myrology,
        billing_catalogue.by_alias("ai_workflow_audit").key: _grant_audit,
        billing_catalogue.by_alias("filing_intake").key: _grant_full_pack,
    }
